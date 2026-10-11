import {useContext,useEffect,useState} from 'react';
import {OwnerProjection,OwnerReturnRefresh} from '../components/OwnerProjection';
import {filterFingerprint} from '../data/query-controller';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';
import {FaultTagLineage} from './FaultTagLineage';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const hash=/^[0-9a-f]{64}$/u;
const nonnegative=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
const positive=(n:unknown)=>nonnegative(n)&&n>=1;
const label=(s:unknown)=>typeof s==='string'&&s.length>0&&new TextEncoder().encode(s).length<=1024;
const optUuid=(s:unknown)=>s===null||typeof s==='string'&&uuid.test(s);
type Archive='all'|'current'|'archived';
type ListRow=Readonly<{fault_tag_id:string;tracking_handle:string;state:string;archived:boolean;
  submitted_member_count:number;awaiting_receipt_count:number;awaiting_final_count:number;
  accepted_count:number;rejected_count:number;revision:number}>;
type Cursor=Readonly<{version:1;query_id:'FaultTagListQuery';sort_registry_id:'INVENTORY_FAULT_TAG_ID_ASC_V1';
  last_key_tuple:readonly [string];filter_fingerprint:string;null_order:'not_applicable'}>;
type Page=Readonly<{items:readonly ListRow[];continuation:Cursor|null;exact_total:number}>;
type Member=Readonly<{fault_tag_membership_id:string;rma_id:string;physical_consequence_id:string;
  current_c10:string;state:string;active_submitted:boolean;return_reason:string;
  promised_bom_code:string;current_unit_bom_code:string;revision:number;
  device_part_unit_id:string|null;spare_part_unit_id:string|null}>;
type Detail=Readonly<{fault_tag_id:string;tracking_handle:string;state:string;archived:boolean;
  revision:number;draft_revision:number;draft_return_method:string;
  current_submission_snapshot_id:string|null;current_pickup_location:object|null;
  counts:Readonly<{submitted:number;awaiting_receipt:number;awaiting_final:number;accepted:number;rejected:number}>;
  members:readonly Member[];submission_history:readonly object[];lineage:readonly object[]}>;
const pathFor=(filter:Archive)=>'/api/v1/inventory/fault-tags?limit=25'+
  (filter==='all'?'':'&archived='+(filter==='archived'?'true':'false'));
const archivedValue=(filter:Archive)=>filter==='all'?null:filter==='archived';

function validated(page:Page,filter:Archive,fingerprint:string):Page{
  if(!page||!Array.isArray(page.items)||page.items.length>25||!nonnegative(page.exact_total)
    ||page.exact_total<page.items.length||!Object.hasOwn(page,'continuation'))
    throw new Error('Invalid Fault Tag owner page');
  let prev='';
  for(const row of page.items){
    if(!row||!uuid.test(row.fault_tag_id)||row.fault_tag_id<=prev
      ||!label(row.tracking_handle)||!label(row.state)||typeof row.archived!=='boolean'
      ||filter!=='all'&&row.archived!==(filter==='archived')
      ||!nonnegative(row.submitted_member_count)||!nonnegative(row.awaiting_receipt_count)
      ||!nonnegative(row.awaiting_final_count)||!nonnegative(row.accepted_count)
      ||!nonnegative(row.rejected_count)||!positive(row.revision))
      throw new Error('Invalid Fault Tag owner row');
    prev=row.fault_tag_id;
  }
  const cursor=page.continuation;
  if(cursor!==null&&(!cursor||!prev||cursor.version!==1
    ||cursor.query_id!=='FaultTagListQuery'
    ||cursor.sort_registry_id!=='INVENTORY_FAULT_TAG_ID_ASC_V1'
    ||cursor.null_order!=='not_applicable'||!hash.test(cursor.filter_fingerprint)
    ||cursor.filter_fingerprint!==fingerprint||!Array.isArray(cursor.last_key_tuple)
    ||cursor.last_key_tuple.length!==1||cursor.last_key_tuple[0]!==prev
    ||Object.keys(cursor).sort().join(',')!==
      'filter_fingerprint,last_key_tuple,null_order,query_id,sort_registry_id,version'))
    throw new Error('Invalid Fault Tag owner continuation');
  return page;
}
function FaultTagEvidence({row}:{row:ListRow}){
  const generation=useContext(OwnerReturnRefresh);
  return <aside aria-label="Selected Fault Tag" className="soma-v2-sr-details">
    <OwnerProjection<Detail> key={generation} path={'/api/v1/inventory/fault-tags/'+encodeURIComponent(row.fault_tag_id)} render={value=>{
      const c=value?.counts;
      if(!value||value.fault_tag_id!==row.fault_tag_id||value.tracking_handle!==row.tracking_handle
        ||value.state!==row.state||value.archived!==row.archived
        ||value.revision!==row.revision||!nonnegative(value.draft_revision)
        ||!label(value.draft_return_method)||!optUuid(value.current_submission_snapshot_id)
        ||!c||c.submitted!==row.submitted_member_count
        ||c.awaiting_receipt!==row.awaiting_receipt_count
        ||c.awaiting_final!==row.awaiting_final_count
        ||c.accepted!==row.accepted_count||c.rejected!==row.rejected_count
        ||!Array.isArray(value.members)||value.members.length>5000
        ||!Array.isArray(value.submission_history)||value.submission_history.length>5000
        ||!Array.isArray(value.lineage)||value.lineage.length>5000
        ||value.members.some(member=>!member||!uuid.test(member.fault_tag_membership_id)
          ||!uuid.test(member.rma_id)||!uuid.test(member.physical_consequence_id)
          ||!label(member.current_c10)||!label(member.state)
          ||typeof member.active_submitted!=='boolean'||!label(member.return_reason)
          ||!label(member.promised_bom_code)||!label(member.current_unit_bom_code)
          ||!positive(member.revision)||!optUuid(member.device_part_unit_id)
          ||!optUuid(member.spare_part_unit_id)))
        throw new Error('Invalid selected Fault Tag owner detail');
      return <>
        <h4>{value.tracking_handle} · {value.state}</h4>
        <div className="soma-v2-sr-details-grid">
          <span>Fault Tag ID</span><span>{value.fault_tag_id}</span>
          <span>Archived</span><strong>{value.archived?'Yes — historical':'No'}</strong>
          <span>Return method (draft)</span><span>{value.draft_return_method}</span>
          <span>Revision</span><strong>{value.revision}</strong>
          <span>Submitted memberships</span><strong>{c.submitted}</strong>
          <span>Awaiting warehouse receipt</span><strong>{c.awaiting_receipt}</strong>
          <span>Awaiting final warehouse decision</span><strong>{c.awaiting_final}</strong>
          <span>Accepted / rejected decisions</span><span>{c.accepted} / {c.rejected}</span>
          <span>Submission snapshots</span><span>{value.submission_history.length}</span>
          <span>Lineage edges</span><span>{value.lineage.length}</span>
        </div>
        <p>Submission is not warehouse receipt; receipt is not final acceptance. All displayed
          evidence is read-only, and a draft return method is not a submitted return.</p>
        <section aria-label="Fault Tag memberships">
          <h5>Related RMA memberships ({value.members.length} in owner detail)</h5>
          {value.members.length===0&&<p>No Fault Tag memberships reported.</p>}
          {value.members.slice(0,25).map(member=><p key={member.fault_tag_membership_id}>
            {member.current_c10} · {member.promised_bom_code} · {member.state} ·
            {member.active_submitted?' Active submitted membership':' Not active-submitted'} ·
            RMA {member.rma_id}
          </p>)}
          {value.members.length>25&&<p>Only the first 25 memberships are displayed here.</p>}
        </section>
        <FaultTagLineage faultTagId={value.fault_tag_id} expectedCount={value.lineage.length}/>
      </>;
    }}/>
  </aside>;
}
/** Lazy, read-only Fault Tag owner list; no warehouse decision or draft commands. */
export function InventoryFaultTags(){
  const [filter,setFilter]=useState<Archive>('all');
  const [history,setHistory]=useState(()=>initialOwnerPage(pathFor('all')));
  const [fingerprint,setFingerprint]=useState<{filter:Archive;digest:string}|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const generation=useContext(OwnerReturnRefresh);
  useEffect(()=>{
    let active=true;setFingerprint(null);
    void filterFingerprint({schema:'SOMA_FAULT_TAG_LIST_FILTER_V1',state:null,archived:archivedValue(filter)})
      .then(digest=>{if(active)setFingerprint({filter,digest});})
      .catch(()=>{if(active)setFingerprint(null);});
    return()=>{active=false;};
  },[filter]);
  const validFingerprint=fingerprint?.filter===filter?fingerprint.digest:null;
  const first=pathFor(filter);
  return <section className="soma-v2-rfc-links" aria-label="Accepted Fault Tags">
    <p>Current and archived Fault Tags retain distinct evidence. Warehouse status is not
      inferred from a draft, submission, or RMA alone.</p>
    <label>Archive status{' '}
      <select value={filter} onChange={e=>{
        const next=e.target.value;
        if(!['all','current','archived'].includes(next))return;
        const archive=next as Archive;
        setFilter(archive);setSelected(null);setHistory(initialOwnerPage(pathFor(archive)));
      }}>
        <option value="all">All Fault Tags</option>
        <option value="current">Not archived</option>
        <option value="archived">Archived history</option>
      </select>
    </label>
    {validFingerprint===null?<p role="status">Preparing accepted Fault Tag owner filter.</p>:
      <OwnerProjection<Page> key={generation+':'+filter} path={ownerPagePath(history)} render={raw=>{
        const page=validated(raw,filter,validFingerprint);
        const chosen=page.items.find(item=>item.fault_tag_id===selected)??null;
        return <>
          <p>{page.exact_total} Fault Tags; {page.items.length} on this owner page.</p>
          {page.items.length===0&&<p role="status">No Fault Tags for this archive filter.</p>}
          <div className="soma-v2-sr-table-viewport" data-scroll-owner="x">
            <table className="soma-v2-sr-table">
              <thead><tr><th scope="col">Tracking handle</th><th scope="col">Lifecycle</th>
                <th scope="col">Archive</th><th scope="col">Awaiting receipt</th><th scope="col">Awaiting final</th></tr></thead>
              <tbody>{page.items.map(item=><tr key={item.fault_tag_id}>
                <td><button type="button" className="soma-v2-sr-rowselect"
                  aria-label={'Inspect Fault Tag '+item.fault_tag_id}
                  aria-pressed={chosen?.fault_tag_id===item.fault_tag_id}
                  onClick={()=>setSelected(item.fault_tag_id)}>{item.tracking_handle}</button></td>
                <td>{item.state}</td><td>{item.archived?'Archived':'Current'}</td>
                <td>{item.awaiting_receipt_count}</td><td>{item.awaiting_final_count}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="soma-v2-sr-pager">
            <button type="button" disabled={history.page===history.first}
              onClick={()=>{setSelected(null);setHistory(previousOwnerPage);}}>Previous page</button>
            <span>Page {history.page+1}</span>
            <button type="button" disabled={page.continuation===null}
              onClick={()=>{if(!page.continuation)return;
                const next=first+'&cursor='+encodeURIComponent(JSON.stringify(page.continuation));
                if(next.length>4096)throw new Error('Oversized Fault Tag cursor');
                setSelected(null);setHistory(old=>nextOwnerPage(old,next,first+'&cursor='));
              }}>Next page</button>
          </div>
          {chosen&&<FaultTagEvidence key={chosen.fault_tag_id} row={chosen}/>}
        </>;
      }}/>}
  </section>;
}
