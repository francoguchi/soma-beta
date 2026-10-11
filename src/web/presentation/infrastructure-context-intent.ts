import type {OwnerPageHistory} from '../state/owner-page-history.js';

export type InfrastructureContextKind='room'|'cloud_deployment';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const hash=/^[0-9a-f]{64}$/u;
const cursorKeys=['filter_fingerprint','last_key_tuple','null_order','query_id','sort_registry_id','version'] as const;
const safeSecond=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=8640000000000;

/** The currently implemented LLD-08 history GET; no Room/Cloud current-detail GET is implied. */
export function firstInfrastructureContextHistory(id:string,kind:InfrastructureContextKind):string {
  if(!uuid.test(id)||!['room','cloud_deployment'].includes(kind))
    throw new Error('Invalid Infrastructure context identity');
  return '/api/v1/infrastructure/history?target_kind='+kind+'&target_id='+id+'&limit=5';
}

/** Closed, bounded session return intent containing *only owner query paths*.
 * The owner response (including target existence) must always be fetched anew.
 * Each cursor is still bound to the owning target digest by the response verifier.
 */
export function validInfrastructureContextHistory(
  value:unknown,id:string,kind:InfrastructureContextKind,
):value is OwnerPageHistory {
  if(!value||typeof value!=='object'||Array.isArray(value)||!uuid.test(id)
    ||!['room','cloud_deployment'].includes(kind))return false;
  const entry=value as Record<string,unknown>;
  if(Object.keys(entry).length!==3||!['paths','first','page'].every(k=>Object.hasOwn(entry,k))
    ||!Array.isArray(entry.paths)||entry.paths.length<1||entry.paths.length>51
    ||!Number.isSafeInteger(entry.first)||Number(entry.first)<0
    ||!Number.isSafeInteger(entry.page)||Number(entry.page)<Number(entry.first)
    ||Number(entry.page)>=Number(entry.first)+entry.paths.length
    ||Number(entry.first)+entry.paths.length>Number.MAX_SAFE_INTEGER)return false;
  const base=firstInfrastructureContextHistory(id,kind);
  let digest:string|null=null;let prior:[number,string]|null=null;
  for(let index=0;index<entry.paths.length;index++) {
    const path=entry.paths[index],ordinal=Number(entry.first)+index;
    if(typeof path!=='string'||new TextEncoder().encode(path).length>4096
      ||(ordinal===0&&path!==base)
      ||(ordinal>0&&!path.startsWith(base+'&cursor=')))return false;
    if(ordinal===0)continue;
    try {
      const url=new URL(path,'http://127.0.0.1');
      if(url.pathname!=='/api/v1/infrastructure/history'||url.hash
        ||url.searchParams.get('target_kind')!==kind||url.searchParams.get('target_id')!==id
        ||url.searchParams.get('limit')!=='5'
        ||[...url.searchParams.keys()].some(k=>!['target_kind','target_id','limit','cursor'].includes(k))
        ||['target_kind','target_id','limit','cursor'].some(k=>url.searchParams.getAll(k).length!==1))return false;
      const raw=url.searchParams.get('cursor');
      if(!raw)return false;
      const cursor:unknown=JSON.parse(raw);
      if(!cursor||typeof cursor!=='object'||Array.isArray(cursor))return false;
      const c=cursor as Record<string,unknown>;
      if(Object.keys(c).length!==6||Object.keys(c).some(k=>!cursorKeys.includes(k as typeof cursorKeys[number]))
        ||c.version!==1||c.query_id!=='InfrastructureHistoryQuery'
        ||c.sort_registry_id!=='InfrastructureHistoryQuery_ORDER_V1'
        ||c.null_order!=='NOT_APPLICABLE'||typeof c.filter_fingerprint!=='string'
        ||!hash.test(c.filter_fingerprint)||!Array.isArray(c.last_key_tuple)
        ||c.last_key_tuple.length!==2||!safeSecond(c.last_key_tuple[0])
        ||typeof c.last_key_tuple[1]!=='string'||!uuid.test(c.last_key_tuple[1]))return false;
      const key:[number,string]=[c.last_key_tuple[0],c.last_key_tuple[1]];
      if(digest!==null&&digest!==c.filter_fingerprint)return false;
      if(prior&&(key[0]>prior[0]||key[0]===prior[0]&&key[1]>=prior[1]))return false;
      digest=c.filter_fingerprint as string;prior=key;
    }catch{return false;}
  }
  return true;
}
