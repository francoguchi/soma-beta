/** Existing LLD-08 InstalledComponentQuery filter contract. Only explicitly
 * supplied exact owner match keys are sent; these are not fuzzy label search.
 */
export type ComponentFilters=Readonly<{state:string;bomKey:string;slotKey:string}>;
export const EMPTY_COMPONENT_FILTERS:ComponentFilters=Object.freeze({state:'',bomKey:'',slotKey:''});
export const COMPONENT_STATES=['installed','removed','unknown'] as const;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const keys=['limit','cursor','state','bom_key','slot_match_key'] as const;
const bounded=(value:string,limit:number)=>new TextEncoder().encode(value).length<=limit;
function valid(filters:ComponentFilters):boolean {
  if(!filters||typeof filters!=='object'||Array.isArray(filters))return false;
  const props=Object.keys(filters);
  if(props.length!==3||props.some(key=>!['state','bomKey','slotKey'].includes(key)))return false;
  const {state,bomKey,slotKey}=filters;
  return typeof state==='string'&&typeof bomKey==='string'&&typeof slotKey==='string'
    &&(state===''||(COMPONENT_STATES as readonly string[]).includes(state))
    &&bounded(bomKey,640)&&bounded(slotKey,384);
}
export function buildComponentQuery(id:string,filters:ComponentFilters):string|null {
  if(!uuid.test(id)||!valid(filters))return null;
  const params=new URLSearchParams({limit:'200'});
  if(filters.state)params.set('state',filters.state);
  if(filters.bomKey)params.set('bom_key',filters.bomKey);
  if(filters.slotKey)params.set('slot_match_key',filters.slotKey);
  return '/api/v1/infrastructure/network-elements/'+id+'/components?'+params.toString();
}
export function readComponentFilters(path:string,id:string):ComponentFilters|null {
  if(!uuid.test(id)||typeof path!=='string'||new TextEncoder().encode(path).length>4096
    ||!path.startsWith('/api/v1/infrastructure/network-elements/'+id+'/components?'))return null;
  try{
    const url=new URL(path,'http://127.0.0.1');
    if(url.hash||url.origin!=='http://127.0.0.1'
      ||url.pathname!=='/api/v1/infrastructure/network-elements/'+id+'/components'
      ||url.searchParams.get('limit')!=='200'
      ||[...url.searchParams.keys()].some(key=>!(keys as readonly string[]).includes(key))
      ||keys.some(key=>url.searchParams.getAll(key).length>1)
      ||['state','bom_key','slot_match_key'].some(key=>url.searchParams.has(key)
        &&url.searchParams.get(key)===''))return null;
    const filters={state:url.searchParams.get('state')??'',
      bomKey:url.searchParams.get('bom_key')??'',
      slotKey:url.searchParams.get('slot_match_key')??''};
    return valid(filters)?filters:null;
  }catch{return null;}
}
