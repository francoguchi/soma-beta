import {useState,useContext} from 'react';
import {OwnerProjection,OwnerReturnRefresh} from '../components/OwnerProjection';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const label=(text:unknown)=>typeof text==='string'&&text.length>0&&new TextEncoder().encode(text).length<=512;
const optionalId=(value:unknown)=>value===null||typeof value==='string'&&uuid.test(value);
const positive=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=1;
type OwnerKind='warehouse'|'eligible';
type WarehouseRow=Readonly<{fault_tag_membership_id:string;fault_tag_id:string;rma_id:string;
  state:'submitted_awaiting_receipt'|'warehouse_received';
  device_part_unit_id:string|null;spare_part_unit_id:string|null;revision:number}>;
type EligibleRow=Readonly<{rma_id:string;device_part_unit_id:string|null;spare_part_unit_id:string|null;
  physical_consequence_id:string;revision:number;current_c10:string}>;
type Page=Readonly<{items:readonly (WarehouseRow|EligibleRow)[];continuation:string|null}>;
const firstPath=(kind:OwnerKind)=>kind==='warehouse'
  ?'/api/v1/inventory/warehouse/queue?limit=25'
  :'/api/v1/inventory/fault-tag-memberships/eligible?limit=25';
const cursorParameter=(kind:OwnerKind)=>kind==='warehouse'?'after_membership_id':'after_rma_id';
function validate(value:Page,kind:OwnerKind,previousId:string|null):Page {
  if(!value||!Array.isArray(value.items)||value.items.length>25
    ||!Object.hasOwn(value,'continuation'))
    throw new Error('Invalid LLD-07 return or warehouse owner page');
  let last=previousId??'';
  for(const item of value.items){
    const id=kind==='warehouse'
      ?(item as WarehouseRow)?.fault_tag_membership_id
      :(item as EligibleRow)?.rma_id;
    if(!item||!uuid.test(id)||id<=last)
      throw new Error('Unordered or foreign warehouse owner item');
    if(kind==='warehouse'){
      const row=item as WarehouseRow;
      if(!uuid.test(row.fault_tag_id)||!uuid.test(row.rma_id)
        ||!['submitted_awaiting_receipt','warehouse_received'].includes(row.state)
        ||!optionalId(row.device_part_unit_id)||!optionalId(row.spare_part_unit_id)
        ||!positive(row.revision))
        throw new Error('Invalid accepted warehouse membership evidence');
    } else {
      const row=item as EligibleRow;
      if(!uuid.test(row.physical_consequence_id)
        ||!optionalId(row.device_part_unit_id)||!optionalId(row.spare_part_unit_id)
        ||!positive(row.revision)||!label(row.current_c10))
        throw new Error('Invalid open return obligation evidence');
    }
    last=id;
  }
  if(value.continuation!==null&&(!uuid.test(value.continuation)
    ||value.items.length!==25||value.continuation!==last))
    throw new Error('Invalid LLD-07 native continuation');
  return value;
}
function WarehouseRows({kind}:{kind:OwnerKind}){
  const first=firstPath(kind);
  const [history,setHistory]=useState(()=>initialOwnerPage(first));
  const refresh=useContext(OwnerReturnRefresh);
  // LLD-07 exposes native ID seek markers here, *not* the fingerprint JSON
  // cursor used by FaultTagListQuery or InventoryHistoryQuery.
  const path=ownerPagePath(history);
  const after=history.page===history.first?null:
    new URL(path,'http://localhost').searchParams.get(cursorParameter(kind));
  return <section className="soma-v2-rfc-links"
    aria-label={kind==='warehouse'?'Warehouse membership queue':'Open return obligation candidates'}>
    <h5>{kind==='warehouse'?'Submitted memberships awaiting warehouse stages':'Unassigned open return obligations'}</h5>
    <p>{kind==='warehouse'
      ?'Submitted awaiting receipt and warehouse-received entries have distinct stages. No receipt or final decision is submitted here.'
      :'These open return obligations currently have no active submitted Fault Tag membership. This is not permission to attach or submit them.'}</p>
    <OwnerProjection<Page> key={refresh} path={path} render={raw=>{
      const page=validate(raw,kind,after);
      return <>
        <p>{page.items.length} owner records on this page; the endpoint does not report a total.</p>
        {page.items.length===0&&<p role="status">No owner records returned for this queue page.</p>}
        <div className="soma-v2-sr-table-viewport" data-scroll-owner="x">
          <table className="soma-v2-sr-table">
            {kind==='warehouse'
              ?<><thead><tr><th scope="col">Membership</th><th scope="col">Fault Tag</th>
                <th scope="col">RMA</th><th scope="col">Warehouse stage</th>
                <th scope="col">Unit evidence</th></tr></thead>
                <tbody>{page.items.map(item=>{
                  const row=item as WarehouseRow;return <tr key={row.fault_tag_membership_id}>
                    <td>{row.fault_tag_membership_id}</td><td>{row.fault_tag_id}</td>
                    <td>{row.rma_id}</td><td><strong>{row.state.replaceAll('_',' ')}</strong></td>
                    <td>{row.spare_part_unit_id??row.device_part_unit_id??'No unit linked'}</td>
                  </tr>;
                })}</tbody></>
              :<><thead><tr><th scope="col">RMA</th><th scope="col">Current C10</th>
                <th scope="col">Physical consequence</th><th scope="col">Return unit evidence</th></tr></thead>
                <tbody>{page.items.map(item=>{
                  const row=item as EligibleRow;return <tr key={row.rma_id}>
                    <td>{row.rma_id}</td><td>{row.current_c10}</td>
                    <td>{row.physical_consequence_id}</td>
                    <td>{row.spare_part_unit_id??row.device_part_unit_id??'No unit linked'}</td>
                  </tr>;
                })}</tbody></>}
          </table>
        </div>
        <div className="soma-v2-sr-pager">
          <button type="button" disabled={history.page===history.first}
            onClick={()=>setHistory(previousOwnerPage)}>Previous page</button>
          <span>Page {history.page+1}</span>
          <button type="button" disabled={page.continuation===null}
            onClick={()=>{if(page.continuation===null)return;
              const next=first+'&'+cursorParameter(kind)+'='+encodeURIComponent(page.continuation);
              setHistory(old=>nextOwnerPage(old,next,first+'&'+cursorParameter(kind)+'='));
            }}>Next page</button>
        </div>
      </>;
    }}/>
  </section>;
}
export function InventoryWarehouseDesk(){
  const [queueOpen,setQueueOpen]=useState(false);
  const [eligibleOpen,setEligibleOpen]=useState(false);
  return <section className="soma-v2-rfc-links" aria-label="Return and Warehouse Operations">
    <h4>Warehouse and return obligations · owner evidence</h4>
    <p>Opening either read is independent. Physical receipt, Fault Tag submission and final
      warehouse decision remain separate governed commands and are unavailable here.</p>
    <button type="button" aria-expanded={queueOpen} onClick={()=>setQueueOpen(v=>!v)}>
      {queueOpen?'Hide':'Inspect'} warehouse membership queue
    </button>
    {queueOpen&&<WarehouseRows kind="warehouse"/>}
    <button type="button" aria-expanded={eligibleOpen} onClick={()=>setEligibleOpen(v=>!v)}>
      {eligibleOpen?'Hide':'Inspect'} open return obligations
    </button>
    {eligibleOpen&&<WarehouseRows kind="eligible"/>}
  </section>;
}
