import {useContext,useEffect,useState} from 'react';
import {OwnerProjection,OwnerReturnRefresh} from '../components/OwnerProjection';
import {filterFingerprint} from '../data/query-controller';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';

type Row=Readonly<{owning_rfc_id:string;role:'root'|'subordinate';
  device_reference_id:string;operational_name:string;revision:number;
  registered_network_element_id:string|null}>;
type Cursor=Readonly<{version:1;query_id:'GetRfcDeviceContextForBranch';
  sort_registry_id:'RFC_BRANCH_DEVICE_REFERENCE_ORDER_V1';
  last_key_tuple:readonly [string,string];filter_fingerprint:string;
  null_order:'not_applicable'}>;
type Page=Readonly<{items:readonly Row[];continuation:Cursor|null}>;
const uuid4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha256=/^[0-9a-f]{64}$/u;

function acceptedPage(value:Page,rootId:string,fingerprint:string):Page {
  if(!value||!Array.isArray(value.items)||value.items.length>25||!Object.hasOwn(value,'continuation'))
    throw new Error('Invalid RFC branch Device Reference owner page');
  let previous='';
  for(const row of value.items){
    if(!row||!uuid4.test(row.owning_rfc_id)||!uuid4.test(row.device_reference_id)
      ||!['root','subordinate'].includes(row.role)
      ||(row.role==='root')!==(row.owning_rfc_id===rootId)
      ||typeof row.operational_name!=='string'
      ||new TextEncoder().encode(row.operational_name).length===0
      ||new TextEncoder().encode(row.operational_name).length>1024
      ||/[\r\n\u0000]/u.test(row.operational_name)
      ||!Number.isSafeInteger(row.revision)||row.revision<1
      ||row.registered_network_element_id!==null&&!uuid4.test(row.registered_network_element_id))
      throw new Error('Invalid RFC branch Device Reference row');
    const key=row.owning_rfc_id+':'+row.device_reference_id;
    if(key<=previous)throw new Error('RFC branch Device Reference owner order is invalid');
    previous=key;
  }
  const c=value.continuation;
  if(c!==null&&(!c||c.version!==1||c.query_id!=='GetRfcDeviceContextForBranch'
    ||c.sort_registry_id!=='RFC_BRANCH_DEVICE_REFERENCE_ORDER_V1'
    ||c.null_order!=='not_applicable'
    ||!Array.isArray(c.last_key_tuple)||c.last_key_tuple.length!==2
    ||!uuid4.test(c.last_key_tuple[0])||!uuid4.test(c.last_key_tuple[1])
    ||c.last_key_tuple.join(':')!==previous
    ||!sha256.test(c.filter_fingerprint)||c.filter_fingerprint!==fingerprint))
    throw new Error('Invalid RFC branch Device Reference continuation');
  return value;
}

/** LLD-03 GetRfcDeviceContextForBranch; never infers subordinate links from the root. */
export function RfcBranchDevices({rootId}:{rootId:string}) {
  const first='/api/v1/tickets/rfcs/'+encodeURIComponent(rootId)+'/branch-devices?limit=25';
  const [history,setHistory]=useState(()=>initialOwnerPage(first));
  const [selected,setSelected]=useState<string|null>(null);
  const [fingerprint,setFingerprint]=useState<string|null>(null);
  const generation=useContext(OwnerReturnRefresh);
  useEffect(()=>{
    let active=true;setFingerprint(null);
    void filterFingerprint({schema:'SOMA_RFC_BRANCH_DEVICE_REFERENCE_FILTER_V1',root_rfc_id:rootId})
      .then(value=>{if(active)setFingerprint(value);});
    return()=>{active=false;};
  },[rootId]);
  return <section aria-label="RFC branch Device References" className="soma-v2-rfc-links">
    <h2>Branch Device References</h2>
    <p>Accepted direct links for the governing root and each subordinate, with each actual owning RFC identified separately. This is not inherited Service Request or physical-unit membership.</p>
    {fingerprint===null?<p role="status">Loading accepted branch Device Reference context.</p>:
      <OwnerProjection<Page> key={generation} path={ownerPagePath(history)} render={raw=>{
        const page=acceptedPage(raw,rootId,fingerprint);
        const chosen=page.items.find(row=>row.owning_rfc_id+':'+row.device_reference_id===selected)??null;
        return <>
          <div className="soma-v2-sr-table-viewport"><table className="soma-v2-sr-table">
            <thead><tr><th scope="col">Operational name</th><th scope="col">Owning RFC</th>
              <th scope="col">Branch role</th><th scope="col">Revision</th></tr></thead>
            <tbody>{page.items.map(row=><tr key={row.owning_rfc_id+':'+row.device_reference_id}
              data-selected={chosen?.owning_rfc_id===row.owning_rfc_id&&chosen?.device_reference_id===row.device_reference_id?'true':'false'}>
              <td><button type="button" className="soma-v2-sr-rowselect"
                aria-pressed={chosen?.owning_rfc_id===row.owning_rfc_id&&chosen?.device_reference_id===row.device_reference_id}
                onClick={()=>setSelected(row.owning_rfc_id+':'+row.device_reference_id)}>{row.operational_name}</button></td>
              <td>{row.owning_rfc_id}</td><td>{row.role}</td><td>{row.revision}</td>
            </tr>)}</tbody>
          </table></div>
          {page.items.length===0&&<p role="status">No active Device Reference links in this RFC branch.</p>}
          {page.items.length>0&&!chosen&&<p role="status">Select a branch Device Reference to see its accepted owner and identity.</p>}
          <div className="soma-v2-sr-pager">
            <button type="button" disabled={history.page===history.first}
              onClick={()=>{setHistory(previousOwnerPage);setSelected(null);}}>Previous page</button>
            <button type="button" disabled={page.continuation===null}
              onClick={()=>{
                if(!page.continuation)return;
                const next=first+'&cursor='+encodeURIComponent(JSON.stringify(page.continuation));
                setHistory(old=>nextOwnerPage(old,next,first+'&cursor='));setSelected(null);
              }}>Next page</button>
          </div>
          {chosen&&<aside aria-label="Selected branch Device Reference" className="soma-v2-sr-details">
            <div className="soma-v2-sr-details-title"><strong>{chosen.operational_name}</strong></div>
            <div className="soma-v2-sr-details-grid">
              <span>Device Reference ID</span><span>{chosen.device_reference_id}</span>
              <span>Direct owning RFC</span><span>{chosen.owning_rfc_id}</span>
              <span>Branch role</span><strong>{chosen.role}</strong>
              <span>Revision</span><strong>{chosen.revision}</strong>
              <span>Network Element resolution</span><span>{chosen.registered_network_element_id??'Not supplied by this owner read'}</span>
            </div>
          </aside>}
        </>;
      }}/>}
  </section>;
}
