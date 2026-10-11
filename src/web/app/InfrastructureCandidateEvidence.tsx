import {useEffect,useState} from 'react';
import {OwnerProjection} from '../components/OwnerProjection';
import {filterFingerprint} from '../data/query-controller';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const whole=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const str=(v:unknown)=>typeof v==='string'&&v.length>0&&new TextEncoder().encode(v).length<=128;
type Candidate=Readonly<{network_element_id:string;evidence_rank:number;evidence_codes:readonly string[];
  site_id:string;lifecycle:'active'|'archived'}>;
type Cursor=Readonly<{version:1;query_id:'NetworkElementCandidateQuery';
  sort_registry_id:'NetworkElementCandidateQuery_ORDER_V1';last_key_tuple:readonly [number,string];
  filter_fingerprint:string;null_order:'NOT_APPLICABLE'}>;
type Page=Readonly<{candidates:readonly Candidate[];next_cursor:Cursor|null;candidate_count:number}>;
const start=(siteId:string,modelId:string|null)=>'/api/v1/infrastructure/network-elements/candidates?site_id='+
  encodeURIComponent(siteId)+(modelId===null?'':'&model_id='+encodeURIComponent(modelId))+'&limit=25';
function validate(page:Page,fingerprint:string,path:string):void{
  if(!page||!Array.isArray(page.candidates)||page.candidates.length>25
    ||!whole(page.candidate_count)||page.candidate_count<page.candidates.length
    ||!Object.hasOwn(page,'next_cursor'))
    throw new Error('Invalid Network Element candidate owner page');
  const rawCursor=new URL(path,'http://127.0.0.1').searchParams.get('cursor');
  let seek:readonly [number,string]|null=null;
  if(rawCursor!==null){
    const cursor=JSON.parse(rawCursor) as Cursor;
    if(!cursor||cursor.version!==1||cursor.query_id!=='NetworkElementCandidateQuery'
      ||cursor.sort_registry_id!=='NetworkElementCandidateQuery_ORDER_V1'
      ||cursor.null_order!=='NOT_APPLICABLE'||cursor.filter_fingerprint!==fingerprint
      ||!Array.isArray(cursor.last_key_tuple)||cursor.last_key_tuple.length!==2
      ||!whole(cursor.last_key_tuple[0])||!uuid.test(cursor.last_key_tuple[1]))
      throw new Error('Foreign requested candidate cursor');
    seek=cursor.last_key_tuple;
  }
  let prior:readonly [number,string]|null=null;
  const seen=new Set<string>();
  for(const item of page.candidates){
    if(!item||!uuid.test(item.network_element_id)||!uuid.test(item.site_id)
      ||!whole(item.evidence_rank)||item.evidence_rank===0
      ||!['active','archived'].includes(item.lifecycle)
      ||!Array.isArray(item.evidence_codes)||item.evidence_codes.length<1||item.evidence_codes.length>8
      ||item.evidence_codes.some((code:string)=>!str(code))
      ||item.evidence_codes.some((code:string,i:number)=>i>0&&code<=item.evidence_codes[i-1]!)
      ||seen.has(item.network_element_id)
      ||seek&&(item.evidence_rank>seek[0]||
        item.evidence_rank===seek[0]&&item.network_element_id<=seek[1])
      ||prior&&(item.evidence_rank>prior[0]||
        item.evidence_rank===prior[0]&&item.network_element_id<=prior[1]))
      throw new Error('Invalid candidate ordering or evidence');
    seen.add(item.network_element_id);
    prior=[item.evidence_rank,item.network_element_id];
  }
  const c=page.next_cursor;
  if(c!==null&&(!c||page.candidates.length!==25||!prior
    ||c.version!==1||c.query_id!=='NetworkElementCandidateQuery'
    ||c.sort_registry_id!=='NetworkElementCandidateQuery_ORDER_V1'
    ||c.null_order!=='NOT_APPLICABLE'||c.filter_fingerprint!==fingerprint
    ||!Array.isArray(c.last_key_tuple)||c.last_key_tuple.length!==2
    ||c.last_key_tuple[0]!==prior[0]||c.last_key_tuple[1]!==prior[1]
    ||Object.keys(c).sort().join(',')!==
      'filter_fingerprint,last_key_tuple,null_order,query_id,sort_registry_id,version'))
    throw new Error('Foreign candidate continuation');
}
/** LLD-08 candidate discovery combines exact Site/Model evidence through the
 * owner's ranked candidate query. Rank is evidence, NOT confirmed identity.
 */
export function InfrastructureCandidateEvidence({siteId,modelId,elementId}:{
  siteId:string;modelId:string|null;elementId:string;
}){
  const [opened,setOpened]=useState(false);
  const [digest,setDigest]=useState<string|null>(null);
  const [history,setHistory]=useState(()=>initialOwnerPage(start(siteId,modelId)));
  useEffect(()=>{
    let active=true;
    const filters=modelId===null?{site_id:siteId}:{model_id:modelId,site_id:siteId};
    void filterFingerprint(filters).then(value=>{if(active)setDigest(value);})
      .catch(()=>{if(active)setDigest(null);});
    return()=>{active=false;};
  },[siteId,modelId]);
  return <section aria-label="Network Element candidate controls">
    <button type="button" aria-expanded={opened} onClick={()=>setOpened(v=>!v)}>
      {opened?'Hide':'Inspect'} related Network Element candidates
    </button>
    {opened&&<section aria-label="Related NE candidate evidence" className="soma-v2-rfc-links">
      <h4>Exact owner evidence candidates</h4>
      <p>Candidate filters: Site {siteId}{modelId===null?'':', Model '+modelId}. The owner
        ranks exact Site evidence{modelId===null?'':' and Model evidence'}. A candidate is NOT a verified
        duplicate, operational relationship, containment parent or physical installation.</p>
      {digest===null?<p role="status">Preparing candidate query identity.</p>:
        <OwnerProjection<Page> path={ownerPagePath(history)} render={page=>{
          validate(page,digest,ownerPagePath(history));
          return <>
            <p>Owner-reported candidate count: {page.candidate_count}; this page: {page.candidates.length}.</p>
            {page.candidates.length===0&&<p role="status">No matches on this candidate owner page.</p>}
            {page.candidates.length>0&&<div className="soma-v2-sr-table-viewport" data-scroll-owner="x">
              <table className="soma-v2-sr-table"><caption>Network Element owner candidates</caption>
                <thead><tr><th scope="col">Network Element</th><th scope="col">Site</th>
                  <th scope="col">Evidence rank</th><th scope="col">Matched exact evidence</th>
                  <th scope="col">Lifecycle</th></tr></thead>
                <tbody>{page.candidates.map(item=><tr key={item.network_element_id}>
                  <td>{item.network_element_id===elementId?'Selected NE: ':''}{item.network_element_id}</td>
                  <td>{item.site_id}</td><td>{item.evidence_rank}</td>
                  <td>{item.evidence_codes.join(', ')}</td><td>{item.lifecycle}</td>
                </tr>)}</tbody>
              </table>
            </div>}
            <div className="soma-v2-sr-pager">
              <button type="button" disabled={history.page===history.first}
                onClick={()=>setHistory(previousOwnerPage)}>Previous page</button>
              <span>Page {history.page+1}</span>
              <button type="button" disabled={page.next_cursor===null}
                onClick={()=>{
                  if(page.next_cursor===null)return;
                  const next=start(siteId,modelId)+'&cursor='+encodeURIComponent(JSON.stringify(page.next_cursor));
                  setHistory(old=>nextOwnerPage(old,next,start(siteId,modelId)+'&cursor='));
                }}>Next page</button>
            </div>
          </>;
        }}/>}
      <p>No merge, registration, Site move or other mutation is authorized by this evidence.</p>
    </section>}
  </section>;
}
