import {useEffect,useState,type FormEvent} from 'react';
import {
  EMPTY_EXPLORER_FILTERS,EXPLORER_KINDS,EXPLORER_LIFECYCLES,
  buildExplorerQuery,readExplorerFilters,type ExplorerFilters,
} from '../presentation/infrastructure-explorer-filters';

type Props=Readonly<{path:string;onApply:(next:string)=>void}>;
const labels:Readonly<Record<string,string>>={
  site:'Site',room:'Room',rack:'Rack',cloud_deployment:'Cloud Deployment',
  network_element:'Network Element',containment:'Containment context',
};
/** Owner-backed exact filtering; no client-side search, guessed hierarchy,
 * silent truncation or mutation. Applying a filter begins at owner page 1.
 */
export function InfrastructureExplorerFilters({path,onApply}:Props){
  const [draft,setDraft]=useState<ExplorerFilters>(()=>readExplorerFilters(path)??EMPTY_EXPLORER_FILTERS);
  const [error,setError]=useState<string|null>(null);
  const applied=readExplorerFilters(path)??EMPTY_EXPLORER_FILTERS;
  useEffect(()=>{setDraft(readExplorerFilters(path)??EMPTY_EXPLORER_FILTERS);setError(null);},[path]);
  const set=(key:keyof ExplorerFilters,value:string)=>{
    setDraft(old=>({...old,[key]:value}));setError(null);
  };
  const apply=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const next=buildExplorerQuery(draft);
    if(next===null){
      setError('Enter lowercase UUID identities for exact Customer/Site filtering and select valid owner options.');
      return;
    }
    setError(null);
    onApply(next);
  };
  const filtered=Object.values(applied).some(Boolean);
  return <form className="soma-infra-owner-filters" aria-label="Infrastructure owner filters"
    onSubmit={apply} noValidate>
    <div className="soma-infra-owner-filter-fields">
      <label>Customer Organization UUID
        <input type="text" value={draft.customerOrgId} maxLength={36}
          autoComplete="off" spellCheck={false} placeholder="All customers"
          onChange={event=>set('customerOrgId',event.target.value)}/>
      </label>
      <label>Site UUID
        <input type="text" value={draft.siteId} maxLength={36}
          autoComplete="off" spellCheck={false} placeholder="All sites"
          onChange={event=>set('siteId',event.target.value)}/>
      </label>
      <label>Node kind
        <select value={draft.nodeKind} onChange={event=>set('nodeKind',event.target.value)}>
          <option value="">All kinds</option>
          {EXPLORER_KINDS.map(kind=><option key={kind} value={kind}>{labels[kind]}</option>)}
        </select>
      </label>
      <label>Lifecycle
        <select value={draft.lifecycle} onChange={event=>set('lifecycle',event.target.value)}>
          <option value="">Active and archived</option>
          {EXPLORER_LIFECYCLES.map(state=><option key={state} value={state}>
            {state==='active'?'Active':'Archived'}</option>)}
        </select>
      </label>
    </div>
    <div className="soma-infra-owner-filter-actions">
      <button type="submit">Apply owner filters</button>
      <button type="button" disabled={!filtered&&Object.values(draft).every(value=>value==='')}
        onClick={()=>{setDraft(EMPTY_EXPLORER_FILTERS);setError(null);
          onApply(buildExplorerQuery(EMPTY_EXPLORER_FILTERS)!);}}>Clear filters</button>
      <span role="status">{filtered?'Filtered owner collection':'All owner collection scopes'}.
        Filters are exact; Structure only changes how matching owner rows appear.</span>
    </div>
    {error&&<p role="alert">{error} No owner request was sent.</p>}
  </form>;
}
