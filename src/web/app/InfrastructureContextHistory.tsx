import {useEffect,useState} from 'react';
import {OwnerProjection} from '../components/OwnerProjection';
import {BoundedCollection} from '../components/BoundedCollection';
import {filterFingerprint} from '../data/query-controller';
import {formatOwnerLocalTime} from '../presentation/owner-time';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';

type Kind='room'|'cloud_deployment';
type Change=Readonly<{field:string;prior:unknown;new:unknown}>;
type Event=Readonly<{event_id:string;event_kind:string;recorded_at_utc:number;
  effective_at_utc:number|null;command_id:string;
  summary:Readonly<{reason_code:string|null;changes:readonly Change[];warning_codes:readonly string[]}>}>;
type Cursor=Readonly<{version:1;query_id:'InfrastructureHistoryQuery';
  sort_registry_id:'InfrastructureHistoryQuery_ORDER_V1';
  last_key_tuple:readonly [number,string];filter_fingerprint:string;null_order:'NOT_APPLICABLE'}>;
type Page=Readonly<{events:readonly Event[];next_cursor:Cursor|null}>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const validSeconds=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=8640000000000;
const bounded=(s:unknown,n:number)=>typeof s==='string'&&new TextEncoder().encode(s).length<=n;
const first=(id:string,kind:Kind)=>'/api/v1/infrastructure/history?target_kind='+kind+'&target_id='+encodeURIComponent(id)+'&limit=5';
function validate(page:Page,id:string,kind:Kind,digest:string,path:string):void{
  if(!uuid.test(id)||!['room','cloud_deployment'].includes(kind)||!page
    ||!Array.isArray(page.events)||page.events.length>5||!Object.hasOwn(page,'next_cursor'))
    throw new Error('Invalid context owner history');
  const url=new URL(path,'http://127.0.0.1');
  if(url.pathname!=='/api/v1/infrastructure/history'||url.searchParams.get('target_kind')!==kind
    ||url.searchParams.get('target_id')!==id||url.searchParams.get('limit')!=='5'
    ||[...url.searchParams.keys()].some(k=>!['target_kind','target_id','limit','cursor'].includes(k)))
    throw new Error('Foreign Infrastructure context history query');
  const seek=url.searchParams.get('cursor');
  let prior:readonly [number,string]|null=null;
  if(seek){
    const c=JSON.parse(seek) as Cursor;
    if(c.filter_fingerprint!==digest)throw new Error('Foreign history cursor');
    prior=c.last_key_tuple;
  }
  const seen=new Set<string>();
  for(const event of page.events){
    if(!event||!uuid.test(event.event_id)||seen.has(event.event_id)
      ||!uuid.test(event.command_id)||!bounded(event.event_kind,128)
      ||!validSeconds(event.recorded_at_utc)
      ||event.effective_at_utc!==null&&!validSeconds(event.effective_at_utc)
      ||!event.summary||!Array.isArray(event.summary.changes)||event.summary.changes.length>32
      ||!Array.isArray(event.summary.warning_codes)||event.summary.warning_codes.length>16
      ||event.summary.warning_codes.some((w:string)=>!bounded(w,128))
      ||!(event.summary.reason_code===null||bounded(event.summary.reason_code,384))
      ||event.summary.changes.some((change:Change)=>!change||!bounded(change.field,256))
      ||prior&&(event.recorded_at_utc>prior[0]||
        event.recorded_at_utc===prior[0]&&event.event_id>=prior[1]))
      throw new Error('Invalid context history evidence');
    seen.add(event.event_id);
    prior=[event.recorded_at_utc,event.event_id];
  }
  const cursor=page.next_cursor;
  if(cursor!==null&&(!cursor||!prior||page.events.length!==5||cursor.version!==1
    ||cursor.query_id!=='InfrastructureHistoryQuery'
    ||cursor.sort_registry_id!=='InfrastructureHistoryQuery_ORDER_V1'
    ||cursor.null_order!=='NOT_APPLICABLE'||cursor.filter_fingerprint!==digest
    ||!Array.isArray(cursor.last_key_tuple)||cursor.last_key_tuple.length!==2
    ||cursor.last_key_tuple[0]!==prior[0]||cursor.last_key_tuple[1]!==prior[1]
    ||Object.keys(cursor).sort().join(',')!==
      'filter_fingerprint,last_key_tuple,null_order,query_id,sort_registry_id,version'))
    throw new Error('Invalid context history continuation');
}
/** Room and Cloud have no LLD-08 detail GET. Their authoritative history query
 * verifies current target existence, but must not be misrepresented as full details.
 */
export function InfrastructureContextHistory({id,kind}:{id:string;kind:Kind}){
  const [digest,setDigest]=useState<string|null>(null);
  const [history,setHistory]=useState(()=>initialOwnerPage(first(id,kind)));
  useEffect(()=>{
    let active=true;void filterFingerprint({target_id:id,target_kind:kind})
      .then(value=>{if(active)setDigest(value);}).catch(()=>{if(active)setDigest(null);});
    return()=>{active=false;};
  },[id,kind]);
  return <section aria-label="Opened Infrastructure context" className="infrastructure-detail"
    data-scroll-owner="y" data-return-scroll="detail">
    <h2>{kind==='room'?'Room':'Cloud Deployment'} context</h2>
    <p>Selected owner identity: {id}. This is an authenticated historical context read,
      not a full Room or Cloud Deployment detail response.</p>
    {digest===null?<p role="status">Preparing exact history identity.</p>:
      <OwnerProjection<Page> path={ownerPagePath(history)} render={page=>{
        validate(page,id,kind,digest,ownerPagePath(history));
        return <>
          <p>{page.events.length} historical events on this owner page. A missing event does not imply
            that a physical Room or Cloud configuration is empty.</p>
          <BoundedCollection caption="Infrastructure context history (local time)"
            rows={page.events.map(event=>({id:event.event_id,cells:[
              formatOwnerLocalTime(event.recorded_at_utc),
              event.event_kind,event.summary.reason_code??'No reason recorded',
              event.summary.changes.length+' changed fields',event.event_id]}))}
            next={false} onNext={()=>{}}/>
          <div className="soma-v2-sr-pager">
            <button type="button" disabled={history.page===history.first}
              onClick={()=>setHistory(previousOwnerPage)}>Previous page</button>
            <span>Page {history.page+1}</span>
            <button type="button" disabled={page.next_cursor===null}
              onClick={()=>{
                if(page.next_cursor===null)return;
                const path=first(id,kind)+'&cursor='+encodeURIComponent(JSON.stringify(page.next_cursor));
                setHistory(old=>nextOwnerPage(old,path,first(id,kind)+'&cursor='));
              }}>Next page</button>
          </div>
        </>;
      }}/>}
    <p>Physical placement, Cloud assignment and containment remain independent from
      this historical context. No mutations or inferred topology are available.</p>
  </section>;
}
