import {useContext,useEffect,useState} from 'react';
import {OwnerProjection,OwnerReturnRefresh} from '../components/OwnerProjection';
import {filterFingerprint} from '../data/query-controller';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const hash=/^[a-f0-9]{64}$/u;
const states=['active','resolved','cancelled','removed'] as const;
type Lifecycle='all'|typeof states[number];
type Need=Readonly<{spare_need_id:string;service_request_id:string;bom_code:string;
  lifecycle_state:typeof states[number];planned_quantity:number;revision:number;
  contributor_count:number;local_allocation_summary:Readonly<{active_task_allocation_count:number;
    local_selection_event_count:number;local_release_event_count:number;
    local_superseded_event_count:number}>;
  request_allocation_summary:Readonly<{request_count:number;
    active_draft_request_quantity:number;submitted_snapshot_quantity:number}>}>;
type Cursor=Readonly<{version:1;query_id:'InventoryNeedsQuery';
  sort_registry_id:'INVENTORY_NEEDS_ID_ASC_V1';last_key_tuple:readonly [string];
  filter_fingerprint:string;null_order:'not_applicable'}>;
type Page=Readonly<{items:readonly Need[];exact_total:number;continuation:Cursor|null}>;
const nonnegative=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const positive=(v:unknown)=>nonnegative(v)&&Number(v)>=1;
const label=(text:unknown)=>typeof text==='string'&&text.length>0&&new TextEncoder().encode(text).length<=512;
const keysLocal=['active_task_allocation_count','local_selection_event_count',
  'local_release_event_count','local_superseded_event_count'] as const;
const keysRequest=['request_count','active_draft_request_quantity','submitted_snapshot_quantity'] as const;
function accepted(value:Page,lifecycle:Lifecycle,fingerprint:string):Page {
  if(!value||!Array.isArray(value.items)||value.items.length>25||
    !nonnegative(value.exact_total)||value.exact_total<value.items.length||
    !Object.hasOwn(value,'continuation'))
    throw new Error('Invalid owner Spare Needs page');
  let previous='';
  for(const row of value.items){
    if(!row||!uuid.test(row.spare_need_id)||row.spare_need_id<=previous
      ||!uuid.test(row.service_request_id)||!label(row.bom_code)
      ||!states.includes(row.lifecycle_state)
      ||lifecycle!=='all'&&row.lifecycle_state!==lifecycle
      ||!nonnegative(row.planned_quantity)||!positive(row.revision)
      ||!nonnegative(row.contributor_count)
      ||!row.local_allocation_summary||!row.request_allocation_summary
      ||keysLocal.some(key=>!nonnegative(row.local_allocation_summary[key]))
      ||keysRequest.some(key=>!nonnegative(row.request_allocation_summary[key])))
      throw new Error('Invalid owner Spare Need identity or allocation summary');
    previous=row.spare_need_id;
  }
  const c=value.continuation;
  if(c!==null&&(!c||!previous||c.version!==1||c.query_id!=='InventoryNeedsQuery'
    ||c.sort_registry_id!=='INVENTORY_NEEDS_ID_ASC_V1'
    ||c.null_order!=='not_applicable'||!hash.test(c.filter_fingerprint)
    ||c.filter_fingerprint!==fingerprint||!Array.isArray(c.last_key_tuple)
    ||c.last_key_tuple.length!==1||c.last_key_tuple[0]!==previous
    ||Object.keys(c).sort().join(',')!=='filter_fingerprint,last_key_tuple,null_order,query_id,sort_registry_id,version'))
    throw new Error('Invalid owner Spare Need continuation');
  return value;
}
const route=(state:Lifecycle)=>'/api/v1/inventory/needs?limit=25'+
  (state==='all'?'':'&lifecycle_state='+state);
/** Read-only owner projection; not an eligibility preview or physical receipt. */
export function InventorySpareNeeds(){
  const [lifecycle,setLifecycle]=useState<Lifecycle>('all');
  const [history,setHistory]=useState(()=>initialOwnerPage(route('all')));
  const [selected,setSelected]=useState<string|null>(null);
  const [fingerprint,setFingerprint]=useState<{lifecycle:Lifecycle;digest:string}|null>(null);
  const generation=useContext(OwnerReturnRefresh);
  useEffect(()=>{
    let alive=true;setFingerprint(null);
    void filterFingerprint({schema:'SOMA_INVENTORY_NEEDS_FILTER_V1',
      service_request_id:null,lifecycle_state:lifecycle==='all'?null:lifecycle,bom_key:null})
      .then(digest=>{if(alive)setFingerprint({lifecycle,digest});})
      .catch(()=>{if(alive)setFingerprint(null);});
    return()=>{alive=false;};
  },[lifecycle]);
  const validFingerprint=fingerprint?.lifecycle===lifecycle?fingerprint.digest:null;
  const first=route(lifecycle);
  return <section aria-label="Accepted Spare Needs" className="soma-v2-rfc-links">
    <p>This desk exposes the current Need projection. Complete customer eligibility and
      action blockers require further owning context; no actions are enabled here.</p>
    <label>Lifecycle state{' '}
      <select value={lifecycle} onChange={event=>{
        const next=event.target.value;
        if(next!=='all'&&!states.some(state=>state===next))return;
        const state=next as Lifecycle;
        setLifecycle(state);setSelected(null);setHistory(initialOwnerPage(route(state)));
      }}>
        <option value="all">All lifecycle states</option>
        <option value="active">Active</option>
        <option value="resolved">Resolved</option>
        <option value="cancelled">Cancelled</option>
        <option value="removed">Removed</option>
      </select>
    </label>
    {validFingerprint===null?<p role="status">Preparing the accepted Spare Needs filter.</p>:
      <OwnerProjection<Page> key={generation+':'+lifecycle} path={ownerPagePath(history)} render={raw=>{
        const page=accepted(raw,lifecycle,validFingerprint);
        const chosen=page.items.find(item=>item.spare_need_id===selected)??null;
        return <>
          <p>{page.exact_total} Spare Needs in this owner query; {page.items.length} on this page.</p>
          <div className="soma-v2-sr-table-viewport" data-scroll-owner="x">
            <table className="soma-v2-sr-table">
              <thead><tr><th scope="col">BOM</th><th scope="col">Lifecycle</th>
                <th scope="col">Planned quantity</th><th scope="col">Service Request</th></tr></thead>
              <tbody>{page.items.map(item=><tr key={item.spare_need_id}
                data-selected={chosen?.spare_need_id===item.spare_need_id?'true':'false'}>
                <td><button type="button" className="soma-v2-sr-rowselect"
                  aria-label={'Inspect Spare Need '+item.spare_need_id}
                  aria-pressed={chosen?.spare_need_id===item.spare_need_id}
                  onClick={()=>setSelected(item.spare_need_id)}>{item.bom_code}</button></td>
                <td>{item.lifecycle_state}</td><td>{item.planned_quantity}</td>
                <td>{item.service_request_id}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {page.items.length===0&&<p role="status">No Spare Needs for this lifecycle filter.</p>}
          {page.items.length>0&&!chosen&&<p role="status">Select a Spare Need to inspect its planning evidence.</p>}
          <div className="soma-v2-sr-pager">
            <button type="button" disabled={history.page===history.first}
              onClick={()=>{setSelected(null);setHistory(previousOwnerPage);}}>Previous page</button>
            <span>Page {history.page+1}</span>
            <button type="button" disabled={page.continuation===null}
              onClick={()=>{if(!page.continuation)return;
                const next=first+'&cursor='+encodeURIComponent(JSON.stringify(page.continuation));
                if(next.length>4096)throw new Error('Oversized Spare Needs cursor path');
                setSelected(null);
                setHistory(old=>nextOwnerPage(old,next,first+'&cursor='));
              }}>Next page</button>
          </div>
          {chosen&&<aside aria-label="Selected Spare Need" className="soma-v2-sr-details">
            <div className="soma-v2-sr-details-title"><strong>{chosen.bom_code}</strong><span>{chosen.lifecycle_state}</span></div>
            <div className="soma-v2-sr-details-grid">
              <span>Spare Need ID</span><span>{chosen.spare_need_id}</span>
              <span>Direct SR identity</span><span>{chosen.service_request_id}</span>
              <span>Owner revision</span><strong>{chosen.revision}</strong>
              <span>Planned quantity</span><strong>{chosen.planned_quantity}</strong>
              <span>Active contributors</span><strong>{chosen.contributor_count}</strong>
              <span>Task allocations (current)</span><strong>{chosen.local_allocation_summary.active_task_allocation_count}</strong>
              <span>Local selections / releases / superseded</span>
              <span>{chosen.local_allocation_summary.local_selection_event_count} / {chosen.local_allocation_summary.local_release_event_count} / {chosen.local_allocation_summary.local_superseded_event_count}</span>
              <span>Allocated Spare Requests</span><strong>{chosen.request_allocation_summary.request_count}</strong>
              <span>Active draft request quantity</span><strong>{chosen.request_allocation_summary.active_draft_request_quantity}</strong>
              <span>Submitted snapshot quantity</span><strong>{chosen.request_allocation_summary.submitted_snapshot_quantity}</strong>
            </div>
            <p>These are current owner aggregates. A local selection is planning evidence, not an
              accepted delivery, warehouse decision, installation or a newly created LSU.</p>
          </aside>}
        </>;
      }}/>}
  </section>;
}
