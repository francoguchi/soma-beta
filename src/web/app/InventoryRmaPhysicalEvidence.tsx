import {useState} from 'react';

// RMA detail is already the authenticated LLD-07 point owner. This component
// makes no separate API call or claim that a movement implies acceptance.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const limit=5000;
const second=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&
  x>=0&&x<=8640000000000;
const safe=(x:unknown)=>typeof x==='string'&&x.length>0&&new TextEncoder().encode(x).length<=8192;
const optionalId=(x:unknown)=>x===null||typeof x==='string'&&uuid.test(x);
const optionalText=(x:unknown)=>x===null||typeof x==='string'&&new TextEncoder().encode(x).length<=8192;
const timestamp=(x:number)=>new Date(x*1000).toLocaleString();

export type RmaAssignment=Readonly<{
  assignment_event_id:string;prior_device_part_unit_id:string|null;
  new_device_part_unit_id:string|null;event_kind:string;reason_code:string|null;
  recorded_at_utc:number;
}>;
export type RmaActualLogistics=Readonly<{
  logistics_event_id:string;event_kind:string;effective_at_utc:number|null;
  dispatch_location_id:string|null;custody_text:string|null;
  observed_condition:string|null;recorded_at_utc:number;
}>;
export type RmaReturnObligation=Readonly<{
  state:string;device_part_unit_id:string|null;spare_part_unit_id:string|null;
  physical_consequence_id:string|null;revision:number;last_event_id:string|null;
}>;
export type RmaPhysicalProjection=Readonly<{
  rma_id:string;direct_inbound_spare_part_unit_id:string|null;
  target_device_part_unit_id:string|null;return_device_part_unit_id:string|null;
  return_spare_part_unit_id:string|null;return_obligation_open:boolean;
  return_obligation:RmaReturnObligation|null;
  assignment_history:readonly RmaAssignment[];actual_logistics:readonly RmaActualLogistics[];
}>;

function assertOrdered(previous:readonly [number,string]|null,when:number,id:string){
  if(previous&&(when<previous[0]||when===previous[0]&&id<=previous[1]))
    throw new Error('RMA owner event chronology is invalid');
}

/** Validate the complete unpaged owner projection before showing any part of it. */
export function validateRmaPhysicalEvidence(d:RmaPhysicalProjection):void{
  if(!d||!uuid.test(d.rma_id)||typeof d.return_obligation_open!=='boolean'
    ||!optionalId(d.direct_inbound_spare_part_unit_id)||!optionalId(d.target_device_part_unit_id)
    ||!optionalId(d.return_device_part_unit_id)||!optionalId(d.return_spare_part_unit_id)
    ||!Array.isArray(d.assignment_history)||d.assignment_history.length>limit
    ||!Array.isArray(d.actual_logistics)||d.actual_logistics.length>limit)
    throw new Error('Invalid RMA physical evidence owner projection');
  const o=d.return_obligation;
  if(o!==null&&(!o||!safe(o.state)||!optionalId(o.device_part_unit_id)
    ||!optionalId(o.spare_part_unit_id)||!optionalId(o.physical_consequence_id)
    ||!optionalId(o.last_event_id)||typeof o.revision!=='number'
    ||!Number.isSafeInteger(o.revision)||o.revision<1))
    throw new Error('Invalid RMA return obligation projection');

  let previous:readonly [number,string]|null=null;
  const assignments=new Set<string>();
  for(const event of d.assignment_history){
    if(!event||!uuid.test(event.assignment_event_id)||assignments.has(event.assignment_event_id)
      ||!optionalId(event.prior_device_part_unit_id)||!optionalId(event.new_device_part_unit_id)
      ||!safe(event.event_kind)||!optionalText(event.reason_code)
      ||!second(event.recorded_at_utc))
      throw new Error('Invalid RMA assignment history');
    assertOrdered(previous,event.recorded_at_utc,event.assignment_event_id);
    previous=[event.recorded_at_utc,event.assignment_event_id];
    assignments.add(event.assignment_event_id);
  }

  previous=null;
  const logistics=new Set<string>();
  for(const event of d.actual_logistics){
    if(!event||!uuid.test(event.logistics_event_id)||logistics.has(event.logistics_event_id)
      ||!safe(event.event_kind)||!second(event.recorded_at_utc)
      ||event.effective_at_utc!==null&&!second(event.effective_at_utc)
      ||!optionalId(event.dispatch_location_id)
      ||!optionalText(event.custody_text)||!optionalText(event.observed_condition))
      throw new Error('Invalid RMA logistics event projection');
    assertOrdered(previous,event.recorded_at_utc,event.logistics_event_id);
    previous=[event.recorded_at_utc,event.logistics_event_id];
    logistics.add(event.logistics_event_id);
  }
}
/** Read-only expansion of the already accepted RMA point query, not a new fetch. */
export function InventoryRmaPhysicalEvidence({evidence}:{evidence:RmaPhysicalProjection}){
  const [expanded,setExpanded]=useState(false);
  return <section aria-label="RMA physical evidence controls">
    <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(open=>!open)}>
      {expanded?'Hide':'Inspect'} RMA physical evidence
    </button>
    {expanded&&<section aria-label="RMA physical evidence" className="soma-v2-rfc-links">
      <h5>RMA · recorded physical and logistics evidence</h5>
      <p>Events are historical owner evidence. Dispatch, custody notes, and assignments do
        not by themselves prove inbound receipt, installation, return acceptance or closure.</p>
      <div className="soma-v2-sr-details-grid">
        <span>Direct inbound spare unit</span>
        <span>{evidence.direct_inbound_spare_part_unit_id??'No direct inbound unit registered'}</span>
        <span>Target device part unit</span><span>{evidence.target_device_part_unit_id??'Not assigned'}</span>
        <span>Return device part unit</span><span>{evidence.return_device_part_unit_id??'Not reported'}</span>
        <span>Return spare part unit</span><span>{evidence.return_spare_part_unit_id??'Not reported'}</span>
        <span>Return obligation currently open</span><strong>{evidence.return_obligation_open?'Yes':'No'}</strong>
        <span>Return obligation state</span><strong>{evidence.return_obligation?.state??'No current obligation projection'}</strong>
        <span>Physical consequence ID</span><span>{evidence.return_obligation?.physical_consequence_id??'Not reported'}</span>
      </div>
      <section aria-label="RMA assignment history">
        <h6>Physical unit assignment events ({evidence.assignment_history.length})</h6>
        {evidence.assignment_history.length===0&&<p role="status">No assignment events recorded.</p>}
        {evidence.assignment_history.length>0&&<div className="soma-v2-sr-table-viewport" data-scroll-owner="x">
          <table className="soma-v2-sr-table"><thead><tr>
            <th scope="col">Recorded locally</th><th scope="col">Change</th>
            <th scope="col">Prior device unit</th><th scope="col">New device unit</th><th scope="col">Reason</th>
          </tr></thead><tbody>{evidence.assignment_history.slice(0,25).map(e=><tr key={e.assignment_event_id}>
            <td>{timestamp(e.recorded_at_utc)}</td><td>{e.event_kind}</td>
            <td>{e.prior_device_part_unit_id??'None'}</td><td>{e.new_device_part_unit_id??'None'}</td>
            <td>{e.reason_code??'Not reported'}</td>
          </tr>)}</tbody></table>
        </div>}
        {evidence.assignment_history.length>25&&<p>First 25 of {evidence.assignment_history.length} assignment events shown; the current owner response is not paginated.</p>}
      </section>
      <section aria-label="RMA actual logistics history">
        <h6>Recorded actual logistics ({evidence.actual_logistics.length})</h6>
        {evidence.actual_logistics.length===0&&<p role="status">No actual logistics events recorded.</p>}
        {evidence.actual_logistics.length>0&&<div className="soma-v2-sr-table-viewport" data-scroll-owner="x">
          <table className="soma-v2-sr-table"><thead><tr>
            <th scope="col">Recorded locally</th><th scope="col">Effective locally</th>
            <th scope="col">Event kind</th><th scope="col">Dispatch location</th>
            <th scope="col">Custody</th><th scope="col">Observed condition</th>
          </tr></thead><tbody>{evidence.actual_logistics.slice(0,25).map(e=><tr key={e.logistics_event_id}>
            <td>{timestamp(e.recorded_at_utc)}</td>
            <td>{e.effective_at_utc===null?'Not reported':timestamp(e.effective_at_utc)}</td>
            <td>{e.event_kind}</td><td>{e.dispatch_location_id??'Not reported'}</td>
            <td>{e.custody_text??'Not reported'}</td><td>{e.observed_condition??'Not reported'}</td>
          </tr>)}</tbody></table>
        </div>}
        {evidence.actual_logistics.length>25&&<p>First 25 of {evidence.actual_logistics.length} logistics events shown; the current owner response is not paginated.</p>}
      </section>
    </section>}
  </section>;
}
