/** LLD-08 exact InfrastructureExplorerQuery filters. No local fuzzy matching,
 * SQL, synthetic ancestors, or client-side truncation of owner results.
 * The owner query remains authoritative and cursor pagination stays intact.
 */
export type ExplorerFilters=Readonly<{
  customerOrgId:string;siteId:string;nodeKind:string;lifecycle:string;
}>;
export const EMPTY_EXPLORER_FILTERS:ExplorerFilters=Object.freeze({
  customerOrgId:'',siteId:'',nodeKind:'',lifecycle:'',
});
export const EXPLORER_KINDS=['site','room','rack','cloud_deployment','network_element','containment'] as const;
export const EXPLORER_LIFECYCLES=['active','archived'] as const;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const keys=['limit','cursor','customer_org_id','site_id','node_kind','lifecycle'] as const;
function normalized(input:ExplorerFilters):ExplorerFilters|null {
  if(!input||Object.keys(input).length!==4
    ||Object.keys(input).some(key=>!['customerOrgId','siteId','nodeKind','lifecycle'].includes(key))
    ||Object.values(input).some(value=>typeof value!=='string'))return null;
  const values={customerOrgId:input.customerOrgId.trim(),siteId:input.siteId.trim(),
    nodeKind:input.nodeKind,lifecycle:input.lifecycle};
  if(values.customerOrgId!==''&&!uuid.test(values.customerOrgId)
    ||values.siteId!==''&&!uuid.test(values.siteId)
    ||values.nodeKind!==''&&!(EXPLORER_KINDS as readonly string[]).includes(values.nodeKind)
    ||values.lifecycle!==''&&!(EXPLORER_LIFECYCLES as readonly string[]).includes(values.lifecycle))return null;
  return values;
}
/** Applies closed, canonical filters to the first owner page. Returns null for
 * bad identities instead of falling back to an accidentally unfiltered read.
 */
export function buildExplorerQuery(input:ExplorerFilters):string|null {
  const value=normalized(input);
  if(!value)return null;
  const params=new URLSearchParams({limit:'200'});
  if(value.customerOrgId)params.set('customer_org_id',value.customerOrgId);
  if(value.siteId)params.set('site_id',value.siteId);
  if(value.nodeKind)params.set('node_kind',value.nodeKind);
  if(value.lifecycle)params.set('lifecycle',value.lifecycle);
  return '/api/v1/infrastructure/tree?'+params.toString();
}
/** Parse a returned/restored owner path into editable filter values.
 * The cursor is deliberately NOT retained in form fields; it belongs only
 * to the current accepted page intent.
 */
export function readExplorerFilters(path:string):ExplorerFilters|null {
  if(typeof path!=='string'||new TextEncoder().encode(path).length>4096
    ||!path.startsWith('/api/v1/infrastructure/tree?'))return null;
  try {
    const url=new URL(path,'http://127.0.0.1');
    if(url.origin!=='http://127.0.0.1'||url.hash||url.pathname!=='/api/v1/infrastructure/tree'
      ||url.searchParams.get('limit')!=='200'
      ||[...url.searchParams.keys()].some(key=>!(keys as readonly string[]).includes(key))
      ||keys.some(key=>url.searchParams.getAll(key).length>1))return null;
    const raw={customerOrgId:url.searchParams.get('customer_org_id')??'',
      siteId:url.searchParams.get('site_id')??'',
      nodeKind:url.searchParams.get('node_kind')??'',
      lifecycle:url.searchParams.get('lifecycle')??''};
    // Optional keys must be absent rather than present with empty values.
    if(['customer_org_id','site_id','node_kind','lifecycle'].some(key=>
      url.searchParams.has(key)&&url.searchParams.get(key)===''))return null;
    const value=normalized(raw);
    // Restored queries are already normalized: reject whitespace or aliases.
    return value&&Object.keys(raw).every(key=>raw[key as keyof ExplorerFilters]===value[key as keyof ExplorerFilters])
      ?value:null;
  }catch{return null;}
}
