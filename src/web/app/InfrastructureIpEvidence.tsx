import {useEffect,useState} from 'react';
import {OwnerProjection} from '../components/OwnerProjection';
import {filterFingerprint} from '../data/query-controller';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const whole=(x:unknown)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
type Row=Readonly<{network_element_ip_id:string;network_element_id:string;site_id:string;is_primary:boolean}>;
type Cursor=Readonly<{version:1;query_id:'IpCandidateQuery';sort_registry_id:'IpCandidateQuery_ORDER_V1';
  null_order:'NOT_APPLICABLE';last_key_tuple:readonly [string,string];filter_fingerprint:string}>;
type Page=Readonly<{items:readonly Row[];next_cursor:Cursor|null;exact_count:number}>;
const first=(ip:string)=>'/api/v1/infrastructure/ip-candidates?canonical_address='+encodeURIComponent(ip)+'&limit=25';
function validate(page:Page,hash:string,ip:string):void{
  if(typeof ip!=='string'||ip.length===0||new TextEncoder().encode(ip).length>256
    ||!page||!Array.isArray(page.items)||page.items.length>25
    ||!whole(page.exact_count)||page.exact_count<page.items.length
    ||!Object.hasOwn(page,'next_cursor'))
    throw new Error('Invalid IP candidate owner projection');
  let last:readonly [string,string]|null=null;
  const seen=new Set<string>();
  for(const item of page.items){
    if(!item||!uuid.test(item.network_element_ip_id)||!uuid.test(item.network_element_id)
      ||!uuid.test(item.site_id)||typeof item.is_primary!=='boolean'
      ||seen.has(item.network_element_ip_id)
      ||last&&(item.network_element_id<last[0]||
        item.network_element_id===last[0]&&item.network_element_ip_id<=last[1]))
      throw new Error('Invalid IP owner candidate or ordering');
    seen.add(item.network_element_ip_id);
    last=[item.network_element_id,item.network_element_ip_id];
  }
  const c=page.next_cursor;
  if(c!==null&&(!c||!last||page.items.length!==25
    ||c.version!==1||c.query_id!=='IpCandidateQuery'
    ||c.sort_registry_id!=='IpCandidateQuery_ORDER_V1'
    ||c.null_order!=='NOT_APPLICABLE'||c.filter_fingerprint!==hash
    ||!Array.isArray(c.last_key_tuple)||c.last_key_tuple.length!==2
    ||c.last_key_tuple[0]!==last[0]||c.last_key_tuple[1]!==last[1]
    ||Object.keys(c).sort().join(',')!==
      'filter_fingerprint,last_key_tuple,null_order,query_id,sort_registry_id,version'))
    throw new Error('Invalid IP candidate continuation');
}
/** The read is deliberately expanded beneath a current NE primary IP.
 * Candidates are descriptive address reuse evidence, never reachability proof.
 */
export function InfrastructureIpEvidence({address,elementId}:{address:string;elementId:string}){
  const [opened,setOpened]=useState(false);
  const [hash,setHash]=useState<string|null>(null);
  const [history,setHistory]=useState(()=>initialOwnerPage(first(address)));
  useEffect(()=>{
    let live=true;
    void filterFingerprint({canonical_address:address})
      .then(digest=>{if(live)setHash(digest);}).catch(()=>{if(live)setHash(null);});
    return()=>{live=false;};
  },[address]);
  return <section aria-label="IP reuse evidence controls">
    <button type="button" aria-expanded={opened} onClick={()=>setOpened(v=>!v)}>
      {opened?'Hide':'Inspect'} primary IP reuse evidence
    </button>
    {opened&&<section aria-label="IP reuse evidence" className="soma-v2-rfc-links">
      <h4>Primary IP address candidates</h4>
      <p>Exact canonical address: {address}. Candidate appearances across Network Elements are
        descriptive. They do not establish connectivity, routing, duplication policy or reachable hosts.</p>
      {hash===null?<p role="status">Preparing IP owner filter.</p>:
        <OwnerProjection<Page> path={ownerPagePath(history)} render={page=>{
          validate(page,hash,address);
          const selected=page.items.some(item=>item.network_element_id===elementId);
          return <>
            <p>Owner-reported active address matches: {page.exact_count}. Current page: {page.items.length}.</p>
            {page.items.length===0&&<p role="status">No active matching IP identities on this page.</p>}
            {page.items.length>0&&<div className="soma-v2-sr-table-viewport" data-scroll-owner="x">
              <table className="soma-v2-sr-table"><caption>IP identity candidates</caption>
                <thead><tr><th scope="col">IP identity</th><th scope="col">Network Element</th>
                  <th scope="col">Site</th><th scope="col">Primary</th></tr></thead>
                <tbody>{page.items.map(item=><tr key={item.network_element_ip_id}>
                  <td>{item.network_element_ip_id}</td>
                  <td>{item.network_element_id===elementId?'Selected NE: ':''}{item.network_element_id}</td>
                  <td>{item.site_id}</td><td>{item.is_primary?'Yes':'No'}</td>
                </tr>)}</tbody>
              </table>
            </div>}
            {!selected&&page.items.length>0&&
              <p>The selected NE is not included in this page; remaining matches may be on other pages.</p>}
            <div className="soma-v2-sr-pager">
              <button type="button" disabled={history.page===history.first}
                onClick={()=>setHistory(previousOwnerPage)}>Previous page</button>
              <span>Page {history.page+1}</span>
              <button type="button" disabled={page.next_cursor===null}
                onClick={()=>{
                  if(page.next_cursor===null)return;
                  const next=first(address)+'&cursor='+encodeURIComponent(JSON.stringify(page.next_cursor));
                  setHistory(old=>nextOwnerPage(old,next,first(address)+'&cursor='));
                }}>Next page</button>
            </div>
          </>;
        }}/>}
      <p>No IP assignment, primary promotion or mutation authority exists in this inspector.</p>
    </section>}
  </section>;
}
