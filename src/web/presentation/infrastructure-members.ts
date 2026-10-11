import type {OwnerPageHistory} from '../state/owner-page-history.js';

export type MembersKind='room'|'cloud_deployment';
export type MembersSection='Summary'|'Members'|'History';
export type RoomCloudState=Readonly<{section:MembersSection;members:OwnerPageHistory|null}>;
type Cursor=Readonly<{version:1;query_id:'InfrastructureRelationshipChildrenQuery';
  sort_registry_id:'InfrastructureRelationshipChildrenQuery_ORDER_V1';
  last_key_tuple:readonly [string];filter_fingerprint:string;null_order:'NOT_APPLICABLE'}>;
export type Child=Readonly<{kind:'rack'|'network_element';id:string;label:string;
  lifecycle:'active'|'archived';site_id:string;parent_id:string;
  relationship:'room_racks'|'cloud_assigned_elements'}>;
export type MembersPage=Readonly<{items:readonly Child[];next_cursor:Cursor|null}>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha=/^[0-9a-f]{64}$/u;
const query='InfrastructureRelationshipChildrenQuery';
const relation=(kind:MembersKind)=>kind==='room'?'room_racks':'cloud_assigned_elements';
const childKind=(kind:MembersKind)=>kind==='room'?'rack':'network_element';
const closed=(input:object,fields:readonly string[])=>Object.keys(input).length===fields.length&&
  Object.keys(input).every(k=>fields.includes(k));
const cursorKeys=['version','query_id','sort_registry_id','last_key_tuple','filter_fingerprint','null_order'] as const;
const validCursor=(value:unknown):value is Cursor=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||!closed(value,cursorKeys))return false;
  const c=value as Record<string,unknown>;
  return c.version===1&&c.query_id===query&&c.sort_registry_id===query+'_ORDER_V1'
    &&c.null_order==='NOT_APPLICABLE'&&typeof c.filter_fingerprint==='string'&&sha.test(c.filter_fingerprint)
    &&Array.isArray(c.last_key_tuple)&&c.last_key_tuple.length===1&&uuid.test(c.last_key_tuple[0]);
};
export function firstMembersPath(kind:MembersKind,id:string):string {
  if(!['room','cloud_deployment'].includes(kind)||!uuid.test(id))throw new Error('Invalid direct-member identity');
  return '/api/v1/infrastructure/related-children?parent_kind='+kind+'&parent_id='+id+
    '&relationship='+relation(kind)+'&limit=100';
}
function cursorAt(path:string,kind:MembersKind,id:string):Cursor|null {
  const first=firstMembersPath(kind,id);
  if(path===first)return null;
  if(typeof path!=='string'||new TextEncoder().encode(path).length>4096||!path.startsWith(first+'&cursor='))
    throw new Error('Foreign Infrastructure direct-member query');
  const url=new URL(path,'http://127.0.0.1');
  if(url.hash||url.pathname!=='/api/v1/infrastructure/related-children'
    ||url.searchParams.get('parent_kind')!==kind||url.searchParams.get('parent_id')!==id
    ||url.searchParams.get('relationship')!==relation(kind)||url.searchParams.get('limit')!=='100'
    ||[...url.searchParams.keys()].some(k=>!['parent_kind','parent_id','relationship','limit','cursor'].includes(k))
    ||['parent_kind','parent_id','relationship','limit','cursor'].some(k=>url.searchParams.getAll(k).length!==1))
    throw new Error('Foreign direct-member cursor query');
  let item:unknown;
  try {item=JSON.parse(url.searchParams.get('cursor')??'');} catch {throw new Error('Invalid direct-member cursor');}
  if(!validCursor(item))throw new Error('Invalid direct-member cursor');
  return item;
}
/** The browser retains only bounded closed cursor paths and section choice.
 * No owner child DTO may be copied into history or navigation state.
 */
export function validMembersHistory(value:unknown,kind:MembersKind,id:string):value is OwnerPageHistory {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const v=value as Record<string,unknown>;
  if(!closed(v,['paths','first','page'])||!Array.isArray(v.paths)||v.paths.length<1||v.paths.length>51
    ||!Number.isSafeInteger(v.first)||Number(v.first)<0||!Number.isSafeInteger(v.page)
    ||Number(v.page)<Number(v.first)||Number(v.page)>=Number(v.first)+v.paths.length
    ||Number(v.first)+v.paths.length>Number.MAX_SAFE_INTEGER)return false;
  let previous:string|null=null,digest:string|null=null;
  for(let index=0;index<v.paths.length;index++){
    const path=v.paths[index];
    if(typeof path!=='string')return false;
    if(Number(v.first)+index===0&&path!==firstMembersPath(kind,id))return false;
    let c:Cursor|null;
    try {c=cursorAt(path,kind,id);} catch {return false;}
    if(Number(v.first)+index>0&&!c)return false;
    if(c){
      if(previous!==null&&c.last_key_tuple[0]<=previous)return false;
      if(digest!==null&&digest!==c.filter_fingerprint)return false;
      previous=c.last_key_tuple[0];digest=c.filter_fingerprint;
    }
  }
  return true;
}
export function validRoomCloudState(value:unknown,kind:MembersKind,id:string):value is RoomCloudState {
  if(!value||typeof value!=='object'||Array.isArray(value)||!closed(value,['section','members']))return false;
  const v=value as Record<string,unknown>;
  return ['Summary','Members','History'].includes(v.section as string)&&
    (v.members===null?v.section!=='Members':validMembersHistory(v.members,kind,id));
}
export function verifyMembersPage(page:MembersPage,kind:MembersKind,id:string,siteId:string,digest:string,path:string):void {
  if(!uuid.test(id)||!uuid.test(siteId)||!sha.test(digest)||!page||typeof page!=='object'
    ||Array.isArray(page)||!closed(page,['items','next_cursor'])||!Array.isArray(page.items)
    ||page.items.length>100)throw new Error('Invalid direct-member owner page');
  const seek=cursorAt(path,kind,id);
  if(seek&&seek.filter_fingerprint!==digest)throw new Error('Foreign direct-member cursor fingerprint');
  let previous=seek?.last_key_tuple[0]??null;
  for(const item of page.items){
    if(!item||typeof item!=='object'||Array.isArray(item)
      ||!closed(item,['kind','id','label','lifecycle','site_id','parent_id','relationship'])
      ||item.kind!==childKind(kind)||!uuid.test(item.id)||item.parent_id!==id
      ||item.relationship!==relation(kind)||item.site_id!==siteId
      ||!['active','archived'].includes(item.lifecycle)||typeof item.label!=='string'
      ||!item.label.trim()||new TextEncoder().encode(item.label).length>(kind==='room'?640:800)
      ||(previous!==null&&item.id<=previous))throw new Error('Invalid direct-member owner row');
    previous=item.id;
  }
  if(page.next_cursor!==null&&(!validCursor(page.next_cursor)||page.items.length!==100
    ||page.next_cursor.filter_fingerprint!==digest||page.next_cursor.last_key_tuple[0]!==previous))
    throw new Error('Invalid direct-member continuation');
}
export function nextMembersPath(kind:MembersKind,id:string,cursor:Cursor):string {
  if(!validCursor(cursor))throw new Error('Invalid direct-member continuation');
  const path=firstMembersPath(kind,id)+'&cursor='+encodeURIComponent(JSON.stringify(cursor));
  if(new TextEncoder().encode(path).length>4096)throw new Error('Oversized direct-member continuation');
  return path;
}
export function membersDigestInput(kind:MembersKind,id:string){
  firstMembersPath(kind,id);
  return {parent_kind:kind,parent_id:id,relationship:relation(kind),lifecycle:null,limit:100} as const;
}
