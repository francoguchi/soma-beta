import {useContext,useEffect,useState} from 'react';
import {OwnerProjection,OwnerReturnRefresh} from '../components/OwnerProjection';
import {filterFingerprint} from '../data/query-controller';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha=/^[a-f0-9]{64}$/u;
const states=['draft','submitted_awaiting_response','acknowledged','partially_authorized',
  'authorized','cancelled','rejected'] as const;
type Lifecycle='all'|typeof states[number];
type RequestRow=Readonly<{spare_request_id:string;local_handle:string;service_request_id:string;
  requester_contact_id:string;requester_context:object;lifecycle_state:string;official_sr7:string|null;
  submitted_quantity:number;authorized_rma_count:number;response_warning_start_utc:number|null;
  response_warning_age_seconds:number|null;revision:number}>;
type Cursor=Readonly<{version:1;query_id:'SpareRequestListQuery';sort_registry_id:'INVENTORY_REQUEST_ID_ASC_V1';
  last_key_tuple:readonly [string];filter_fingerprint:string;null_order:'not_applicable'}>;
type Page=Readonly<{items:readonly RequestRow[];exact_total:number;as_of_utc:number;continuation:Cursor|null}>;
type RmaRow=Readonly<{rma_id:string;authorization_batch_id:string;response_ordinal:number;
  promised_bom_code:string;current_c10:string;state:string;target_device_part_unit_id:string|null;
  direct_inbound_spare_part_unit_id:string|null;return_obligation_open:boolean;revision:number}>;
type RequestDetail=Readonly<{spare_request_id:string;local_handle:string;service_request_id:string;
  requester:{contact_id:string;creation_context:object;current_context:{display_name:string;lifecycle_state:string;revision:number}};
  creation_origin:string;lifecycle_state:string;official_sr7:string|null;
  current_submission_snapshot_id:string|null;submitted_quantity:number;
  authorized_rma_count:number;response_warning_start_utc:number|null;revision:number;
  draft_logistics:{mode:string;receiver_contact_id:string;dispatch_location_id:string;revision:number};
  allocations:readonly {request_need_allocation_id:string;spare_need_id:string;quantity:number;revision:number;active_draft:boolean;bom_code:string}[];
  submission_history:readonly {submission_snapshot_id:string;temporary_tracking_id:string;recorded_at_utc:number}[];
  sr7_aliases:readonly {sr7:string;alias_kind:string}[];
  rmas:readonly RmaRow[];
  history:readonly {event_id:string;event_kind:string;recorded_at_utc:number}[]}>;
type RmaDetail=Readonly<{rma_id:string;spare_request_id:string;promised_bom_code:string;promised_bom_key:string;
  state:string;target_device_part_unit_id:string|null;direct_inbound_spare_part_unit_id:string|null;
  return_device_part_unit_id:string|null;return_spare_part_unit_id:string|null;
  return_obligation_open:boolean;active_fault_tag_membership_id:string|null;revision:number;
  c10_aliases:readonly {c10:string;alias_kind:string}[];
  assignment_history:readonly {assignment_event_id:string;event_kind:string;recorded_at_utc:number}[];
  return_obligation:{state:string;device_part_unit_id:string|null;spare_part_unit_id:string|null;physical_consequence_id:string|null;revision:number;last_event_id:string|null}|null;
  fault_tag_memberships:readonly {fault_tag_membership_id:string;fault_tag_id:string;state:string;active_submitted:boolean;revision:number}[];
  actual_logistics:readonly {logistics_event_id:string;event_kind:string;recorded_at_utc:number}[]}>;
const nonnegative=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
const positive=(n:unknown)=>nonnegative(n)&&Number(n)>=1;
const label=(s:unknown)=>typeof s==='string'&&s.length>0&&new TextEncoder().encode(s).length<=512;
const optionalUuid=(s:unknown)=>s===null||typeof s==='string'&&uuid.test(s);
const optionalLabel=(s:unknown)=>s===null||label(s);
const bounded=(x:unknown)=>Array.isArray(x)&&x.length<=5000;
function validatePage(page:Page,lifecycle:Lifecycle,asOf:number,fingerprint:string):Page{
  if(!page||!Array.isArray(page.items)||page.items.length>25||!nonnegative(page.exact_total)
    ||page.exact_total<page.items.length||page.as_of_utc!==asOf
    ||!Object.hasOwn(page,'continuation'))throw new Error('Invalid Spare Request owner page');
  let previous='';
  for(const r of page.items){
    if(!r||!uuid.test(r.spare_request_id)||r.spare_request_id<=previous
      ||!label(r.local_handle)||!uuid.test(r.service_request_id)||!uuid.test(r.requester_contact_id)
      ||!r.requester_context||typeof r.requester_context!=='object'||Array.isArray(r.requester_context)
      ||!states.includes(r.lifecycle_state as typeof states[number])
      ||lifecycle!=='all'&&r.lifecycle_state!==lifecycle
      ||!optionalLabel(r.official_sr7)||!nonnegative(r.submitted_quantity)
      ||!nonnegative(r.authorized_rma_count)||!positive(r.revision)
      ||!(r.response_warning_start_utc===null||nonnegative(r.response_warning_start_utc))
      ||r.response_warning_age_seconds!==(r.response_warning_start_utc===null?
        null:Math.max(0,asOf-r.response_warning_start_utc)))
      throw new Error('Invalid Spare Request owner row');
    previous=r.spare_request_id;
  }
  const c=page.continuation;
  if(c!==null&&(!c||!previous||c.version!==1||c.query_id!=='SpareRequestListQuery'
    ||c.sort_registry_id!=='INVENTORY_REQUEST_ID_ASC_V1'||c.null_order!=='not_applicable'
    ||!sha.test(c.filter_fingerprint)||c.filter_fingerprint!==fingerprint
    ||!Array.isArray(c.last_key_tuple)||c.last_key_tuple.length!==1
    ||c.last_key_tuple[0]!==previous
    ||Object.keys(c).sort().join(',')!=='filter_fingerprint,last_key_tuple,null_order,query_id,sort_registry_id,version'))
    throw new Error('Invalid Spare Request owner cursor');
  return page;
}
const pathFor=(state:Lifecycle,asOf:number)=>'/api/v1/inventory/requests?limit=25&as_of_utc='+asOf+
  (state==='all'?'':'&lifecycle_state='+state);
function RmaEvidence({row,requestId}:{row:RmaRow;requestId:string}){
  const generation=useContext(OwnerReturnRefresh);
  return <aside aria-label="Selected RMA" className="soma-v2-sr-details">
    <OwnerProjection<RmaDetail> key={generation} path={'/api/v1/inventory/rmas/'+encodeURIComponent(row.rma_id)} render={d=>{
      if(!d||d.rma_id!==row.rma_id||d.spare_request_id!==requestId||d.state!==row.state
        ||d.promised_bom_code!==row.promised_bom_code||d.revision!==row.revision
        ||d.return_obligation_open!==row.return_obligation_open
        ||d.direct_inbound_spare_part_unit_id!==row.direct_inbound_spare_part_unit_id
        ||d.target_device_part_unit_id!==row.target_device_part_unit_id
        ||!optionalUuid(d.return_device_part_unit_id)||!optionalUuid(d.return_spare_part_unit_id)
        ||!optionalUuid(d.active_fault_tag_membership_id)||!label(d.promised_bom_key)
        ||!bounded(d.c10_aliases)||!bounded(d.assignment_history)
        ||!bounded(d.fault_tag_memberships)||!bounded(d.actual_logistics)
        ||!d.c10_aliases.some(a=>a.c10===row.current_c10&&a.alias_kind==='current')
        ||d.return_obligation!==null&&(!d.return_obligation
          ||!positive(d.return_obligation.revision)
          ||!label(d.return_obligation.state)
          ||!optionalUuid(d.return_obligation.device_part_unit_id)
          ||!optionalUuid(d.return_obligation.spare_part_unit_id)))
        throw new Error('RMA point evidence disagrees with selected request');
      return <>
        <h4>RMA {row.current_c10}</h4>
        <div className="soma-v2-sr-details-grid">
          <span>Owner identity</span><span>{d.rma_id}</span>
          <span>Lifecycle state</span><strong>{d.state}</strong>
          <span>Promised BOM</span><span>{d.promised_bom_code}</span>
          <span>Target Device Part Unit</span><span>{d.target_device_part_unit_id??'Not assigned'}</span>
          <span>Direct inbound Spare Unit</span><span>{d.direct_inbound_spare_part_unit_id??'No actual inbound receipt registered'}</span>
          <span>Return obligation</span><strong>{d.return_obligation?.state??(d.return_obligation_open?'Open (no projection)':'No open obligation reported')}</strong>
          <span>Fault Tag memberships</span><span>{d.fault_tag_memberships.length}</span>
          <span>Actual logistics events</span><span>{d.actual_logistics.length}</span>
          <span>Assignment history entries</span><span>{d.assignment_history.length}</span>
        </div>
        <p>An RMA authorization is not a physical receipt. Warehouse acceptance and return obligations remain separate owner evidence.</p>
      </>;
    }}/>
  </aside>;
}
function RequestEvidence({row}:{row:RequestRow}){
  const generation=useContext(OwnerReturnRefresh);
  const [selectedRma,setSelectedRma]=useState<string|null>(null);
  return <aside aria-label="Selected Spare Request" className="soma-v2-sr-details">
    <OwnerProjection<RequestDetail> key={generation} path={'/api/v1/inventory/requests/'+encodeURIComponent(row.spare_request_id)} render={d=>{
      if(!d||d.spare_request_id!==row.spare_request_id||d.service_request_id!==row.service_request_id
        ||d.local_handle!==row.local_handle||d.lifecycle_state!==row.lifecycle_state
        ||d.official_sr7!==row.official_sr7||d.revision!==row.revision
        ||d.submitted_quantity!==row.submitted_quantity||d.authorized_rma_count!==row.authorized_rma_count
        ||!d.requester||d.requester.contact_id!==row.requester_contact_id
        ||!d.requester.current_context||!label(d.requester.current_context.display_name)
        ||!d.draft_logistics||!label(d.draft_logistics.mode)
        ||!bounded(d.allocations)||!bounded(d.submission_history)||!bounded(d.sr7_aliases)
        ||!bounded(d.rmas)||!bounded(d.history)
        ||d.rmas.length>row.authorized_rma_count
        ||d.rmas.some(r=>!uuid.test(r.rma_id)||!uuid.test(r.authorization_batch_id)
          ||!positive(r.response_ordinal)||!label(r.promised_bom_code)
          ||!label(r.current_c10)||!label(r.state)
          ||!positive(r.revision)||typeof r.return_obligation_open!=='boolean'
          ||!optionalUuid(r.target_device_part_unit_id)
          ||!optionalUuid(r.direct_inbound_spare_part_unit_id))
        ||d.allocations.some(a=>!uuid.test(a.spare_need_id)||!nonnegative(a.quantity)
          ||!label(a.bom_code)||typeof a.active_draft!=='boolean'))
        throw new Error('Spare Request detail conflicts with selected owner row');
      const chosen=d.rmas.find(r=>r.rma_id===selectedRma)??null;
      return <>
        <h4>{row.local_handle}{row.official_sr7?' · '+row.official_sr7:''}</h4>
        <div className="soma-v2-sr-details-grid">
          <span>Spare Request identity</span><span>{d.spare_request_id}</span>
          <span>Governing SR identity</span><span>{d.service_request_id}</span>
          <span>Lifecycle</span><strong>{d.lifecycle_state}</strong>
          <span>Requester (current)</span><span>{d.requester.current_context.display_name}</span>
          <span>Draft logistics mode</span><span>{d.draft_logistics.mode}</span>
          <span>Submitted quantity</span><strong>{d.submitted_quantity}</strong>
          <span>Authorization count</span><strong>{d.authorized_rma_count}</strong>
          <span>Submission snapshots</span><span>{d.submission_history.length}</span>
          <span>Need allocations</span><span>{d.allocations.length}</span>
          <span>Lifecycle events</span><span>{d.history.length}</span>
          <span>SR7 aliases</span><span>{d.sr7_aliases.length}</span>
        </div>
        <p>Need allocations and draft logistics are not evidence of submission, RMA authorization, or physical fulfillment.</p>
        <section aria-label="Spare Request need allocations">
          <h5>Need allocations (first 25 of {d.allocations.length})</h5>
          {d.allocations.slice(0,25).map(a=><p key={a.request_need_allocation_id}>
            {a.bom_code} · Need {a.spare_need_id} · Quantity {a.quantity} · {a.active_draft?'Active draft':'Historical allocation'}
          </p>)}
        </section>
        <section aria-label="Authorized RMAs">
          <h5>Authorized RMAs ({d.rmas.length} in owner detail)</h5>
          {d.rmas.length===0&&<p>No accepted RMA authorization for this request.</p>}
          {d.rmas.slice(0,25).map(r=><button type="button" key={r.rma_id}
            className="soma-v2-sr-rowselect"
            aria-label={'Inspect RMA '+r.rma_id}
            aria-pressed={selectedRma===r.rma_id} onClick={()=>setSelectedRma(r.rma_id)}>
            {r.current_c10} · {r.state} · {r.promised_bom_code}
          </button>)}
          {d.rmas.length>25&&<p>Further owner RMAs are not displayed in this bounded preview.</p>}
          {chosen&&<RmaEvidence key={chosen.rma_id} row={chosen} requestId={d.spare_request_id}/>}
        </section>
      </>;
    }}/>
  </aside>;
}
/** Lazy, read-only request/RMA drilldown; the authoritative mutation routes stay uncomposed. */
export function InventorySpareRequests(){
  const [lifecycle,setLifecycle]=useState<Lifecycle>('all');
  const [asOf,setAsOf]=useState(()=>Math.floor(Date.now()/1000));
  const [history,setHistory]=useState(()=>initialOwnerPage(pathFor('all',Math.floor(Date.now()/1000))));
  const [fingerprint,setFingerprint]=useState<{lifecycle:Lifecycle;asOf:number;digest:string}|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const generation=useContext(OwnerReturnRefresh);
  // Capture one as-of for the whole keyset cursor chain. A refresh starts a fresh chain.
  useEffect(()=>{
    let active=true;setFingerprint(null);
    void filterFingerprint({schema:'SOMA_SPARE_REQUEST_LIST_FILTER_V1',service_request_id:null,
      lifecycle_state:lifecycle==='all'?null:lifecycle,response_warning_only:false,as_of_utc:asOf})
      .then(digest=>{if(active)setFingerprint({lifecycle,asOf,digest});})
      .catch(()=>{if(active)setFingerprint(null);});
    return()=>{active=false;};
  },[lifecycle,asOf]);
  const validFingerprint=fingerprint?.lifecycle===lifecycle&&fingerprint.asOf===asOf?fingerprint.digest:null;
  const first=pathFor(lifecycle,asOf);
  return <section aria-label="Accepted Spare Requests" className="soma-v2-rfc-links">
    <p>Only accepted owner request states are shown. Official SR7 assignment, authorization and physical events have separate evidence.</p>
    <label>Request lifecycle{' '}
      <select value={lifecycle} onChange={e=>{
        const next=e.target.value;
        if(next!=='all'&&!states.some(x=>x===next))return;
        const state=next as Lifecycle;
        setLifecycle(state);setSelected(null);setHistory(initialOwnerPage(pathFor(state,asOf)));
      }}>
        <option value="all">All states</option>
        {states.map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}
      </select>
    </label>
    <button type="button" onClick={()=>{
      const next=Math.floor(Date.now()/1000);
      setAsOf(next);setSelected(null);setHistory(initialOwnerPage(pathFor(lifecycle,next)));
    }}>Refresh Spare Requests</button>
    {validFingerprint===null?<p role="status">Preparing accepted request owner filter.</p>:
    <OwnerProjection<Page> key={generation+':'+lifecycle+':'+asOf} path={ownerPagePath(history)} render={raw=>{
      const page=validatePage(raw,lifecycle,asOf,validFingerprint);
      const chosen=page.items.find(r=>r.spare_request_id===selected)??null;
      return <>
        <p>{page.exact_total} Spare Requests; {page.items.length} on this page.</p>
        {page.items.length===0&&<p role="status">No Spare Requests for this lifecycle filter.</p>}
        <div className="soma-v2-sr-table-viewport" data-scroll-owner="x"><table className="soma-v2-sr-table">
          <thead><tr><th scope="col">Request</th><th scope="col">Lifecycle</th>
            <th scope="col">SR7</th><th scope="col">Submitted</th><th scope="col">RMAs</th></tr></thead>
          <tbody>{page.items.map(r=><tr key={r.spare_request_id}>
            <td><button type="button" className="soma-v2-sr-rowselect"
              aria-pressed={chosen?.spare_request_id===r.spare_request_id}
              aria-label={'Inspect Spare Request '+r.spare_request_id}
              onClick={()=>setSelected(r.spare_request_id)}>{r.local_handle}</button></td>
            <td>{r.lifecycle_state}</td><td>{r.official_sr7??'Not assigned'}</td>
            <td>{r.submitted_quantity}</td><td>{r.authorized_rma_count}</td>
          </tr>)}</tbody></table></div>
        <div className="soma-v2-sr-pager">
          <button type="button" disabled={history.page===history.first}
            onClick={()=>{setSelected(null);setHistory(previousOwnerPage);}}>Previous page</button>
          <span>Page {history.page+1}</span>
          <button type="button" disabled={page.continuation===null}
            onClick={()=>{if(!page.continuation)return;
              const path=first+'&cursor='+encodeURIComponent(JSON.stringify(page.continuation));
              if(path.length>4096)throw new Error('Oversized Spare Request cursor');
              setSelected(null);setHistory(old=>nextOwnerPage(old,path,first+'&cursor='));
            }}>Next page</button>
        </div>
        {chosen&&<RequestEvidence key={chosen.spare_request_id} row={chosen}/>}
      </>;
    }}/>}
  </section>;
}
