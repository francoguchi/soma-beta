import {useContext,useState} from 'react';
import {OwnerProjection,OwnerReturnRefresh} from '../components/OwnerProjection';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const hex=/^[0-9a-f]{64}$/u;
const total=(n:number,items:readonly unknown[])=>Number.isSafeInteger(n)&&n>=items.length;
type Relationship=Readonly<{kind:'device'|'rfc'|'sr';relationship_id:string;related_id:string}>;
type Attention=Readonly<{kind:'historical'|'regroup'|'source_terminal';item_id:string;revision:number;
  created_at_utc:number;input_fingerprint:string}>;
type Cursor=Readonly<{version:1;query_id:string;sort_registry_id:string;last_key_tuple:readonly unknown[];
  filter_fingerprint:string;null_order:'not_applicable'}>;
type Page<T>=Readonly<{items:readonly T[];exact_total:number;continuation:Cursor|null}>;
type Kind='relationships'|'attention';
function accepted<T extends Relationship|Attention>(value:Page<T>,kind:Kind):Page<T>{
  if(!value||!Array.isArray(value.items)||value.items.length>25||
    !total(value.exact_total,value.items)||!Object.hasOwn(value,'continuation'))
    throw new Error('Invalid Task owner evidence page');
  let lastKey:string|null=null;
  for(const item of value.items) {
    if(!item||!['historical','regroup','source_terminal','device','rfc','sr'].includes(item.kind))
      throw new Error('Invalid Task evidence kind');
    if(kind==='relationships') {
      const r=item as Relationship;
      if(!['device','rfc','sr'].includes(r.kind)||!uuid.test(r.relationship_id)||!uuid.test(r.related_id))
        throw new Error('Invalid Task relationship identity');
      const key=r.kind+':'+r.related_id;
      if(lastKey!==null&&key<=lastKey)throw new Error('Task relationship sort conflict');
      lastKey=key;
    } else {
      const r=item as Attention;
      if(!['historical','regroup','source_terminal'].includes(r.kind)||!uuid.test(r.item_id)
        ||!Number.isSafeInteger(r.revision)||r.revision<1||
        !Number.isSafeInteger(r.created_at_utc)||r.created_at_utc<0||!hex.test(r.input_fingerprint))
        throw new Error('Invalid Task attention owner evidence');
      const sortable=r.kind+':'+String(r.kind==='source_terminal'?r.created_at_utc:0).padStart(16,'0')+':'+r.item_id;
      if(lastKey!==null&&sortable<=lastKey)throw new Error('Task attention sort conflict');
      lastKey=sortable;
    }
  }
  const c=value.continuation;
  const relation=kind==='relationships';
  const last=value.items.at(-1);
  const tuple=relation&&last?[last.kind,(last as Relationship).related_id]:
    last?[last.kind,(last as Attention).kind==='source_terminal'?(last as Attention).created_at_utc:0,(last as Attention).item_id]:[];
  if(c!==null&&(!last||!c||c.version!==1||
    c.query_id!==(relation?'TaskRelationshipList':'TaskAttentionList')||
    c.sort_registry_id!==(relation?'TASK_RELATIONSHIP_KIND_TARGET_ASC_V1':'TASK_ATTENTION_KIND_ORDER_ID_ASC_V1')||
    c.null_order!=='not_applicable'||!hex.test(c.filter_fingerprint)
    ||!Array.isArray(c.last_key_tuple)||JSON.stringify(c.last_key_tuple)!==JSON.stringify(tuple)))
    throw new Error('Invalid Task owner evidence cursor');
  return value;
}
function OwnerEvidencePage({taskId,kind,navigate}:{taskId:string;kind:Kind;navigate:(p:string)=>void}) {
  const first='/api/v1/tasks/'+encodeURIComponent(taskId)+'/'+kind+'?limit=25';
  const [history,setHistory]=useState(()=>initialOwnerPage(first));
  const generation=useContext(OwnerReturnRefresh);
  const title=kind==='relationships'?'Active Task relationships':'Pending Task attention';
  return <section aria-label={title} className="soma-v2-rfc-links">
    <h3>{title}</h3>
    <OwnerProjection<Page<Relationship|Attention>> key={generation} path={ownerPagePath(history)} render={raw=>{
      const page=accepted(raw,kind);
      return <>
        <p>{page.exact_total} accepted {kind==='relationships'?'active relationship links':'pending attention records'}; {page.items.length} on this page.</p>
        {page.items.length===0&&<p role="status">No {kind==='relationships'?'active Task relationships':'pending Task attention'} in this page.</p>}
        <div className="soma-v2-sr-table-viewport"><table className="soma-v2-sr-table">
          <thead><tr><th scope="col">Type</th><th scope="col">Owner identity</th><th scope="col">Evidence</th></tr></thead>
          <tbody>{page.items.map(item=>kind==='relationships'?(()=>{
            const row=item as Relationship;
            const route=row.kind==='sr'?'/tickets/sr/':row.kind==='rfc'?'/tickets/rfc/':null;
            return <tr key={row.relationship_id}>
              <td>{row.kind}</td><td>{row.related_id}</td><td>{route?
                <button type="button" onClick={()=>navigate(route+encodeURIComponent(row.related_id))}>Open linked {row.kind==='sr'?'SR':'RFC'} ↗</button>:
                <span>Device Reference link: {row.relationship_id}</span>}</td>
            </tr>;
          })():(()=>{
            const row=item as Attention;
            return <tr key={row.item_id}>
              <td>{row.kind}</td><td>{row.item_id}</td><td>Revision {row.revision}; owner fingerprint {row.input_fingerprint.slice(0,12)}…</td>
            </tr>;
          })())}</tbody>
        </table></div>
        <div className="soma-v2-sr-pager">
          <button type="button" disabled={history.page===history.first}
            onClick={()=>setHistory(previousOwnerPage)}>Previous page</button>
          <button type="button" disabled={page.continuation===null}
            onClick={()=>{if(!page.continuation)return;
              const next=first+'&cursor='+encodeURIComponent(JSON.stringify(page.continuation));
              setHistory(old=>nextOwnerPage(old,next,first+'&cursor='));
            }}>Next page</button>
        </div>
      </>;
    }}/>
  </section>;
}
/** Evidence is lazily queried only after explicit Task selection. It is not a review action. */
export function TicketTaskEvidence({taskId,navigate}:{taskId:string;navigate:(path:string)=>void}){
  const [opened,setOpened]=useState(false);
  return <section aria-label="Task supporting evidence">
    <button type="button" aria-expanded={opened} onClick={()=>setOpened(!opened)}>
      {opened?'Hide':'Inspect'} Task relationships and attention
    </button>
    {opened&&<>
      <OwnerEvidencePage key={taskId+':relationships'} taskId={taskId} kind="relationships" navigate={navigate}/>
      <OwnerEvidencePage key={taskId+':attention'} taskId={taskId} kind="attention" navigate={navigate}/>
    </>}
  </section>;
}
