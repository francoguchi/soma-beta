import {useContext} from 'react';
import {OwnerProjection,OwnerReturnRefresh} from '../components/OwnerProjection';

// The existing authenticated LLD-04 GetProposalReview is read-only. Never
// interpret allowed_dispositions as authorization to submit a mutation.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha=/^[a-f0-9]{64}$/u;
const dispositions=new Set(['accept','reject','defer']);
const value=(x:unknown):x is string|number|null=>x===null||typeof x==='string'||
  typeof x==='number'&&Number.isSafeInteger(x);
const safeText=(x:unknown)=>typeof x==='string'&&x.length>0&&new TextEncoder().encode(x).length<=8192;
type Change=Readonly<{ordinal:number;field_key:string;change_kind:string;value_kind:string;
  before:string|number|null;after:string|number|null;source_observation_field_id:string|null}>;
type Review=Readonly<{
  proposal:Readonly<{proposal_id:string;proposal_kind:string;target_kind:string;risk_class:string;
    state:string;proposal_revision:number;proposal_fingerprint:string;base_state_token:string;
    evidence:Readonly<{mode:string;import_run_id:string}>}>;
  changes:readonly Change[];
  target_preview:Readonly<Record<string,unknown>>;
  stale:boolean;
  allowed_dispositions:readonly string[];
}>;
function validate(review:Review,identity:{proposalId:string;importRunId:string;
  listedRevision:number;listedState:string;listedFingerprint:string}):{preview:string}{
  const p=review?.proposal;
  if(!p||p.proposal_id!==identity.proposalId||p.evidence?.import_run_id!==identity.importRunId
    ||p.proposal_revision!==identity.listedRevision||p.state!==identity.listedState
    ||p.proposal_fingerprint!==identity.listedFingerprint
    ||!sha.test(p.proposal_fingerprint)||!sha.test(p.base_state_token)
    ||!safeText(p.proposal_kind)||!safeText(p.target_kind)
    ||!['low','medium','high','blocked'].includes(p.risk_class)
    ||!['pending','accepted','rejected','deferred','superseded','no_change'].includes(p.state)
    ||!['observed_row','population_absence'].includes(p.evidence.mode)
    ||typeof review.stale!=='boolean'
    ||!Array.isArray(review.allowed_dispositions)
    ||review.allowed_dispositions.length>3
    ||new Set(review.allowed_dispositions).size!==review.allowed_dispositions.length
    ||review.allowed_dispositions.some((x:string)=>!dispositions.has(x))
    ||(p.state!=='pending'&&review.allowed_dispositions.length>0)
    ||(review.stale&&review.allowed_dispositions.includes('accept'))
    ||!Array.isArray(review.changes)||review.changes.length>128
    ||!review.target_preview||typeof review.target_preview!=='object'
    ||Array.isArray(review.target_preview))
    throw new Error('Invalid LLD-04 proposal review owner projection');
  for(let index=0;index<review.changes.length;index++){
    const c=review.changes[index];
    if(!c||c.ordinal!==index||!safeText(c.field_key)||!safeText(c.change_kind)
      ||!safeText(c.value_kind)||!value(c.before)||!value(c.after)
      ||c.source_observation_field_id!==null&&!uuid.test(c.source_observation_field_id)
      ||typeof c.before==='string'&&new TextEncoder().encode(c.before).length>8192
      ||typeof c.after==='string'&&new TextEncoder().encode(c.after).length>8192)
      throw new Error('Invalid LLD-04 typed proposal change');
  }
  const preview=JSON.stringify(review.target_preview);
  if(typeof preview!=='string'||new TextEncoder().encode(preview).length>32768)
    throw new Error('Invalid LLD-04 target preview');
  return {preview};
}
/** Only current exact owner evidence, with no accept/reject/defer controls. */
export function ImportProposalReview({proposalId,importRunId,listedRevision,listedState,listedFingerprint}:{
  proposalId:string;importRunId:string;listedRevision:number;listedState:string;listedFingerprint:string;
}){
  const generation=useContext(OwnerReturnRefresh);
  return <aside className="soma-v2-sr-details" aria-label="Selected reconciliation proposal">
    <h5>Reconciliation proposal · owner review</h5>
    <OwnerProjection<Review> key={generation} path={'/api/v1/imports/proposals/'+encodeURIComponent(proposalId)}
      render={review=>{
        const {preview}=validate(review,{proposalId,importRunId,listedRevision,listedState,listedFingerprint});
        const p=review.proposal;
        return <>
          <div className="soma-v2-sr-details-grid">
            <span>Proposal ID</span><span>{p.proposal_id}</span>
            <span>Kind</span><span>{p.proposal_kind}</span>
            <span>Target owner</span><span>{p.target_kind}</span>
            <span>Listed/confirmed state</span><strong>{p.state}</strong>
            <span>Risk class</span><strong>{p.risk_class}</strong>
            <span>Review freshness</span><strong>{review.stale?'STALE — refresh source evidence':'Current at this owner read'}</strong>
            <span>Owner dispositions (information only)</span>
            <span>{review.allowed_dispositions.length?review.allowed_dispositions.join(', '):'None currently returned'}</span>
          </div>
          <p>The listed dispositions are evidence, not available actions. No proposal decision is submitted.</p>
          <section aria-label="Proposal field changes">
            <h6>Source-to-target field changes</h6>
            {review.changes.length===0?<p role="status">No owner field changes reported.</p>:
              <div className="soma-v2-sr-table-viewport" data-scroll-owner="x">
                <table className="soma-v2-sr-table"><thead><tr>
                  <th scope="col">Field</th><th scope="col">Operation</th>
                  <th scope="col">Before</th><th scope="col">After</th>
                </tr></thead><tbody>
                  {review.changes.map(c=><tr key={c.ordinal}>
                    <td>{c.field_key}</td><td>{c.change_kind}</td>
                    <td>{c.before===null?'Not supplied':String(c.before)}</td>
                    <td>{c.after===null?'Not supplied':String(c.after)}</td>
                  </tr>)}
                </tbody></table>
              </div>}
          </section>
          <section aria-label="Proposal target preview">
            <h6>Read-only target preview</h6>
            <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{preview}</pre>
          </section>
        </>;
      }}/>
  </aside>;
}
