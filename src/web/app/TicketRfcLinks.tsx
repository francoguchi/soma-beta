import {useState} from 'react';
import {OwnerProjection} from '../components/OwnerProjection';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';

const uuid4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const rfcNo=/^NC[0-9]{14}$/;
type RfcLink=Readonly<{
  sr_rfc_link_id:string;rfc_id:string;rfc_no:string;local_archive_state:'active'|'archived';
  hierarchy_role:'root'|'standalone'|'subordinate';
  opened_at_utc:number;reason_category:string|null;
}>;
type LinkCursor=Readonly<{version:1;sort_registry_id:'SR_RFC_LINK_OPENED_ID_DESC_V1';
  service_request_id:string;opened_at_utc:number;sr_rfc_link_id:string}>;
type LinkPage=Readonly<{service_request_id:string;items:readonly RfcLink[];
  total_count_at_read:number;sort_registry_id:'SR_RFC_LINK_OPENED_ID_DESC_V1';
  continuation:LinkCursor|null}>;
const instant=(n:number)=>new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'2-digit'}).format(new Date(n*1000));
function accepted(raw:LinkPage,id:string):LinkPage{
  if(!raw||raw.service_request_id!==id||!Array.isArray(raw.items)||raw.items.length>25
    ||!Number.isSafeInteger(raw.total_count_at_read)||raw.total_count_at_read<0
    ||raw.sort_registry_id!=='SR_RFC_LINK_OPENED_ID_DESC_V1')throw new Error('Invalid SR RFC relationship page');
  const seen=new Set<string>();
  for(const item of raw.items){
    if(!item||!uuid4.test(item.sr_rfc_link_id)||seen.has(item.sr_rfc_link_id)
      ||!uuid4.test(item.rfc_id)||!rfcNo.test(item.rfc_no)
      ||!['active','archived'].includes(item.local_archive_state)
      ||!['root','standalone','subordinate'].includes(item.hierarchy_role)
      ||!Number.isSafeInteger(item.opened_at_utc)||item.opened_at_utc<0
      ||item.reason_category!==null&&(typeof item.reason_category!=='string'||item.reason_category.length>150))
      throw new Error('Invalid accepted SR–RFC relationship');
    seen.add(item.sr_rfc_link_id);
  }
  const next=raw.continuation;
  if(next!==null&&(!next||next.version!==1||next.sort_registry_id!=='SR_RFC_LINK_OPENED_ID_DESC_V1'
    ||next.service_request_id!==id||!Number.isSafeInteger(next.opened_at_utc)||next.opened_at_utc<0
    ||!uuid4.test(next.sr_rfc_link_id)||!raw.items.length
    ||raw.items.at(-1)?.sr_rfc_link_id!==next.sr_rfc_link_id
    ||raw.items.at(-1)?.opened_at_utc!==next.opened_at_utc))throw new Error('Invalid SR–RFC owner continuation');
  return raw;
}
export function TicketRfcLinks({id,navigate}:{id:string;navigate:(next:string)=>void}){
  const first='/api/v1/tickets/service-requests/'+encodeURIComponent(id)+'/rfcs?limit=25';
  const [history,setHistory]=useState(()=>initialOwnerPage(first));
  const [selected,setSelected]=useState<string|null>(null);
  return <section className="soma-v2-rfc-links" aria-label="Linked RFCs">
    <h2>Related RFCs</h2>
    <p>Accepted active SR–RFC relationships; unlinked history is not included here.</p>
    <OwnerProjection<LinkPage> path={ownerPagePath(history)} render={value=>{
      const page=accepted(value,id);
      const current=selected===null?null:page.items.find(x=>x.sr_rfc_link_id===selected)??null;
      return <>
        <p>{page.total_count_at_read} active relationship(s) at read · page {history.page+1}</p>
        <div className="soma-v2-sr-table-viewport">
          <table className="soma-v2-sr-table"><thead><tr><th scope="col">RFC</th><th scope="col">Hierarchy</th>
            <th scope="col">Local archive</th><th scope="col">Linked</th></tr></thead>
            <tbody>{page.items.map(link=><tr key={link.sr_rfc_link_id}
              data-selected={current?.sr_rfc_link_id===link.sr_rfc_link_id?'true':'false'}>
              <td><button type="button" className="soma-v2-sr-rowselect"
                aria-pressed={current?.sr_rfc_link_id===link.sr_rfc_link_id}
                onClick={()=>setSelected(link.sr_rfc_link_id)}>{link.rfc_no}</button></td>
              <td>{link.hierarchy_role}</td><td>{link.local_archive_state}</td><td>{instant(link.opened_at_utc)}</td>
            </tr>)}</tbody></table>
        </div>
        {page.items.length===0&&<p role="status">No current linked RFCs for this Service Request.</p>}
        {page.items.length>0&&!current&&<p role="status">Select a linked RFC to inspect its relationship.</p>}
        <div className="soma-v2-sr-pager">
          <button type="button" disabled={history.page===history.first} onClick={()=>{
            setHistory(previousOwnerPage);setSelected(null);}}>Previous page</button>
          <button type="button" disabled={!page.continuation} onClick={()=>{
            if(!page.continuation)return;
            const next=first+'&cursor='+encodeURIComponent(JSON.stringify(page.continuation));
            setHistory(old=>nextOwnerPage(old,next,first+'&cursor='));
            setSelected(null);
          }}>Next page</button>
        </div>
        {current&&<aside className="soma-v2-sr-details" aria-label="Selected RFC relationship">
          <div className="soma-v2-sr-details-title"><strong>LINK / {current.rfc_no}</strong>
            <button type="button" onClick={()=>navigate('/tickets/rfc/'+encodeURIComponent(current.rfc_id))}>Open RFC workbench ↗</button>
          </div>
          <div className="soma-v2-sr-details-grid">
            <span>RFC identity</span><span>{current.rfc_no}</span>
            <span>Link reason</span><span>{current.reason_category??'Not reported'}</span>
            <span>Link opened</span><span>{instant(current.opened_at_utc)}</span>
            <span>Local archive</span><span>{current.local_archive_state}</span>
          </div>
        </aside>}
      </>;
    }}/>
  </section>;
}
