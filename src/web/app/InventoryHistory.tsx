import {useContext,useEffect,useState} from 'react';
import {OwnerProjection,OwnerReturnRefresh} from '../components/OwnerProjection';
import {filterFingerprint} from '../data/query-controller';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';

type TargetKind='spare_need'|'spare_request'|'rma';
type Event=Readonly<{
  recorded_at_utc:number;authority_kind:string;immutable_event_or_relation_id:string;
  event_kind:string;command_id:string|null;source_ref:Readonly<{kind:string;id:string}>|null;
}>;
type Cursor=Readonly<{version:1;query_id:'InventoryHistoryQuery';
  sort_registry_id:'INVENTORY_HISTORY_CANONICAL_V1';
  last_key_tuple:readonly [number,string,string];filter_fingerprint:string;null_order:'not applicable'}>;
type Page=Readonly<{items:readonly Event[];continuation:Cursor|null}>;
type Key=readonly [number,string,string];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha=/^[a-f0-9]{64}$/u;
const authorities=new Set(['domain_lifecycle_event','relationship_change','application_audit_reference','source_proposal_reference']);
const nonnegative=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
const safe=(n:unknown)=>typeof n==='string'&&n.length>0&&new TextEncoder().encode(n).length<=1024;
const before=(left:Key,right:Key)=>left[0]>right[0]||
  left[0]===right[0]&&(left[1]<right[1]||left[1]===right[1]&&left[2]>right[2]);
function validate(raw:Page,fingerprint:string):Page {
  if(!raw||!Array.isArray(raw.items)||raw.items.length>25||!Object.hasOwn(raw,'continuation'))
    throw new Error('Invalid Inventory history page');
  let previous:Key|null=null;
  const identities=new Set<string>();
  for(const event of raw.items){
    if(!event||!nonnegative(event.recorded_at_utc)||!authorities.has(event.authority_kind)
      ||!safe(event.immutable_event_or_relation_id)||!safe(event.event_kind)
      ||event.command_id!==null&&!uuid.test(event.command_id)
      ||event.source_ref!==null&&(!event.source_ref||!safe(event.source_ref.kind)
        ||!safe(event.source_ref.id)))
      throw new Error('Invalid owner Inventory history event');
    const key:Key=[event.recorded_at_utc,event.authority_kind,event.immutable_event_or_relation_id];
    const id=event.authority_kind+':'+event.immutable_event_or_relation_id;
    if(identities.has(id)||previous&&!before(previous,key))
      throw new Error('Unordered or duplicated Inventory history');
    identities.add(id);previous=key;
  }
  const cursor=raw.continuation;
  if(cursor!==null&&(!previous||!cursor||cursor.version!==1
    ||cursor.query_id!=='InventoryHistoryQuery'
    ||cursor.sort_registry_id!=='INVENTORY_HISTORY_CANONICAL_V1'
    ||cursor.null_order!=='not applicable'
    ||!sha.test(cursor.filter_fingerprint)||cursor.filter_fingerprint!==fingerprint
    ||!Array.isArray(cursor.last_key_tuple)
    ||JSON.stringify(cursor.last_key_tuple)!==JSON.stringify(previous)
    ||Object.keys(cursor).sort().join(',')!==
      'filter_fingerprint,last_key_tuple,null_order,query_id,sort_registry_id,version'))
    throw new Error('Invalid Inventory history owner continuation');
  return raw;
}
function History({targetKind,targetId}:{targetKind:TargetKind;targetId:string}){
  const first='/api/v1/inventory/history/'+targetKind+'/'+encodeURIComponent(targetId)+'?limit=25';
  const [history,setHistory]=useState(()=>initialOwnerPage(first));
  const [fingerprint,setFingerprint]=useState<string|null>(null);
  const generation=useContext(OwnerReturnRefresh);
  useEffect(()=>{
    let current=true;setFingerprint(null);
    void filterFingerprint({schema:'SOMA_INVENTORY_HISTORY_FILTER_V1',
      target_kind:targetKind,target_id:targetId})
      .then(value=>{if(current)setFingerprint(value);})
      .catch(()=>{if(current)setFingerprint(null);});
    return()=>{current=false;};
  },[targetKind,targetId]);
  if(!uuid.test(targetId))throw new Error('Invalid Inventory history target identity');
  return <section aria-label="Immutable Inventory history" className="soma-v2-rfc-links">
    <h5>Immutable Inventory history — {targetKind.replaceAll('_',' ')}</h5>
    <p>These are recorded lifecycle, relationship, audit and proposal references.
      History is not an instruction to change inventory or proof of current stock eligibility.</p>
    {fingerprint===null?<p role="status">Preparing Inventory history owner query.</p>:
      <OwnerProjection<Page> key={generation} path={ownerPagePath(history)} render={raw=>{
        const page=validate(raw,fingerprint);
        return <>
          <p>{page.items.length} recorded events on this page; older events may require continuation.</p>
          {page.items.length===0&&<p role="status">No owner history events returned for this target.</p>}
          <div className="soma-v2-sr-table-viewport" data-scroll-owner="x"><table className="soma-v2-sr-table">
            <thead><tr><th scope="col">Recorded locally</th><th scope="col">Authority</th>
              <th scope="col">Event</th><th scope="col">Evidence</th></tr></thead>
            <tbody>{page.items.map(e=><tr key={e.authority_kind+':'+e.immutable_event_or_relation_id}>
              <td>{new Date(e.recorded_at_utc*1000).toLocaleString()}</td>
              <td>{e.authority_kind.replaceAll('_',' ')}</td>
              <td>{e.event_kind}</td>
              <td>{e.source_ref?e.source_ref.kind+' · '+e.source_ref.id:
                e.command_id?'Command '+e.command_id:'No external source referenced'}</td>
            </tr>)}</tbody>
          </table></div>
          <div className="soma-v2-sr-pager">
            <button type="button" disabled={history.page===history.first}
              onClick={()=>setHistory(previousOwnerPage)}>Previous page</button>
            <span>Page {history.page+1}</span>
            <button type="button" disabled={page.continuation===null}
              onClick={()=>{if(!page.continuation)return;
                const next=first+'&cursor='+encodeURIComponent(JSON.stringify(page.continuation));
                if(next.length>4096)throw new Error('Oversized Inventory history cursor');
                setHistory(old=>nextOwnerPage(old,next,first+'&cursor='));
              }}>Next page</button>
          </div>
        </>;
      }}/>}
  </section>;
}
/** History does not query until the operator opens this target's provenance. */
export function InventoryHistoryToggle({targetKind,targetId,label}:{
  targetKind:TargetKind;targetId:string;label:string;
}){
  const [expanded,setExpanded]=useState(false);
  return <section aria-label={label+' audit trail'}>
    <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>
      {expanded?'Hide':'Inspect'} {label} history
    </button>
    {expanded&&<History key={targetKind+':'+targetId} targetKind={targetKind} targetId={targetId}/>}
  </section>;
}
