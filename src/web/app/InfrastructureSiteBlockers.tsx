import {useEffect,useState} from 'react';
import {OwnerProjection} from '../components/OwnerProjection';
import {filterFingerprint} from '../data/query-controller';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';

type Blocker=Readonly<{provider_order:number;blocker_kind:string;blocker_id:string;reason_code:string}>;
type Cursor=Readonly<{version:1;query_id:'SiteArchiveBlockerQuery';
  sort_registry_id:'SiteArchiveBlockerQuery_ORDER_V1';
  last_key_tuple:readonly [number,string,string];filter_fingerprint:string;null_order:'NOT_APPLICABLE'}>;
type Page=Readonly<{items:readonly Blocker[];next_cursor:Cursor|null;
  exact_count:number;indeterminate:boolean}>;
const goodString=(v:unknown)=>typeof v==='string'&&v.length>0&&new TextEncoder().encode(v).length<=128;
const positive=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const first=(id:string)=>'/api/v1/infrastructure/sites/'+encodeURIComponent(id)+'/archive-blockers?limit=25';
function validate(page:Page,hash:string):void{
  if(!page||!Array.isArray(page.items)||page.items.length>25
    ||!positive(page.exact_count)||typeof page.indeterminate!=='boolean'
    ||!Object.hasOwn(page,'next_cursor'))throw new Error('Invalid Site blocker owner page');
  let previous:readonly [number,string,string]|null=null;
  for(const item of page.items){
    if(!item||!positive(item.provider_order)||!goodString(item.blocker_kind)
      ||!goodString(item.blocker_id)||!goodString(item.reason_code))
      throw new Error('Invalid Site blocker identity');
    const key:[number,string,string]=[item.provider_order,item.blocker_kind,item.blocker_id];
    if(previous&&(key[0]<previous[0]||key[0]===previous[0]&&
      (key[1]<previous[1]||key[1]===previous[1]&&key[2]<=previous[2])))
      throw new Error('Unordered Site blocker page');
    previous=key;
  }
  const c=page.next_cursor;
  if(c!==null&&(!c||!previous||page.items.length!==25||c.version!==1
    ||c.query_id!=='SiteArchiveBlockerQuery'
    ||c.sort_registry_id!=='SiteArchiveBlockerQuery_ORDER_V1'
    ||c.null_order!=='NOT_APPLICABLE'||c.filter_fingerprint!==hash
    ||!Array.isArray(c.last_key_tuple)||c.last_key_tuple.length!==3
    ||c.last_key_tuple.some((part,i)=>part!==previous![i])
    ||Object.keys(c).sort().join(',')!==
      'filter_fingerprint,last_key_tuple,null_order,query_id,sort_registry_id,version'))
    throw new Error('Foreign Site blocker continuation');
  if(!page.indeterminate&&page.exact_count<page.items.length)
    throw new Error('Inconsistent Site blocker count');
}
export function InfrastructureSiteBlockers({siteId}:{siteId:string}){
  const [opened,setOpened]=useState(false);
  const [digest,setDigest]=useState<string|null>(null);
  const [history,setHistory]=useState(()=>initialOwnerPage(first(siteId)));
  useEffect(()=>{
    let active=true;void filterFingerprint({site_id:siteId})
      .then(value=>{if(active)setDigest(value);}).catch(()=>{if(active)setDigest(null);});
    return()=>{active=false;};
  },[siteId]);
  return <section aria-label="Site dependency controls">
    <button type="button" aria-expanded={opened} onClick={()=>setOpened(v=>!v)}>
      {opened?'Hide':'Inspect'} Site archive blockers
    </button>
    {opened&&<section aria-label="Site blocker evidence">
      <h4>Site operational dependencies</h4>
      <p>Archive readiness is not determined by this view. Separate dependency providers may be indeterminate.</p>
      {digest===null?<p role="status">Preparing owner query identity.</p>:
        <OwnerProjection<Page> path={ownerPagePath(history)} render={raw=>{
          validate(raw,digest);
          return <>
            <p>Owner-reported blocker count: {raw.exact_count}. Current page: {raw.items.length} rows.</p>
            {raw.indeterminate?<p role="alert">Dependency enumeration is indeterminate; no archive clearance can be claimed.</p>:
              <p>Dependency count is determinate; no archive action is authorized here.</p>}
            {raw.items.length===0&&<p role="status">No blocker rows on this page.</p>}
            {raw.items.length>0&&<div className="soma-v2-sr-table-viewport" data-scroll-owner="x">
              <table className="soma-v2-sr-table"><caption>Site archive dependency rows</caption>
                <thead><tr><th scope="col">Provider order</th><th scope="col">Kind</th>
                  <th scope="col">Identity</th><th scope="col">Reason</th></tr></thead>
                <tbody>{raw.items.map(item=><tr key={item.provider_order+':'+item.blocker_kind+':'+item.blocker_id}>
                  <td>{item.provider_order}</td><td>{item.blocker_kind}</td>
                  <td>{item.blocker_id}</td><td>{item.reason_code}</td>
                </tr>)}</tbody>
              </table>
            </div>}
            <div className="soma-v2-sr-pager">
              <button type="button" disabled={history.page===history.first}
                onClick={()=>setHistory(previousOwnerPage)}>Previous page</button>
              <span>Page {history.page+1}</span>
              <button type="button" disabled={raw.next_cursor===null}
                onClick={()=>{
                  if(raw.next_cursor===null)return;
                  const next=first(siteId)+'&cursor='+encodeURIComponent(JSON.stringify(raw.next_cursor));
                  setHistory(old=>nextOwnerPage(old,next,first(siteId)+'&cursor='));
                }}>Next page</button>
            </div>
          </>;
        }}/>}
    </section>}
  </section>;
}
