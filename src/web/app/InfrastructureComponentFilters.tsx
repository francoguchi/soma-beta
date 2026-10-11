import {useEffect,useState,type FormEvent} from 'react';
import {
  COMPONENT_STATES,EMPTY_COMPONENT_FILTERS,
  buildComponentQuery,readComponentFilters,type ComponentFilters,
} from '../presentation/infrastructure-component-filters';
type Props=Readonly<{id:string;path:string;onApply:(next:string)=>void}>;
/** Filters the existing exact InstalledComponentQuery. Its owner determines
 * keys and returned pages; the UI does not search unvisited or removed data.
 */
export function InfrastructureComponentFilters({id,path,onApply}:Props){
  const [draft,setDraft]=useState<ComponentFilters>(()=>
    readComponentFilters(path,id)??EMPTY_COMPONENT_FILTERS);
  const [error,setError]=useState<string|null>(null);
  const applied=readComponentFilters(path,id)??EMPTY_COMPONENT_FILTERS;
  useEffect(()=>{
    setDraft(readComponentFilters(path,id)??EMPTY_COMPONENT_FILTERS);
    setError(null);
  },[path,id]);
  const set=(key:keyof ComponentFilters,value:string)=>{
    setDraft(old=>({...old,[key]:value}));setError(null);
  };
  const apply=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const next=buildComponentQuery(id,draft);
    if(next===null){
      setError('Invalid Installed Component filter: use an owner state and bounded exact BOM/slot match keys.');
      return;
    }
    setError(null);onApply(next);
  };
  const filtered=Object.values(applied).some(Boolean);
  const continued=new URL(path,'http://127.0.0.1').searchParams.has('cursor');
  return <form className="soma-infra-owner-filters" aria-label="Installed Component owner filters"
    onSubmit={apply} noValidate>
    <p>Match the owner state or exact stored match keys. These are not fuzzy names,
      and only the current accepted owner page is displayed.</p>
    <div className="soma-infra-owner-filter-fields soma-infra-component-filter-fields">
      <label>Component state
        <select value={draft.state} onChange={event=>set('state',event.target.value)}>
          <option value="">All states</option>
          {COMPONENT_STATES.map(state=><option key={state} value={state}>{state}</option>)}
        </select>
      </label>
      <label>BOM match key (exact)
        <input type="text" value={draft.bomKey} maxLength={640} autoComplete="off"
          spellCheck={false} onChange={event=>set('bomKey',event.target.value)}/>
      </label>
      <label>Slot match key (exact)
        <input type="text" value={draft.slotKey} maxLength={384} autoComplete="off"
          spellCheck={false} onChange={event=>set('slotKey',event.target.value)}/>
      </label>
    </div>
    <div className="soma-infra-owner-filter-actions">
      <button type="submit">Apply component filters</button>
      {continued&&<button type="button" onClick={()=>{
        const first=buildComponentQuery(id,applied);
        if(first!==null)onApply(first);
      }}>First component owner page</button>}
      <button type="button" disabled={!filtered&&Object.values(draft).every(value=>value==='')}
        onClick={()=>{setDraft(EMPTY_COMPONENT_FILTERS);setError(null);
          onApply(buildComponentQuery(id,EMPTY_COMPONENT_FILTERS)!);}}>Clear component filters</button>
      <span role="status">{filtered?'Filtered component owner page':'All component states and keys'}.</span>
    </div>
    {error&&<p role="alert">{error} No owner read was sent.</p>}
  </form>;
}
