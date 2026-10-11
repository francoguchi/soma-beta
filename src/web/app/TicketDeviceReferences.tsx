import {useContext, useEffect, useState} from 'react';
import {OwnerProjection,OwnerReturnRefresh} from '../components/OwnerProjection';
import {filterFingerprint} from '../data/query-controller';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';
import {TicketDeviceResolutionEvidence} from './TicketDeviceResolutionEvidence';

type TicketType='service_request'|'rfc';
type DeviceRow=Readonly<{
  device_reference_id:string;operational_name:string;revision:number;
  registered_network_element_id:string|null
}>;
type DeviceCursor=Readonly<{
  version:1;query_id:'ListTicketDeviceReferences';
  sort_registry_id:'TICKET_DEVICE_REFERENCE_ID_ASC_V1';
  last_key_tuple:readonly [string];filter_fingerprint:string;
  null_order:'not_applicable'
}>;
type DevicePage=Readonly<{items:readonly DeviceRow[];continuation:DeviceCursor|null}>;
const uuid4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const hex64=/^[0-9a-f]{64}$/u;

function acceptedPage(page:DevicePage,fingerprint:string):DevicePage {
  if(!page||!Array.isArray(page.items)||page.items.length>25
    ||!Object.hasOwn(page,'continuation'))throw new Error('Invalid ticket Device Reference page');
  const seen=new Set<string>();
  let previous='';
  for(const row of page.items){
    if(!row||typeof row!=='object'||!uuid4.test(row.device_reference_id)
      ||row.device_reference_id<=previous||seen.has(row.device_reference_id)
      ||typeof row.operational_name!=='string'
      ||row.operational_name.length===0||new TextEncoder().encode(row.operational_name).length>1024
      ||/[\r\n\u0000]/u.test(row.operational_name)
      ||!Number.isSafeInteger(row.revision)||row.revision<1
      ||row.registered_network_element_id!==null&&!uuid4.test(row.registered_network_element_id))
      throw new Error('Invalid ticket Device Reference item');
    seen.add(row.device_reference_id);previous=row.device_reference_id;
  }
  const c=page.continuation;
  if(c!==null&&(!c||c.version!==1||c.query_id!=='ListTicketDeviceReferences'
    ||c.sort_registry_id!=='TICKET_DEVICE_REFERENCE_ID_ASC_V1'
    ||c.null_order!=='not_applicable'||!Array.isArray(c.last_key_tuple)
    ||c.last_key_tuple.length!==1||!uuid4.test(c.last_key_tuple[0])
    ||c.last_key_tuple[0]!==previous||!hex64.test(c.filter_fingerprint)
    ||c.filter_fingerprint!==fingerprint||page.items.length===0))
    throw new Error('Invalid ticket Device Reference continuation');
  return page;
}

/** LLD-03 owner read: direct, active ticket links only. No invented Infrastructure registration. */
export function TicketDeviceReferences({id,type}:{id:string;type:TicketType}) {
  const first='/api/v1/tickets/'+type+'/'+encodeURIComponent(id)+'/devices?limit=25';
  const [history,setHistory]=useState(()=>initialOwnerPage(first));
  const [selected,setSelected]=useState<string|null>(null);
  const [fingerprint,setFingerprint]=useState<string|null>(null);
  const returnGeneration=useContext(OwnerReturnRefresh);
  useEffect(()=>{
    let active=true;setFingerprint(null);
    void filterFingerprint({schema:'SOMA_TICKET_DEVICE_REFERENCE_FILTER_V1',ticket_type:type,ticket_id:id})
      .then(value=>{if(active)setFingerprint(value);});
    return()=>{active=false;};
  },[type,id]);
  const label=type==='rfc'?'RFC direct Device References':'SR Device References';
  return <section aria-label={label} className="soma-v2-rfc-links">
    <h2>{label}</h2>
    <p>{type==='rfc'
      ? 'Only active Device References linked directly to this RFC. Root/subordinate inherited context is not implied.'
      : 'Active Device References linked to this Service Request. These are operational labels, not registered Network Element identities.'}</p>
    {fingerprint===null?<p role="status">Loading accepted Device Reference context.</p>:
      <OwnerProjection<DevicePage> key={returnGeneration} path={ownerPagePath(history)} render={raw=>{
        const page=acceptedPage(raw,fingerprint);
        const chosen=page.items.find(row=>row.device_reference_id===selected)??null;
        return <>
          <div className="soma-v2-sr-table-viewport">
            <table className="soma-v2-sr-table"><thead><tr>
              <th scope="col">Operational name</th><th scope="col">Device Reference identity</th>
              <th scope="col">Revision</th>
            </tr></thead><tbody>
              {page.items.map(row=><tr key={row.device_reference_id}
                data-selected={chosen?.device_reference_id===row.device_reference_id?'true':'false'}>
                <td><button type="button" className="soma-v2-sr-rowselect"
                  aria-pressed={chosen?.device_reference_id===row.device_reference_id}
                  onClick={()=>setSelected(row.device_reference_id)}>{row.operational_name}</button></td>
                <td>{row.device_reference_id}</td><td>{row.revision}</td>
              </tr>)}
            </tbody></table>
          </div>
          {page.items.length===0&&<p role="status">No directly linked active Device References in this page.</p>}
          {page.items.length>0&&!chosen&&<p role="status">Select a Device Reference to inspect accepted details.</p>}
          <div className="soma-v2-sr-pager">
            <button type="button" disabled={history.page===history.first}
              onClick={()=>{setHistory(previousOwnerPage);setSelected(null);}}>Previous page</button>
            <button type="button" disabled={page.continuation===null}
              onClick={()=>{
                const cursor=page.continuation;if(cursor===null)return;
                const next=first+'&cursor='+encodeURIComponent(JSON.stringify(cursor));
                setHistory(old=>nextOwnerPage(old,next,first+'&cursor='));setSelected(null);
              }}>Next page</button>
          </div>
          {chosen&&<aside aria-label="Selected Device Reference" className="soma-v2-sr-details">
            <div className="soma-v2-sr-details-title"><strong>{chosen.operational_name}</strong></div>
            <div className="soma-v2-sr-details-grid">
              <span>Device Reference ID</span><span>{chosen.device_reference_id}</span>
              <span>Accepted revision</span><strong>{chosen.revision}</strong>
              <span>Infrastructure resolution</span><span>{chosen.registered_network_element_id
                ??'No accepted Network Element resolution supplied'}</span>
            </div>
            <p>A Device Reference does not establish a physical unit, installed component, or Network Element registration.</p>
            <TicketDeviceResolutionEvidence key={chosen.device_reference_id}
              deviceId={chosen.device_reference_id} revision={chosen.revision}
              ticketResolution={chosen.registered_network_element_id}/>
          </aside>}
        </>;
      }}/>}
  </section>;
}
