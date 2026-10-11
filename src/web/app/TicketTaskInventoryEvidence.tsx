import {useContext,useState} from 'react';
import {OwnerProjection,OwnerReturnRefresh} from '../components/OwnerProjection';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha=/^[0-9a-f]{64}$/u;
const whole=(value:unknown):value is number=>typeof value==='number'&&
  Number.isSafeInteger(value)&&value>=0&&value<=8640000000000;
const positive=(value:unknown)=>whole(value)&&value>=1;
const text=(value:unknown)=>typeof value==='string'&&value.length>0&&
  new TextEncoder().encode(value).length<=1024;
const optionalText=(value:unknown)=>value===null||typeof value==='string'&&
  new TextEncoder().encode(value).length<=1024;
const optionalId=(value:unknown)=>value===null||typeof value==='string'&&uuid.test(value);
const instant=(timestamp:number)=>new Date(timestamp*1000).toLocaleString();

type Allocation=Readonly<{allocation_event_id:string;allocation_id:string;spare_part_unit_id:string;
  spare_need_id:string|null;event_kind:string;reason_code:string|null;recorded_at_utc:number}>;
type LocalFulfillment=Readonly<{event_id:string;spare_need_id:string;spare_part_unit_id:string;
  event_kind:string;reason_code:string|null;recorded_at_utc:number}>;
type PhysicalConsequence=Readonly<{physical_consequence_id:string;task_review_fingerprint:string;
  rma_id:string|null;physical_disposition:string;installed_spare_part_unit_id:string|null;
  removed_device_part_unit_id:string|null;inbound_spare_part_unit_id:string|null;
  parent_dismantled_unit_id:string|null;revision:number;input_fingerprint:string}>;
type ReturnObligation=Readonly<{rma_id:string;state:string;device_part_unit_id:string|null;
  spare_part_unit_id:string|null;physical_consequence_id:string;revision:number}>;
type Projection=Readonly<{task_id:string;allocation_history:readonly Allocation[];
  local_fulfillment_history:readonly LocalFulfillment[];
  physical_consequences:readonly PhysicalConsequence[];
  return_obligations:readonly ReturnObligation[]}>;
type Key=readonly [number,string];

function chronological(previous:Key|null,when:number,id:string):Key{
  if(previous&&(when<previous[0]||when===previous[0]&&id<=previous[1]))
    throw new Error('Task Inventory chronology is not in owner order');
  return [when,id];
}
function accepted(value:Projection,taskId:string):Projection{
  if(!value||value.task_id!==taskId||!uuid.test(taskId)||
    !Array.isArray(value.allocation_history)||value.allocation_history.length>5000||
    !Array.isArray(value.local_fulfillment_history)||value.local_fulfillment_history.length>5000||
    !Array.isArray(value.physical_consequences)||value.physical_consequences.length>5000||
    !Array.isArray(value.return_obligations)||value.return_obligations.length>5000)
    throw new Error('Invalid Task Inventory owner response');
  let previous:Key|null=null;
  const eventIds=new Set<string>();
  for(const row of value.allocation_history){
    if(!row||!uuid.test(row.allocation_event_id)||eventIds.has(row.allocation_event_id)
      ||!uuid.test(row.allocation_id)||!uuid.test(row.spare_part_unit_id)
      ||!optionalId(row.spare_need_id)||!text(row.event_kind)||!optionalText(row.reason_code)
      ||!whole(row.recorded_at_utc))
      throw new Error('Invalid Task allocation event evidence');
    previous=chronological(previous,row.recorded_at_utc,row.allocation_event_id);
    eventIds.add(row.allocation_event_id);
  }
  previous=null;eventIds.clear();
  for(const row of value.local_fulfillment_history){
    if(!row||!uuid.test(row.event_id)||eventIds.has(row.event_id)
      ||!uuid.test(row.spare_need_id)||!uuid.test(row.spare_part_unit_id)
      ||!text(row.event_kind)||!optionalText(row.reason_code)
      ||!whole(row.recorded_at_utc))
      throw new Error('Invalid Task local fulfillment evidence');
    previous=chronological(previous,row.recorded_at_utc,row.event_id);
    eventIds.add(row.event_id);
  }
  let priorId='';
  for(const row of value.physical_consequences){
    if(!row||!uuid.test(row.physical_consequence_id)
      ||row.physical_consequence_id<=priorId||!sha.test(row.task_review_fingerprint)
      ||!optionalId(row.rma_id)||!text(row.physical_disposition)
      ||!optionalId(row.installed_spare_part_unit_id)||!optionalId(row.removed_device_part_unit_id)
      ||!optionalId(row.inbound_spare_part_unit_id)||!optionalId(row.parent_dismantled_unit_id)
      ||!positive(row.revision)||!sha.test(row.input_fingerprint))
      throw new Error('Invalid Task physical consequence');
    priorId=row.physical_consequence_id;
  }
  priorId='';
  for(const row of value.return_obligations){
    if(!row||!uuid.test(row.rma_id)||row.rma_id<=priorId||!text(row.state)
      ||!optionalId(row.device_part_unit_id)||!optionalId(row.spare_part_unit_id)
      ||!uuid.test(row.physical_consequence_id)||!positive(row.revision))
      throw new Error('Invalid Task return obligation');
    priorId=row.rma_id;
  }
  return value;
}
/** Only called for an already selected and accepted Task point. No mutations. */
export function TicketTaskInventoryEvidence({taskId}:{taskId:string}){
  const [opened,setOpened]=useState(false);
  const generation=useContext(OwnerReturnRefresh);
  return <section aria-label="Task Inventory evidence controls">
    <button type="button" aria-expanded={opened} onClick={()=>setOpened(value=>!value)}>
      {opened?'Hide':'Inspect'} Task Inventory evidence
    </button>
    {opened&&<section aria-label="Task Inventory evidence" className="soma-v2-rfc-links">
      <h3>Task · physical and planning evidence</h3>
      <p>Allocation history is planning evidence, not an installation or a physical receipt.
        Local fulfillment events, accepted physical consequences and return obligations are
        separate owner facts. This view cannot reserve, issue or move stock.</p>
      <OwnerProjection<Projection> key={generation}
        path={'/api/v1/inventory/tasks/'+encodeURIComponent(taskId)}
        render={raw=>{
          const page=accepted(raw,taskId);
          return <>
            <p>Task identity: {page.task_id}. Evidence is not an independent proof of Task existence.</p>
            <div className="soma-v2-sr-details-grid">
              <span>Task unit allocation events</span><strong>{page.allocation_history.length}</strong>
              <span>Local fulfillment events</span><strong>{page.local_fulfillment_history.length}</strong>
              <span>Physical consequences</span><strong>{page.physical_consequences.length}</strong>
              <span>Related return obligations</span><strong>{page.return_obligations.length}</strong>
            </div>
            <section aria-label="Task unit allocation events">
              <h4>Unit allocation history</h4>
              {page.allocation_history.length===0&&<p>No allocation events reported.</p>}
              {page.allocation_history.length>0&&<div className="soma-v2-sr-table-viewport" data-scroll-owner="x">
                <table className="soma-v2-sr-table"><thead><tr><th scope="col">Recorded locally</th>
                  <th scope="col">Event</th><th scope="col">Spare unit</th>
                  <th scope="col">Spare Need</th><th scope="col">Reason</th></tr></thead>
                <tbody>{page.allocation_history.slice(0,25).map(row=><tr key={row.allocation_event_id}>
                  <td>{instant(row.recorded_at_utc)}</td><td>{row.event_kind}</td>
                  <td>{row.spare_part_unit_id}</td><td>{row.spare_need_id??'Not linked'}</td>
                  <td>{row.reason_code??'Not reported'}</td>
                </tr>)}</tbody></table></div>}
              {page.allocation_history.length>25&&<p>Showing first 25 of {page.allocation_history.length} owner allocation events.</p>}
            </section>
            <section aria-label="Task local fulfillment events">
              <h4>Local need fulfillment history</h4>
              {page.local_fulfillment_history.length===0&&<p>No local fulfillment events reported.</p>}
              {page.local_fulfillment_history.length>0&&<div className="soma-v2-sr-table-viewport" data-scroll-owner="x">
                <table className="soma-v2-sr-table"><thead><tr><th scope="col">Recorded locally</th>
                  <th scope="col">Event</th><th scope="col">Spare Need</th>
                  <th scope="col">Spare unit</th><th scope="col">Reason</th></tr></thead>
                <tbody>{page.local_fulfillment_history.slice(0,25).map(row=><tr key={row.event_id}>
                  <td>{instant(row.recorded_at_utc)}</td><td>{row.event_kind}</td>
                  <td>{row.spare_need_id}</td><td>{row.spare_part_unit_id}</td>
                  <td>{row.reason_code??'Not reported'}</td>
                </tr>)}</tbody></table></div>}
              {page.local_fulfillment_history.length>25&&<p>Showing first 25 of {page.local_fulfillment_history.length} owner fulfillment events.</p>}
            </section>
            <section aria-label="Task physical consequences">
              <h4>Accepted physical consequence projections</h4>
              {page.physical_consequences.length===0&&<p>No physical consequences recorded.</p>}
              {page.physical_consequences.length>0&&<div className="soma-v2-sr-table-viewport" data-scroll-owner="x">
                <table className="soma-v2-sr-table"><thead><tr><th scope="col">Consequence ID</th>
                  <th scope="col">Disposition</th><th scope="col">Installed unit</th>
                  <th scope="col">Removed unit</th><th scope="col">RMA</th></tr></thead>
                <tbody>{page.physical_consequences.slice(0,25).map(row=><tr key={row.physical_consequence_id}>
                  <td>{row.physical_consequence_id}</td><td>{row.physical_disposition}</td>
                  <td>{row.installed_spare_part_unit_id??'Not reported'}</td>
                  <td>{row.removed_device_part_unit_id??'Not reported'}</td>
                  <td>{row.rma_id??'No RMA linked'}</td>
                </tr>)}</tbody></table></div>}
              {page.physical_consequences.length>25&&<p>Showing first 25 of {page.physical_consequences.length} owner consequences.</p>}
            </section>
            <section aria-label="Task return obligations">
              <h4>RMA return obligations</h4>
              {page.return_obligations.length===0&&<p>No related return obligations reported.</p>}
              {page.return_obligations.length>0&&<div className="soma-v2-sr-table-viewport" data-scroll-owner="x">
                <table className="soma-v2-sr-table"><thead><tr><th scope="col">RMA</th>
                  <th scope="col">State</th><th scope="col">Consequence ID</th>
                  <th scope="col">Return unit</th></tr></thead>
                <tbody>{page.return_obligations.slice(0,25).map(row=><tr key={row.rma_id}>
                  <td>{row.rma_id}</td><td>{row.state}</td>
                  <td>{row.physical_consequence_id}</td>
                  <td>{row.spare_part_unit_id??row.device_part_unit_id??'Not reported'}</td>
                </tr>)}</tbody></table></div>}
              {page.return_obligations.length>25&&<p>Showing first 25 of {page.return_obligations.length} owner return obligations.</p>}
            </section>
          </>;
        }}/>
    </section>}
  </section>;
}
