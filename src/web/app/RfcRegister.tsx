import {useState} from 'react';
import {OwnerProjection} from '../components/OwnerProjection';
import {isExactRfcIdentity} from '../state/rfc-identity';
import {nextOwnerPage, initialOwnerPage, ownerPagePath, previousOwnerPage} from '../state/owner-page-history';

type RfcRow=Readonly<{
  rfc_id:string;rfc_no:string;revision:number;updated_at_utc:number;
  local_archive_state:'active'|'archived';hierarchy_role:'standalone'|'root'|'subordinate';
  subordinate_count:number;direct_service_request_count:number;customer_org_id:string|null;
  source_summary:string|null;source_summary_truncated:boolean;
  source_status:string|null;source_status_truncated:boolean;
  source_status_class:'unknown'|'pre_implement'|'implement_eligible'|'terminal_closed'|'terminal_cancelled';
}>;
type RfcIdentityPoint=Readonly<{rfc_id:string;rfc_no:string;revision:number;
  hierarchy_role:string;local_archive_state:string;warnings:readonly string[]}>;
type RfcCursor=Readonly<{version:1;sort_registry_id:'RFC_UPDATED_ID_DESC_V1';updated_at_utc:number;rfc_id:string}>;
type RfcPage=Readonly<{
  items:readonly RfcRow[];total_count_at_read:number;
  sort_registry_id:'RFC_UPDATED_ID_DESC_V1';continuation:RfcCursor|null;
}>;
const uuid4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const number=/^NC[0-9]{14}$/;
const first='/api/v1/tickets/rfcs?limit=25';
const safeText=(value:string|null,cut:boolean)=>(value??'Not reported')+(cut?'… (truncated)':'');
const time=(seconds:number)=>new Intl.DateTimeFormat(undefined,{
  year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'
}).format(new Date(seconds*1000));

function acceptPage(data:RfcPage):RfcPage {
  if(!data||!Array.isArray(data.items)||data.items.length>25||!Number.isSafeInteger(data.total_count_at_read)
    ||data.total_count_at_read<0||data.sort_registry_id!=='RFC_UPDATED_ID_DESC_V1')
    throw new Error('Invalid RFC owner collection');
  const seen=new Set<string>();
  for(const row of data.items){
    if(!row||!uuid4.test(row.rfc_id)||seen.has(row.rfc_id)||!number.test(row.rfc_no)
      ||!Number.isSafeInteger(row.revision)||row.revision<1
      ||!Number.isSafeInteger(row.updated_at_utc)||row.updated_at_utc<0
      ||!['active','archived'].includes(row.local_archive_state)
      ||!['standalone','root','subordinate'].includes(row.hierarchy_role)
      ||!Number.isSafeInteger(row.subordinate_count)||row.subordinate_count<0
      ||!Number.isSafeInteger(row.direct_service_request_count)||row.direct_service_request_count<0
      ||row.customer_org_id!==null&&!uuid4.test(row.customer_org_id)
      ||row.source_summary!==null&&(typeof row.source_summary!=='string'||row.source_summary.length>512)
      ||row.source_status!==null&&(typeof row.source_status!=='string'||row.source_status.length>96)
      ||typeof row.source_summary_truncated!=='boolean'||typeof row.source_status_truncated!=='boolean'
      ||row.source_summary_truncated&&row.source_summary===null
      ||row.source_status_truncated&&row.source_status===null
      ||!['unknown','pre_implement','implement_eligible','terminal_closed','terminal_cancelled'].includes(row.source_status_class))
      throw new Error('Invalid RFC owner row');
    seen.add(row.rfc_id);
  }
  const c=data.continuation;
  if(c!==null&&(!c||c.version!==1||c.sort_registry_id!=='RFC_UPDATED_ID_DESC_V1'
    ||!Number.isSafeInteger(c.updated_at_utc)||c.updated_at_utc<0||!uuid4.test(c.rfc_id)
    ||data.items.length===0||data.items.at(-1)?.rfc_id!==c.rfc_id
    ||data.items.at(-1)?.updated_at_utc!==c.updated_at_utc))throw new Error('Invalid RFC cursor');
  return data;
}

export function RfcRegister({navigate}:{navigate:(path:string)=>void}){
  const [history,setHistory]=useState(()=>initialOwnerPage(first));
  const [selected,setSelected]=useState<string|null>(null);
  const [refresh,setRefresh]=useState(0);
  const [exactInput,setExactInput]=useState('');
  const [exactQuery,setExactQuery]=useState<string|null>(null);
  return <section className="soma-v2-rfc-register" aria-label="RFC register">
    <div className="soma-v2-sr-register-header">
      <div><h2>RFCs · Register</h2><p>Canonical identities · current local archive state · updated newest first</p></div>
      <span className="soma-v2-sr-owner-tag">LLD-03 / OWNER READ</span>
    </div>
    <div className="soma-v2-sr-register-actions">
      <button type="button" onClick={()=>{setHistory(initialOwnerPage(first));setSelected(null);setRefresh(n=>n+1);}}>Refresh from latest</button>
    </div>
    <OwnerProjection<RfcPage> path={ownerPagePath(history)} refreshKey={refresh} render={value=>{
      const page=acceptPage(value);
      const opened=selected===null?null:page.items.find(item=>item.rfc_id===selected)??null;
      return <>
        <div className="soma-v2-sr-register-meta"><span>{page.total_count_at_read} RFC(s) at read</span>
          <span>Page {history.page+1} · {page.items.length} records shown</span></div>
        <div className="soma-v2-sr-table-viewport" data-scroll-owner="x">
          <table className="soma-v2-sr-table">
            <thead><tr><th scope="col">RFC</th><th scope="col">Local archive</th>
              <th scope="col">Hierarchy</th><th scope="col">Source status</th><th scope="col">Summary</th>
              <th scope="col">Updated</th></tr></thead>
            <tbody>{page.items.map(row=><tr key={row.rfc_id} data-selected={opened?.rfc_id===row.rfc_id?'true':'false'}>
              <td><button className="soma-v2-sr-rowselect" type="button"
                aria-pressed={opened?.rfc_id===row.rfc_id} onClick={()=>setSelected(row.rfc_id)}>{row.rfc_no}</button></td>
              <td>{row.local_archive_state}</td><td>{row.hierarchy_role}</td>
              <td>{safeText(row.source_status,row.source_status_truncated)}</td>
              <td>{safeText(row.source_summary,row.source_summary_truncated)}</td>
              <td>{time(row.updated_at_utc)}</td></tr>)}</tbody>
          </table>
        </div>
        {!page.items.length&&(page.total_count_at_read===0?
          <div className="soma-v2-register-empty" role="status">
            <span className="soma-v2-register-empty-code">REGISTER / EMPTY</span>
            <h3>No RFC identities registered</h3>
            <p>The RFC owner currently reports no records. Source imports and creation controls are still pending UI composition; nothing is simulated.</p>
            <p>When RFC identities are accepted by Beta, they will appear here with their canonical hierarchy and archive state.</p>
          </div>:
          <p role="status">No RFCs on this page. Refresh from latest to revisit the current register.</p>)}
        {page.items.length>0&&!opened&&<p className="soma-v2-sr-selection-prompt" role="status">
          Select an RFC to inspect its details and hierarchy context.</p>}
        <div className="soma-v2-sr-pager">
          <button type="button" disabled={history.page===history.first}
            onClick={()=>{setHistory(previousOwnerPage);setSelected(null);}}>Previous page</button>
          <button type="button" disabled={!page.continuation}
            onClick={()=>{
              if(!page.continuation)return;
              const next=first+'&cursor='+encodeURIComponent(JSON.stringify(page.continuation));
              setHistory(old=>nextOwnerPage(old,next,'/api/v1/tickets/rfcs?limit=25&cursor='));
              setSelected(null);
            }}>Next page</button>
        </div>
        {opened&&<aside aria-label="Selected RFC details" className="soma-v2-sr-details">
          <div className="soma-v2-sr-details-title"><strong>DETAILS / {opened.rfc_no}</strong>
            <button type="button" onClick={()=>navigate('/tickets/rfc/'+encodeURIComponent(opened.rfc_id))}>Open RFC workbench ↗</button></div>
          <div className="soma-v2-sr-details-grid">
            <span>Hierarchy</span><span>{opened.hierarchy_role}</span>
            <span>Subordinates</span><strong>{opened.subordinate_count}</strong>
            <span>Direct SRs</span><strong>{opened.direct_service_request_count}</strong>
            <span>Local archive</span><span>{opened.local_archive_state}</span>
            <span>Source class</span><span>{opened.source_status_class}</span>
            <span>Canonical Customer</span><span>{opened.customer_org_id??'Unresolved'}</span>
            <span>Accepted revision</span><strong>{opened.revision}</strong>
          </div>
        </aside>}
      </>;
    }}/>
    <div className="soma-v2-ticket-toolbar">
      <div><h2>Direct RFC identity lookup</h2><p>Exact RFC number · no fuzzy matching</p></div>
    </div>
    <form className="soma-v2-ticket-search" onSubmit={event=>{
      event.preventDefault();if(isExactRfcIdentity(exactInput))setExactQuery(exactInput);
    }}>
      <label htmlFor="soma-v2-rfc-lookup">RFC number (NC followed by 14 digits)</label>
      <div className="soma-v2-ticket-search-controls">
        <input id="soma-v2-rfc-lookup" value={exactInput} placeholder="NC20261010000001"
          maxLength={16} spellCheck={false} autoComplete="off"
          aria-invalid={exactInput.length>0&&!isExactRfcIdentity(exactInput)?'true':undefined}
          onChange={event=>{setExactInput(event.target.value);setExactQuery(null);}}/>
        <button type="submit" disabled={!isExactRfcIdentity(exactInput)}>Find exact RFC</button>
      </div>
    </form>
    {exactQuery&&<OwnerProjection<RfcIdentityPoint> path={
      '/api/v1/tickets/rfcs/by-business-id/'+encodeURIComponent(exactQuery)
    } render={item=>{
      if(!item||!uuid4.test(item.rfc_id)||item.rfc_no!==exactQuery
        ||!Number.isSafeInteger(item.revision)||item.revision<1
        ||!['root','standalone','subordinate'].includes(item.hierarchy_role)
        ||!['active','archived'].includes(item.local_archive_state))
        throw new Error('Invalid accepted RFC identity');
      return <aside className="soma-v2-sr-details" aria-label="Exact RFC match">
        <div className="soma-v2-sr-details-title"><strong>EXACT MATCH / {item.rfc_no}</strong>
          <button type="button" onClick={()=>navigate('/tickets/rfc/'+encodeURIComponent(item.rfc_id))}>Open RFC workbench ↗</button></div>
        <div className="soma-v2-sr-details-grid">
          <span>Hierarchy</span><span>{item.hierarchy_role}</span>
          <span>Local archive</span><span>{item.local_archive_state}</span>
          <span>Revision</span><strong>{item.revision}</strong>
        </div>
      </aside>;
    }}/>}
    <p className="soma-v2-ticket-collection-scope">
      The local archive state is an RFC owner fact. Source status and status class are separate
      accepted observations; neither infers Service Request lifecycle. Each page is a fresh read.
    </p>
  </section>;
}
