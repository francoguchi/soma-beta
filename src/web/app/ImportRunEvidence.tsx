import {useContext,useEffect,useState} from 'react';
import {OwnerProjection,OwnerReturnRefresh} from '../components/OwnerProjection';
import {filterFingerprint} from '../data/query-controller';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';
import {ImportProposalReview} from './ImportProposalReview';
import {ImportPublishedObservations} from './ImportPublishedObservations';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha=/^[a-f0-9]{64}$/u;
const count=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0;
const severity=['high_risk','error','warning','info'] as const;
const states=['pending','accepted','rejected','deferred','superseded','no_change'] as const;
const risks=['low','medium','high','blocked'] as const;
type RunDetail=Readonly<{run:{import_run_id:string;source_family:string;candidate_filename:string;run_state:string;
  invocation_kind:string;logical_fingerprint:string|null;revision:number};
  checkpoint_comparison:{classification:string;candidate:object;checkpoint:object|null}|null;
  review_state:{pending:number;accepted:number;rejected:number;deferred:number;can_finalize:boolean;recovery_authorized:boolean}}>;
type Finding=Readonly<{import_finding_id:string;finding_code:string;severity:string;scope_kind:string;
  message_text:string;source_observation_id:string|null;field_key:string|null}>;
type Proposal=Readonly<{proposal_id:string;proposal_kind:string;target_kind:string;risk_class:string;state:string;
  proposal_revision:number;proposal_fingerprint:string;base_state_token:string;
  evidence:{mode:string;import_run_id:string}}>;
type Cursor={version:number;query_id:string;sort_registry_id:string;last_key_tuple:(string|number)[];
  null_order:string;filter_fingerprint:string};
type Page<T>=Readonly<{items:readonly T[];exact_total:number;next_cursor:Cursor|null}>;
type Kind='findings'|'proposals';
function validatePage(value:Page<Finding|Proposal>,kind:Kind,fingerprint:string,runId:string):Page<Finding|Proposal>{
  if(!value||!Array.isArray(value.items)||value.items.length>25||!count(value.exact_total)
    ||value.exact_total<value.items.length||!Object.hasOwn(value,'next_cursor'))
    throw new Error('Invalid import evidence owner page');
  let previous:[number,number,string]|null=null;
  for(const entry of value.items){
    let key:[number,number,string];
    if(kind==='findings'){
      const f=entry as Finding,rank=severity.indexOf(f?.severity as typeof severity[number]);
      if(!f||!uuid.test(f.import_finding_id)||rank<0||typeof f.finding_code!=='string'
        ||!f.finding_code||f.finding_code.length>128||typeof f.message_text!=='string'
        ||new TextEncoder().encode(f.message_text).length>8192
        ||typeof f.scope_kind!=='string'||!f.scope_kind
        ||f.source_observation_id!==null&&!uuid.test(f.source_observation_id)
        ||f.field_key!==null&&typeof f.field_key!=='string')
        throw new Error('Invalid import finding');
      key=[rank,0,f.import_finding_id];
    }else{
      const p=entry as Proposal,s=states.indexOf(p?.state as typeof states[number]),
        risk=risks.indexOf(p?.risk_class as typeof risks[number]);
      if(!p||!uuid.test(p.proposal_id)||s<0||risk<0
        ||!p.proposal_kind||typeof p.proposal_kind!=='string'
        ||!p.target_kind||typeof p.target_kind!=='string'
        ||!count(p.proposal_revision)||p.proposal_revision<1||!sha.test(p.proposal_fingerprint)
        ||!sha.test(p.base_state_token)||!p.evidence||p.evidence.import_run_id!==runId
        ||!['observed_row','population_absence'].includes(p.evidence.mode))
        throw new Error('Invalid import proposal');
      key=[s,risk,p.proposal_id];
    }
    if(previous&&(key[0]<previous[0]||key[0]===previous[0]&&(
      kind==='findings'?key[2]<=previous[2]:
        key[1]>previous[1]||key[1]===previous[1]&&key[2]<=previous[2])))
      throw new Error('Import evidence not in owner order');
    previous=key;
  }
  const c=value.next_cursor;
  if(c!==null&&(!c||!previous||c.version!==1||c.null_order!=='none'
    ||c.filter_fingerprint!==fingerprint||!sha.test(c.filter_fingerprint)
    ||c.query_id!==(kind==='findings'?'ListImportFindings':'ListReconciliationProposals')
    ||c.sort_registry_id!==(kind==='findings'?'IMPORT_FINDING_SEVERITY_ID_ASC_V1':'IMPORT_PROPOSAL_STATE_RISK_ID_V1')
    ||!Array.isArray(c.last_key_tuple)||JSON.stringify(c.last_key_tuple)!==JSON.stringify(
      kind==='findings'?[previous[0],previous[2]]:previous)))
    throw new Error('Invalid import evidence continuation');
  return value;
}
function Evidence({runId,kind}:{runId:string;kind:Kind}) {
  const first='/api/v1/imports/runs/'+encodeURIComponent(runId)+'/'+kind+'?limit=25';
  const [history,setHistory]=useState(()=>initialOwnerPage(first));
  const [fingerprint,setFingerprint]=useState<string|null>(null);
  const [selectedProposal,setSelectedProposal]=useState<string|null>(null);
  const generation=useContext(OwnerReturnRefresh);
  useEffect(()=>{
    let active=true;setFingerprint(null);
    const filters=kind==='findings'
      ?{schema:'SOMA_IMPORT_FINDING_LIST_FILTER_V1',import_run_id:runId,severity:null,scope_kind:null}
      :{schema:'SOMA_IMPORT_PROPOSAL_LIST_FILTER_V1',import_run_id:runId,state:null,risk:null,kind:null};
    void filterFingerprint(filters).then(value=>{if(active)setFingerprint(value);});
    return()=>{active=false;};
  },[kind,runId]);
  const title=kind==='findings'?'Import findings':'Reconciliation proposals';
  return <section aria-label={title} className="soma-v2-rfc-links"><h4>{title}</h4>
    {fingerprint===null?<p role="status">Loading accepted {kind} context.</p>:
    <OwnerProjection<Page<Finding|Proposal>> key={generation} path={ownerPagePath(history)} render={raw=>{
      const page=validatePage(raw,kind,fingerprint,runId);
      const selected=kind==='proposals'?page.items.find(item=>(item as Proposal).proposal_id===selectedProposal) as Proposal|undefined:undefined;
      return <>
        <p>{page.exact_total} {kind} in owner projection; {page.items.length} on this page.</p>
        {page.items.length===0&&<p role="status">No {kind} returned for this run.</p>}
        <div className="soma-v2-sr-table-viewport" data-scroll-owner="x"><table className="soma-v2-sr-table">
          <thead><tr><th scope="col">{kind==='findings'?'Severity':'State'}</th>
            <th scope="col">{kind==='findings'?'Finding':'Proposal kind'}</th>
            <th scope="col">{kind==='findings'?'Owner finding':'Risk class'}</th></tr></thead>
          <tbody>{page.items.map(item=>kind==='findings'?(()=>{
            const f=item as Finding;return <tr key={f.import_finding_id}>
              <td>{f.severity}</td><td>{f.finding_code}</td><td>{f.message_text}</td></tr>;
          })():(()=>{
            const p=item as Proposal;return <tr key={p.proposal_id}>
              <td>{p.state}</td>
              <td><button type="button" className="soma-v2-sr-rowselect"
                aria-label={'Inspect proposal '+p.proposal_id}
                aria-pressed={selected?.proposal_id===p.proposal_id}
                onClick={()=>setSelectedProposal(p.proposal_id)}>{p.proposal_kind}</button></td>
              <td>{p.risk_class}</td></tr>;
          })())}</tbody>
        </table></div>
        <div className="soma-v2-sr-pager">
          <button type="button" disabled={history.page===history.first}
            onClick={()=>{setSelectedProposal(null);setHistory(previousOwnerPage);}}>Previous page</button>
          <span>Page {history.page+1}</span>
          <button type="button" disabled={page.next_cursor===null}
            onClick={()=>{if(!page.next_cursor)return;
              const next=first+'&cursor='+encodeURIComponent(JSON.stringify(page.next_cursor));
              setSelectedProposal(null);
              setHistory(old=>nextOwnerPage(old,next,first+'&cursor='));
            }}>Next page</button>
        </div>
        {kind==='proposals'&&page.items.length>0&&!selected&&
          <p role="status">Select a proposal to inspect current review evidence; no decision is submitted.</p>}
        {selected&&<ImportProposalReview key={selected.proposal_id} proposalId={selected.proposal_id}
          importRunId={runId} listedRevision={selected.proposal_revision}
          listedState={selected.state} listedFingerprint={selected.proposal_fingerprint}/>}
      </>;
    }}/>}
  </section>;
}
/** Exact LLD-04 run evidence only, never an import/review/finalization command. */
export function ImportRunEvidence({importRunId,expectedFamily,minRevision}:{
  importRunId:string;expectedFamily:string;minRevision:number;
}) {
  const [expanded,setExpanded]=useState(false);
  const [observationsOpen,setObservationsOpen]=useState(false);
  const generation=useContext(OwnerReturnRefresh);
  return <aside aria-label="Selected import run" className="soma-v2-sr-details">
    <OwnerProjection<RunDetail> key={generation} path={'/api/v1/imports/runs/'+encodeURIComponent(importRunId)} render={detail=>{
      const r=detail?.run,v=detail?.review_state,c=detail?.checkpoint_comparison;
      if(!r||r.import_run_id!==importRunId||r.source_family!==expectedFamily
        ||!count(r.revision)||r.revision<minRevision||typeof r.candidate_filename!=='string'
        ||typeof r.run_state!=='string'||typeof r.invocation_kind!=='string'
        ||r.logical_fingerprint!==null&&!sha.test(r.logical_fingerprint)
        ||!v||!count(v.pending)||!count(v.accepted)||!count(v.rejected)||!count(v.deferred)
        ||typeof v.can_finalize!=='boolean'||typeof v.recovery_authorized!=='boolean'
        ||c!==null&&(!c||!['first_source','newer_changed','newer_identical','older_source',
          'exact_replay','equal_chronology_changed'].includes(c.classification)
          ||!c.candidate||typeof c.candidate!=='object'))
        throw new Error('Invalid import run owner detail');
      return <>
        <div className="soma-v2-sr-details-title"><strong>{r.candidate_filename||'Unreported candidate'}</strong>
          <span>{r.run_state}</span></div>
        <div className="soma-v2-sr-details-grid">
          <span>Run identity</span><span>{r.import_run_id}</span>
          <span>Invocation</span><span>{r.invocation_kind}</span>
          <span>Current revision</span><strong>{r.revision}</strong>
          <span>Checkpoint comparison</span><span>{c?.classification??'No published comparison available'}</span>
          <span>Review pending</span><strong>{v.pending}</strong>
          <span>Accepted / rejected / deferred</span><span>{v.accepted} / {v.rejected} / {v.deferred}</span>
          <span>Finalization eligibility</span><span>{v.can_finalize?
            'Owner reports eligible; no command connected':'Owner does not report this run eligible'}</span>
          <span>Recovery authorization</span><span>{v.recovery_authorized?'Authorized':'Not authorized'}</span>
        </div>
        <p>These are accepted source facts, not an approval or import operation.</p>
        <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>
          {expanded?'Hide':'Inspect'} import findings and reconciliation proposals</button>
        {expanded&&<>
          <Evidence key={importRunId+':findings'} runId={importRunId} kind="findings"/>
          <Evidence key={importRunId+':proposals'} runId={importRunId} kind="proposals"/>
        </>}
        {['staged','waiting_review','partially_accepted','accepted','rejected',
          'noop_pending_checkpoint','noop','recovery_required'].includes(r.run_state)?
          <>
            <button type="button" aria-expanded={observationsOpen}
              onClick={()=>setObservationsOpen(value=>!value)}>
              {observationsOpen?'Hide':'Inspect'} published source observations
            </button>
            {observationsOpen&&<ImportPublishedObservations key={importRunId+':observations'}
              runId={importRunId} sourceFamily={r.source_family}/>}
          </>:
          <p role="status">Published source observations are unavailable at this run state.</p>}
      </>;
    }}/>
  </aside>;
}
