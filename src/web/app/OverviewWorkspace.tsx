import {OwnerProjection} from '../components/OwnerProjection';

type CountRead=Readonly<{total_count_at_read:number;sort_registry_id:string;
  items:readonly unknown[];continuation:unknown|null}>;
function CountTile({title,route,sort,href,navigate}:{title:string;route:string;sort:string;href:string;navigate:(path:string)=>void}) {
  return <section aria-label={title+' register total'} className="soma-v2-overview-tile">
    <h3>{title}</h3>
    <OwnerProjection<CountRead> path={route} render={result=>{
      if(!result||!Number.isSafeInteger(result.total_count_at_read)||result.total_count_at_read<0
        ||result.sort_registry_id!==sort||!Array.isArray(result.items)||result.items.length>1
        ||!Object.hasOwn(result,'continuation'))throw new Error('Invalid owner count');
      return <div className="soma-v2-overview-count"><strong>{result.total_count_at_read}</strong>
        <span>At owner read · all current identities</span></div>;
    }}/>
    <button type="button" onClick={()=>navigate(href)}>Open {title} ↗</button>
  </section>;
}
/** Composed counts only; not yet the LLD-11 weekly operational timeline. */
export function OverviewWorkspace({navigate}:{navigate:(path:string)=>void}){
  return <section className="soma-v2-overview" aria-label="Operations overview">
    <header className="soma-v2-overview-title">
      <h2>Operations Overview</h2>
      <p>Read-only · locally accepted records · independent owner snapshots</p>
    </header>
    <div className="soma-v2-overview-grid">
      <CountTile title="Service Requests" href="/tickets"
        route="/api/v1/tickets/service-requests?limit=1" sort="SR_UPDATED_ID_DESC_V1" navigate={navigate}/>
      <CountTile title="RFCs" href="/tickets/rfcs"
        route="/api/v1/tickets/rfcs?limit=1" sort="RFC_UPDATED_ID_DESC_V1" navigate={navigate}/>
    </div>
    <section className="soma-v2-overview-scope" aria-label="Overview scope">
      <h3>Operational context</h3>
      <p>Counts are from separate owner reads, not a synchronized report.
        SR source statuses cannot establish Active/Archived lifecycle.
        RFC local archive state belongs to RFC ownership only.</p>
      <p>Weekly maintenance summary, infrastructure events, warehouse attention and the
        operational timeline are not yet composed for this Overview surface.</p>
      <nav aria-label="Other operational workspaces">
        <button type="button" onClick={()=>navigate('/objectives')}>Maintenance Windows &amp; Tasks ↗</button>
        <button type="button" onClick={()=>navigate('/inventory')}>Inventory ↗</button>
        <button type="button" onClick={()=>navigate('/infrastructure')}>Infrastructure ↗</button>
      </nav>
    </section>
  </section>;
}
