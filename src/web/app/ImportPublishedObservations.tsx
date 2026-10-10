import {useContext,useEffect,useState} from 'react';
import {OwnerProjection,OwnerReturnRefresh} from '../components/OwnerProjection';
import {filterFingerprint} from '../data/query-controller';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha=/^[a-f0-9]{64}$/u;
const families=new Set(['advanced_search_sr','rfc_enhanced','wfm_service_provider']);
const positive=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=1;
const second=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
const textField=(n:unknown)=>typeof n==='string'&&n.length>0&&new TextEncoder().encode(n).length<=8192;
type Identity='all'|'valid'|'invalid';
type Field=Readonly<{source_observation_field_id:string;field_key:string;field_class:string;
  value_state:string;value_kind:string;display_value:string|number|null}>;
type Observation=Readonly<{source_observation_id:string;source_family:string;entity_kind:string;
  identity_state:'valid'|'invalid';canonical_primary_id:string|null;canonical_parent_rfc_no:string|null;
  row_locator:Readonly<{sheet_ordinal:number;row_ordinal:number}>;
  source_row_chronology_utc:number|null;fields:readonly Field[]}>;
type Cursor=Readonly<{version:1;query_id:string;sort_registry_id:string;last_key_tuple:readonly (string|number)[];
  filter_fingerprint:string;null_order:'none'}>;
type Page=Readonly<{items:readonly Observation[];exact_total:number;next_cursor:Cursor|null}>;
function accepted(page:Page,runId:string,family:string,identity:Identity,fingerprint:string):Page{
  if(!page||!Array.isArray(page.items)||page.items.length>25||!second(page.exact_total)
    ||page.exact_total<page.items.length||!Object.hasOwn(page,'next_cursor'))
    throw new Error('Invalid published observation owner page');
  let previous:[number,number,string]|null=null;
  const ids=new Set<string>();
  for(const row of page.items){
    if(!row||!uuid.test(row.source_observation_id)||ids.has(row.source_observation_id)
      ||row.source_family!==family||!families.has(row.source_family)
      ||!textField(row.entity_kind)||!['valid','invalid'].includes(row.identity_state)
      ||identity!=='all'&&row.identity_state!==identity
      ||row.canonical_primary_id!==null&&(!textField(row.canonical_primary_id))
      ||row.canonical_parent_rfc_no!==null&&(!textField(row.canonical_parent_rfc_no))
      ||!row.row_locator||!positive(row.row_locator.sheet_ordinal)
      ||!positive(row.row_locator.row_ordinal)
      ||row.source_row_chronology_utc!==null&&!second(row.source_row_chronology_utc)
      ||!Array.isArray(row.fields)||row.fields.length>256)
      throw new Error('Invalid published source observation');
    ids.add(row.source_observation_id);
    const key:[number,number,string]=[row.row_locator.sheet_ordinal,
      row.row_locator.row_ordinal,row.source_observation_id];
    if(previous&&(key[0]<previous[0]||key[0]===previous[0]&&
      (key[1]<previous[1]||key[1]===previous[1]&&key[2]<=previous[2])))
      throw new Error('Published observation row order changed');
    previous=key;
    const fieldIds=new Set<string>();
    for(const field of row.fields){
      if(!field||!uuid.test(field.source_observation_field_id)
        ||fieldIds.has(field.source_observation_field_id)||!textField(field.field_key)
        ||!['active','deferred'].includes(field.field_class)
        ||!['usable','blank','unknown','malformed'].includes(field.value_state)
        ||!['text','controlled','instant','duration_seconds'].includes(field.value_kind)
        ||!(field.display_value===null||typeof field.display_value==='string'&&
          new TextEncoder().encode(field.display_value).length<=8192||
          second(field.display_value)))
        throw new Error('Invalid published observation field');
      fieldIds.add(field.source_observation_field_id);
    }
  }
  const c=page.next_cursor;
  if(c!==null&&(!previous||!c||c.version!==1
    ||c.query_id!=='ListPublishedSourceObservations'
    ||c.sort_registry_id!=='IMPORT_OBSERVATION_ROW_ASC_V1'
    ||c.null_order!=='none'||!sha.test(c.filter_fingerprint)
    ||c.filter_fingerprint!==fingerprint||!Array.isArray(c.last_key_tuple)
    ||JSON.stringify(c.last_key_tuple)!==JSON.stringify(previous)))
    throw new Error('Invalid published observations continuation');
  // Owner scope is the exact run ID embedded in both query path and fingerprint.
  if(!uuid.test(runId))throw new Error('Invalid selected import identity');
  return page;
}
const display=(value:string|number|null)=>value===null?'Not supplied':String(value);
/** Immutable published capture, not live SR/RFC/task state or mutation authority. */
export function ImportPublishedObservations({runId,sourceFamily}:{runId:string;sourceFamily:string}){
  const [identity,setIdentity]=useState<Identity>('all');
  const [history,setHistory]=useState(()=>initialOwnerPage('/api/v1/imports/runs/'+encodeURIComponent(runId)+'/observations?limit=25'));
  const [fingerprint,setFingerprint]=useState<string|null>(null);
  const generation=useContext(OwnerReturnRefresh);
  const first='/api/v1/imports/runs/'+encodeURIComponent(runId)+'/observations?limit=25'+
    (identity==='all'?'':'&identity_state='+identity);
  useEffect(()=>{
    let alive=true;setFingerprint(null);
    void filterFingerprint({schema:'SOMA_IMPORT_OBSERVATION_LIST_FILTER_V1',
      import_run_id:runId,identity_state:identity==='all'?null:identity})
      .then(hash=>{if(alive)setFingerprint(hash);})
      .catch(()=>{if(alive)setFingerprint(null);});
    return()=>{alive=false;};
  },[identity,runId]);
  const pagePath=ownerPagePath(history);
  return <section className="soma-v2-rfc-links" aria-label="Published source observations">
    <h4>Immutable published source observations</h4>
    <p>Source rows are evidence from one import run, not proof of accepted operational records.</p>
    <label>Identity state{' '}
      <select value={identity} onChange={event=>{
        const next=event.target.value as Identity;
        if(!['all','valid','invalid'].includes(next))return;
        setIdentity(next);
        const root='/api/v1/imports/runs/'+encodeURIComponent(runId)+'/observations?limit=25'+
          (next==='all'?'':'&identity_state='+next);
        setHistory(initialOwnerPage(root));
      }}>
        <option value="all">All published rows</option><option value="valid">Valid identities</option>
        <option value="invalid">Invalid identities</option>
      </select>
    </label>
    {fingerprint===null?<p role="status">Preparing source observation owner filter.</p>:
      <OwnerProjection<Page> key={generation+':'+identity} path={pagePath} render={raw=>{
        const page=accepted(raw,runId,sourceFamily,identity,fingerprint);
        return <>
          <p>{page.exact_total} published source observations; {page.items.length} on this page.</p>
          {page.items.length===0&&<p role="status">No published observations for this identity filter.</p>}
          {page.items.map(row=><article key={row.source_observation_id} className="soma-v2-sr-details"
            aria-label={'Source row '+row.row_locator.sheet_ordinal+':'+row.row_locator.row_ordinal}>
            <div className="soma-v2-sr-details-title"><strong>Sheet {row.row_locator.sheet_ordinal} · Row {row.row_locator.row_ordinal}</strong>
              <span>{row.identity_state} identity</span></div>
            <div className="soma-v2-sr-details-grid">
              <span>Evidence identity</span><span>{row.source_observation_id}</span>
              <span>Source entity kind</span><span>{row.entity_kind}</span>
              <span>Source primary identity</span><span>{row.canonical_primary_id??'Not determined'}</span>
              <span>Parent RFC (source)</span><span>{row.canonical_parent_rfc_no??'Not reported'}</span>
              <span>Source-row chronology</span><span>{row.source_row_chronology_utc===null
                ?'Not reported':new Date(row.source_row_chronology_utc*1000).toLocaleString()}</span>
            </div>
            {row.fields.length===0?<p role="status">No published fields for this row.</p>:
              <div className="soma-v2-sr-table-viewport" data-scroll-owner="x"><table className="soma-v2-sr-table">
                <thead><tr><th scope="col">Field</th><th scope="col">Class</th>
                  <th scope="col">Value state</th><th scope="col">Published value</th></tr></thead>
                <tbody>{row.fields.map(field=><tr key={field.source_observation_field_id}>
                  <td>{field.field_key}</td><td>{field.field_class}</td><td>{field.value_state}</td>
                  <td>{display(field.display_value)}</td>
                </tr>)}</tbody>
              </table></div>}
          </article>)}
          <div className="soma-v2-sr-pager">
            <button type="button" disabled={history.page===history.first}
              onClick={()=>setHistory(previousOwnerPage)}>Previous page</button>
            <span>Page {history.page+1}</span>
            <button type="button" disabled={page.next_cursor===null}
              onClick={()=>{if(!page.next_cursor)return;
                const next=first+'&cursor='+encodeURIComponent(JSON.stringify(page.next_cursor));
                setHistory(old=>nextOwnerPage(old,next,first+'&cursor='));
              }}>Next page</button>
          </div>
        </>;
      }}/>}
  </section>;
}
