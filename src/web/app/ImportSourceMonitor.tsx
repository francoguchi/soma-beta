import {useState} from 'react';
import {OwnerProjection} from '../components/OwnerProjection';
import {initialOwnerPage, nextOwnerPage, ownerPagePath, previousOwnerPage} from '../state/owner-page-history';

type Family = 'advanced_search_sr' | 'rfc_enhanced' | 'wfm_service_provider';
const families: readonly Readonly<{id:Family; label:string}>[] = [
  {id:'advanced_search_sr',label:'Advanced Search / SR'},
  {id:'rfc_enhanced',label:'Enhanced RFC'},
  {id:'wfm_service_provider',label:'WFM / Service Provider'},
];
const familyIds = new Set<string>(families.map(item=>item.id));
const uuid4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type ImportRun = Readonly<{import_run_id:string;source_family:Family;candidate_filename:string;
  run_state:string;revision:number;counts:Readonly<Record<string,number>>}>;
type SourceStatus = Readonly<{source_family:Family;configured:boolean;
  profile_ids:Readonly<Record<string,string>>;checkpoint:Readonly<{import_run_id:string;revision:number}>|null;
  latest_run:ImportRun|null}>;
type RunPage = Readonly<{items:readonly ImportRun[];next_cursor:unknown|null}>;
const firstPath='/api/v1/imports/runs?limit=25';

function validRun(run:ImportRun):boolean {
  return !!run && uuid4.test(run.import_run_id) && familyIds.has(run.source_family) &&
    typeof run.candidate_filename==='string' && run.candidate_filename.length<=512 &&
    typeof run.run_state==='string' && run.run_state.length>0 && run.run_state.length<=64 &&
    Number.isSafeInteger(run.revision) && run.revision>=1 &&
    !!run.counts && typeof run.counts==='object' && !Array.isArray(run.counts) &&
    ['observed','valid_identity','invalid','warning','proposal','pending','accepted','rejected','deferred']
      .every(key=>Number.isSafeInteger(run.counts[key]) && run.counts[key]>=0);
}
function nextPath(cursor:unknown):string {
  if(!cursor || typeof cursor!=='object' || Array.isArray(cursor) ||
     Object.keys(cursor).length!==6 ||
     !['version','query_id','sort_registry_id','last_key_tuple','filter_fingerprint','null_order']
       .every(key=>Object.hasOwn(cursor,key)))throw new Error('Invalid import run continuation');
  const path=firstPath+'&cursor='+encodeURIComponent(JSON.stringify(cursor));
  if(path.length>4096)throw new Error('Oversized import run continuation');
  return path;
}
function Status({id,label}:{id:Family;label:string}) {
  return <section className="soma-v2-overview-tile" aria-label={label+' source status'}>
    <h3>{label}</h3>
    <OwnerProjection<SourceStatus> path={'/api/v1/imports/sources/'+id} render={status=>{
      if(!status || status.source_family!==id || typeof status.configured!=='boolean'
        || !status.profile_ids || typeof status.profile_ids!=='object' || Array.isArray(status.profile_ids)
        || (status.checkpoint!==null && (!status.checkpoint ||
          !uuid4.test(status.checkpoint.import_run_id) ||
          !Number.isSafeInteger(status.checkpoint.revision) || status.checkpoint.revision<1))
        || (status.latest_run!==null && (!validRun(status.latest_run)||status.latest_run.source_family!==id)))
        throw new Error('Invalid import source owner status');
      return <><p><strong>{status.configured?'Source directory configured':'Source directory not configured'}</strong></p>
        <p>{status.checkpoint ? 'Accepted checkpoint revision '+status.checkpoint.revision : 'No accepted source checkpoint'}</p>
        <p>{status.latest_run ? 'Latest run: '+status.latest_run.run_state : 'No import runs recorded'}</p></>;
    }}/>
  </section>;
}
export function ImportSourceMonitor() {
  const [history,setHistory]=useState(()=>initialOwnerPage(firstPath));
  const [refresh,setRefresh]=useState(0);
  const path=ownerPagePath(history);
  return <section className="soma-v2-overview" aria-label="Source Imports">
    <header className="soma-v2-overview-title">
      <h2>Source Imports · Monitoring</h2>
      <p>LLD-04 · accepted source configuration, checkpoints and run history</p>
    </header>
    <div className="soma-v2-overview-grid">
      {families.map(source=><Status key={source.id} {...source}/>)}
    </div>
    <section className="soma-v2-sr-register" aria-label="Import run history">
      <div className="soma-v2-sr-register-header">
        <div><h2>Recent import runs</h2><p>Read-only · most recent first · 25 per page</p></div>
        <button type="button" onClick={()=>{
          setHistory(initialOwnerPage(firstPath));setRefresh(value=>value+1);
        }}>Refresh from latest</button>
      </div>
      <OwnerProjection<RunPage> path={path} refreshKey={refresh} render={page=>{
        if(!page || !Array.isArray(page.items) || page.items.length>25 ||
           page.items.some(run=>!validRun(run)) ||
           new Set(page.items.map(run=>run.import_run_id)).size!==page.items.length ||
           !Object.hasOwn(page,'next_cursor'))throw new Error('Invalid import run owner page');
        const next=page.next_cursor===null?null:nextPath(page.next_cursor);
        return <>
          {page.items.length===0?<p role="status">No import runs recorded in this page.</p>:
          <div className="soma-v2-sr-table-viewport" data-scroll-owner="x">
            <table className="soma-v2-sr-table"><thead><tr>
              <th scope="col">Source</th><th scope="col">Candidate</th><th scope="col">State</th>
              <th scope="col">Rows observed</th><th scope="col">Review pending</th><th scope="col">Revision</th>
            </tr></thead><tbody>{page.items.map(run=><tr key={run.import_run_id}>
              <td>{families.find(source=>source.id===run.source_family)?.label}</td>
              <td title={run.candidate_filename}>{run.candidate_filename||'Unreported filename'}</td>
              <td>{run.run_state}</td><td>{run.counts.observed}</td>
              <td>{run.counts.pending}</td><td>{run.revision}</td>
            </tr>)}</tbody></table>
          </div>}
          <div className="soma-v2-sr-pager">
            <button type="button" disabled={history.page===history.first}
              onClick={()=>setHistory(previousOwnerPage)}>Previous page</button>
            <span>Page {history.page+1}</span>
            <button type="button" disabled={next===null}
              onClick={()=>{if(next)setHistory(old=>nextOwnerPage(old,next,firstPath));}}>Next page</button>
          </div>
        </>;
      }}/>
    </section>
    <section aria-label="Import execution boundary" className="soma-v2-overview-scope">
      <h3>Import execution and review</h3>
      <p>This view reads the current LLD-04 owner. It does not run imports, accept proposals,
        finalize source checkpoints or manufacture Service Requests. The authenticated
        command/review workflow must be composed and verified separately.</p>
      <p>Source configuration only indicates a saved directory setting; it does not guarantee
        that a source file currently exists or that any imported record was accepted.</p>
    </section>
  </section>;
}
