import {useContext,useState} from 'react';
import {OwnerProjection,OwnerReturnRefresh} from '../components/OwnerProjection';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';
import {TicketTaskEvidence} from './TicketTaskEvidence';

type TicketType='service_request'|'rfc';
type Plan=Readonly<{plan_revision_id:string;revision:number;start_utc:number;end_utc:number;origin:string}>;
type Membership=Readonly<{objective_id:string;membership_revision:number;objective_tracking_id:string}>;
type Task=Readonly<{task_id:string;kind:'local'|'wfm';display_name:string;creation_origin:string;revision:number;
  owning_rfc:Readonly<{rfc_id:string;assignment_revision:number}>|null;operational_plan:Plan|null;
  membership:Membership|null;execution_state:'not_started'|'in_progress'|'ended'|'terminated';
  review_state:'unreviewed'|'awaiting_review'|'reviewed';accepted_outcome:string|null;
  operational_count_included:boolean;warnings:readonly string[]}>;
type Cursor=Readonly<{unscheduled:0|1;start_utc:number|null;task_id:string}>;
type Page=Readonly<{items:readonly Task[];continuation:Cursor|null;exact_total:number}>;
type Detail=Readonly<{task_id:string;kind:'local'|'wfm';display_name:string;revision:number;
  operational_plan:Plan|null;objective_membership:Readonly<{objective_id:string}>|null;
  actual_execution:Readonly<{execution_state:string;actual_start_utc:number|null;actual_end_utc:number|null}>;
  reviewed_outcome:Readonly<{accepted_outcome:string}>|null;
  relationship_summary:Readonly<{exact_total:number}>;
  attention_summary:Readonly<{warning_codes:readonly string[]}>}>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const instant=(value:number|null)=>value===null?'Unscheduled':new Date(value*1000).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
const validTime=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<=8640000000000;
const validPlan=(p:Plan|null)=>p===null||!!p&&uuid.test(p.plan_revision_id)&&Number.isSafeInteger(p.revision)&&p.revision>=1
  &&validTime(p.start_utc)&&validTime(p.end_utc)&&p.end_utc>p.start_utc&&typeof p.origin==='string';
function verified(page:Page):Page {
  if(!page||!Array.isArray(page.items)||page.items.length>25||!Number.isSafeInteger(page.exact_total)
    ||page.exact_total<page.items.length||!Object.hasOwn(page,'continuation'))
    throw new Error('Invalid accepted Task collection page');
  let last:[number,number,string]|null=null;
  for(const row of page.items) {
    if(!row||!uuid.test(row.task_id)||!['local','wfm'].includes(row.kind)
      ||typeof row.display_name!=='string'||!row.display_name
      ||typeof row.creation_origin!=='string'||!row.creation_origin
      ||!Number.isSafeInteger(row.revision)||row.revision<1
      ||!validPlan(row.operational_plan)
      ||!['not_started','in_progress','ended','terminated'].includes(row.execution_state)
      ||!['unreviewed','awaiting_review','reviewed'].includes(row.review_state)
      ||row.accepted_outcome!==null&&typeof row.accepted_outcome!=='string'
      ||row.owning_rfc!==null&&(!row.owning_rfc||!uuid.test(row.owning_rfc.rfc_id)
        ||!Number.isSafeInteger(row.owning_rfc.assignment_revision)||row.owning_rfc.assignment_revision<1)
      ||row.membership!==null&&(!row.membership||!uuid.test(row.membership.objective_id)
        ||!Number.isSafeInteger(row.membership.membership_revision)||row.membership.membership_revision<1
        ||typeof row.membership.objective_tracking_id!=='string')
      ||typeof row.operational_count_included!=='boolean'
      ||!Array.isArray(row.warnings)||row.warnings.some(x=>typeof x!=='string'))
      throw new Error('Invalid accepted Task collection row');
    const key:[number,number,string]=row.operational_plan===null?[1,0,row.task_id]:
      [0,row.operational_plan.start_utc,row.task_id];
    if(last&&(key[0]<last[0]||key[0]===last[0]&&
      (key[1]<last[1]||key[1]===last[1]&&key[2]<=last[2])))
      throw new Error('Accepted Task page is not in owner order');
    last=key;
  }
  const c=page.continuation;
  if(c!==null&&(!c||!last||!uuid.test(c.task_id)||c.unscheduled!==last[0]||
    c.task_id!==last[2]||c.start_utc!==(last[0]===1?null:last[1])||
    ![0,1].includes(c.unscheduled)||Object.keys(c).sort().join(',')!=='start_utc,task_id,unscheduled'))
    throw new Error('Invalid accepted Task continuation');
  return page;
}
/** One accepted Task point query, never a write intent or a fabricated SR/RFC membership. */
function TaskDetails({id,summary,navigate}:{id:string;summary:Task;navigate:(path:string)=>void}) {
  const generation=useContext(OwnerReturnRefresh);
  return <OwnerProjection<Detail> key={generation} path={'/api/v1/tasks/'+encodeURIComponent(id)} render={detail=>{
    if(!detail||detail.task_id!==id||detail.kind!==summary.kind||!Number.isSafeInteger(detail.revision)
      ||detail.revision<1||typeof detail.display_name!=='string'
      ||!validPlan(detail.operational_plan)||!detail.actual_execution
      ||!['not_started','in_progress','ended','terminated'].includes(detail.actual_execution.execution_state)
      ||detail.objective_membership!==null&&(!detail.objective_membership||
        !uuid.test(detail.objective_membership.objective_id))
      ||detail.reviewed_outcome!==null&&(!detail.reviewed_outcome||
        typeof detail.reviewed_outcome.accepted_outcome!=='string')
      ||!detail.relationship_summary||!Number.isSafeInteger(detail.relationship_summary.exact_total)
      ||detail.relationship_summary.exact_total<0||!detail.attention_summary
      ||!Array.isArray(detail.attention_summary.warning_codes)||
      detail.attention_summary.warning_codes.some(code=>typeof code!=='string'))
      throw new Error('Invalid accepted Task detail');
    const objective=detail.objective_membership?.objective_id??null;
    return <aside aria-label="Selected Task details" className="soma-v2-sr-details">
      <div className="soma-v2-sr-details-title"><strong>{detail.display_name}</strong></div>
      <div className="soma-v2-sr-details-grid">
        <span>Task identity</span><span>{detail.task_id}</span>
        <span>Owner kind</span><strong>{detail.kind==='wfm'?'WFM':'Local'}</strong>
        <span>Accepted Task revision</span><strong>{detail.revision}</strong>
        <span>Current execution</span><strong>{detail.actual_execution.execution_state}</strong>
        <span>Reviewed outcome</span><span>{detail.reviewed_outcome?.accepted_outcome??'Not reviewed'}</span>
        <span>Current plan</span><span>{detail.operational_plan
          ?instant(detail.operational_plan.start_utc)+' – '+instant(detail.operational_plan.end_utc)
          :'No accepted schedule'}</span>
        <span>Accepted relationships</span><strong>{detail.relationship_summary.exact_total}</strong>
        <span>Objective membership</span><span>{objective??'No current Objective membership'}</span>
      </div>
      {objective&&<button type="button" onClick={()=>navigate('/objectives/'+encodeURIComponent(objective))}>
        Open Objective workbench ↗</button>}
      {detail.attention_summary.warning_codes.map(code=><p key={code} className="warning">{code}</p>)}
      <p>Plan occupancy, actual execution, and reviewed outcome are separate accepted owner facts.</p>
      <TicketTaskEvidence taskId={id} navigate={navigate}/>
    </aside>;
  }}/>;
}

/** Real LLD-05 task collection filtered by direct RFC or direct/effective SR context. */
export function TicketTasks({id,type,navigate}:{id:string;type:TicketType;navigate:(path:string)=>void}) {
  const queryKey=type==='rfc'?'rfc_id':'sr_id';
  const first='/api/v1/tasks?limit=25&'+queryKey+'='+encodeURIComponent(id);
  const [history,setHistory]=useState(()=>initialOwnerPage(first));
  const [selected,setSelected]=useState<string|null>(null);
  const generation=useContext(OwnerReturnRefresh);
  const label=type==='rfc'?'RFC Tasks':'Service Request Tasks';
  return <section aria-label={label} className="soma-v2-rfc-links">
    <h2>{label}</h2>
    <p>{type==='rfc'?'Owner-assigned WFM Tasks and explicit RFC Task links. A governing root does not automatically own subordinate Tasks.':
      'Owner-linked Tasks and effective WFM-to-SR context through accepted RFC roots. This list does not establish an Objective membership.'}</p>
    <OwnerProjection<Page> key={generation} path={ownerPagePath(history)} render={raw=>{
      const page=verified(raw);
      const chosen=selected===null?null:page.items.find(t=>t.task_id===selected)??null;
      return <>
        <p>{page.exact_total} Tasks match this owner query; {page.items.length} on this page.</p>
        <div className="soma-v2-sr-table-viewport">
          <table className="soma-v2-sr-table"><thead><tr>
            <th scope="col">Task</th><th scope="col">Kind</th><th scope="col">Execution</th>
            <th scope="col">Review</th><th scope="col">Plan start (local)</th>
          </tr></thead><tbody>
            {page.items.map(row=><tr key={row.task_id} data-selected={chosen?.task_id===row.task_id?'true':'false'}>
              <td><button className="soma-v2-sr-rowselect" type="button"
                aria-pressed={chosen?.task_id===row.task_id}
                onClick={()=>setSelected(row.task_id)}>{row.display_name}</button></td>
              <td>{row.kind==='wfm'?'WFM':'Local'}</td>
              <td>{row.execution_state}</td><td>{row.review_state}</td>
              <td>{instant(row.operational_plan?.start_utc??null)}</td>
            </tr>)}
          </tbody></table>
        </div>
        {page.items.length===0&&<p role="status">No Tasks returned for this accepted {type==='rfc'?'RFC':'Service Request'} context.</p>}
        {page.items.length>0&&!chosen&&<p role="status">Select a Task to inspect its accepted execution and planning evidence.</p>}
        <div className="soma-v2-sr-pager">
          <button type="button" disabled={history.page===history.first}
            onClick={()=>{setHistory(previousOwnerPage);setSelected(null);}}>Previous page</button>
          <button type="button" disabled={page.continuation===null}
            onClick={()=>{
              if(!page.continuation)return;
              const next=first+'&cursor='+encodeURIComponent(JSON.stringify(page.continuation));
              setHistory(old=>nextOwnerPage(old,next,first+'&cursor='));setSelected(null);
            }}>Next page</button>
        </div>
        {chosen&&<TaskDetails key={chosen.task_id} id={chosen.task_id} summary={chosen} navigate={navigate}/>}
      </>;
    }}/>
  </section>;
}
