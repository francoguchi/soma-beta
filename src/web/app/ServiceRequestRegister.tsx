import {useState} from 'react';
import {OwnerProjection} from '../components/OwnerProjection';

type TicketRow=Readonly<{
  service_request_id:string;
  official_sr_no:string|null;
  local_sr_no:string|null;
  revision:number;
  updated_at_utc:number;
  summary:string|null;
  status:string|null;
}>;
type SrCursor=Readonly<{version:1;sort_registry_id:'SR_UPDATED_ID_DESC_V1';updated_at_utc:number;service_request_id:string}>;
type SrPage=Readonly<{
  items:readonly TicketRow[];
  total_count_at_read:number;
  sort_registry_id:'SR_UPDATED_ID_DESC_V1';
  continuation:SrCursor|null;
}>;
const UUID4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SR_CODE=/^(?:[0-9]{8}|LSR-[0-9]{8})$/;
const PAGE_LIMIT=25;
const firstPath='/api/v1/tickets/service-requests?limit='+PAGE_LIMIT;

function acceptedPage(raw:SrPage):SrPage{
  if (!raw || !Array.isArray(raw.items) || raw.items.length>PAGE_LIMIT ||
    !Number.isSafeInteger(raw.total_count_at_read) || raw.total_count_at_read<0 ||
    raw.sort_registry_id!=='SR_UPDATED_ID_DESC_V1') throw new Error('Invalid SR owner collection');
  const seen=new Set<string>();
  for(const row of raw.items){
    if (!row || !UUID4.test(row.service_request_id) || seen.has(row.service_request_id) ||
      !SR_CODE.test(row.official_sr_no??row.local_sr_no??'') ||
      !Number.isSafeInteger(row.revision) || row.revision<1 ||
      !Number.isSafeInteger(row.updated_at_utc) || row.updated_at_utc<0 ||
      (row.summary!==null && typeof row.summary!=='string') ||
      (row.status!==null && typeof row.status!=='string')) throw new Error('Invalid SR collection row');
    seen.add(row.service_request_id);
  }
  const c=raw.continuation;
  if (c!==null && (!c || c.version!==1 || c.sort_registry_id!=='SR_UPDATED_ID_DESC_V1' ||
    !Number.isSafeInteger(c.updated_at_utc) || c.updated_at_utc<0 ||
    !UUID4.test(c.service_request_id) || !raw.items.length ||
    c.service_request_id!==raw.items[raw.items.length-1]?.service_request_id ||
    c.updated_at_utc!==raw.items[raw.items.length-1]?.updated_at_utc)) throw new Error('Invalid SR continuation');
  return raw;
}
function nextPath(cursor:SrCursor):string{
  return firstPath+'&cursor='+encodeURIComponent(JSON.stringify(cursor));
}
function displayInstant(seconds:number):string{
  return new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'2-digit',
    hour:'2-digit',minute:'2-digit'}).format(new Date(seconds*1000));
}

/** Read-only owner collection. Current-source values are never treated as lifecycle status. */
export function ServiceRequestRegister({navigate}:{navigate:(path:string)=>void}){
  const [paths,setPaths]=useState<readonly string[]>([firstPath]);
  const [pageNumber,setPageNumber]=useState(0);
  const [selected,setSelected]=useState<string|null>(null);
  const path=paths[pageNumber]??firstPath;
  return <section className="soma-v2-sr-register" aria-label="Service Request register">
    <div className="soma-v2-sr-register-header">
      <div><h2>Service Requests · Register</h2>
        <p>Accepted records · updated most recently first · current snapshot</p></div>
      <span className="soma-v2-sr-owner-tag">LLD-03 / OWNER READ</span>
    </div>
    <OwnerProjection<SrPage> path={path} render={response=>{
      const page=acceptedPage(response);
      const current=page.items.find(row=>row.service_request_id===selected)??page.items[0]??null;
      return <>
        <div className="soma-v2-sr-register-meta">
          <span>{page.total_count_at_read} Service Request(s) at read</span>
          <span>Page {pageNumber+1} · {page.items.length} records shown</span>
        </div>
        <div className="soma-v2-sr-table-viewport" data-scroll-owner="x">
          <table className="soma-v2-sr-table">
            <thead><tr><th scope="col">SR</th><th scope="col">Source status</th>
              <th scope="col">Problem summary</th><th scope="col">Updated</th><th scope="col">Action</th></tr></thead>
            <tbody>{page.items.map(row=>{
              const active=current?.service_request_id===row.service_request_id;
              return <tr key={row.service_request_id} data-selected={active?'true':'false'}>
                <td><button type="button" className="soma-v2-sr-rowselect"
                  aria-pressed={active} onClick={()=>setSelected(row.service_request_id)}>
                  {row.official_sr_no??row.local_sr_no}</button></td>
                <td>{row.status??'Not reported'}</td>
                <td>{row.summary??'Not reported'}</td>
                <td>{displayInstant(row.updated_at_utc)}</td>
                <td><button type="button" className="soma-v2-sr-open"
                  onClick={()=>navigate('/tickets/sr/'+encodeURIComponent(row.service_request_id))}>Open</button></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {page.items.length===0 && <p role="status">There are no Service Requests in this page.</p>}
        <div className="soma-v2-sr-pager">
          <button type="button" disabled={pageNumber===0} onClick={()=>{setPageNumber(n=>Math.max(0,n-1));setSelected(null);}}>Previous page</button>
          <button type="button" disabled={!page.continuation} onClick={()=>{
            if(!page.continuation)return;
            const next=nextPath(page.continuation);
            setPaths(old=>[...old.slice(0,pageNumber+1),next].slice(-51));
            // Navigation stack is capped; when advancing beyond 50 pages,
            // start a new bounded browsing segment rather than retaining unbounded cursors.
            setPageNumber(n=>Math.min(n+1,50));setSelected(null);
          }}>Next page</button>
        </div>
        {current && <aside className="soma-v2-sr-details" aria-label="Selected Service Request details">
          <div className="soma-v2-sr-details-title"><strong>DETAILS / {current.official_sr_no??current.local_sr_no}</strong>
            <button type="button" onClick={()=>navigate('/tickets/sr/'+encodeURIComponent(current.service_request_id))}>Open workbench ↗</button></div>
          <div className="soma-v2-sr-details-grid">
            <span>Record revision</span><strong>{current.revision}</strong>
            <span>Source status</span><span>{current.status??'Not reported'}</span>
            <span>Summary</span><span>{current.summary??'Not reported'}</span>
            <span>Last updated</span><span>{displayInstant(current.updated_at_utc)}</span>
          </div>
        </aside>}
      </>;
    }}/>
    <p className="soma-v2-ticket-collection-scope">
      This register lists all current SR identities; it does not classify them as Active or Archived.
      Source statuses are reported evidence, not inferred lifecycle states.
      Updates during browsing may change the ordering of later pages.
    </p>
  </section>;
}
