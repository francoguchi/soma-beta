import {OwnerProjection} from '../components/OwnerProjection';
import {InfrastructureSiteBlockers} from './InfrastructureSiteBlockers';

type SiteDetail=Readonly<{
  site_id:string;revision:number;customer_org_id:string;name:string;address_text:string;
  lifecycle:'active'|'archived';dispatch_location_id:string;room_count:number;rack_count:number;
  network_element_count:number;cloud_deployment_count:number;
  archive_blocker_count:number;duplicate_candidate_count:number;
}>;
const uuid=(x:unknown):x is string=>typeof x==='string'&&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(x);
const number=(x:unknown)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const bounded=(x:unknown,bytes:number,required:boolean)=>typeof x==='string'&&
  (!required||x.length>0)&&new TextEncoder().encode(x).length<=bytes;
function verifySite(value:SiteDetail,id:string):void{
  if(!value||value.site_id!==id||!uuid(value.site_id)||!uuid(value.customer_org_id)
    ||!uuid(value.dispatch_location_id)||!number(value.revision)||value.revision<1
    ||!bounded(value.name,800,true)||!bounded(value.address_text,3200,false)
    ||!['active','archived'].includes(value.lifecycle)
    ||![value.room_count,value.rack_count,value.network_element_count,
      value.cloud_deployment_count,value.archive_blocker_count,
      value.duplicate_candidate_count].every(number))
    throw new Error('Invalid Site detail owner projection');
}
/** LLD-08 SiteDetailQuery: descriptive, selection-gated, read-only.
 * Site–Dispatch Location linkage is an owner fact, not an accepted work order.
 */
export function InfrastructureSiteDetails({id}:{id:string}){
  return <section aria-label="Opened Site" data-scroll-owner="y" data-return-scroll="detail" className="infrastructure-detail">
    <OwnerProjection<SiteDetail> path={'/api/v1/infrastructure/sites/'+encodeURIComponent(id)}
      render={raw=>{
        verifySite(raw,id);
        return <>
          <h2>{raw.name}</h2>
          <p>Site identity: {raw.site_id}. Lifecycle: {raw.lifecycle}. Accepted revision: {raw.revision}.</p>
          <h3>Location and ownership</h3>
          <dl>
            <dt>Address as recorded</dt><dd>{raw.address_text||'No address recorded'}</dd>
            <dt>Customer Organization identity</dt><dd>{raw.customer_org_id}</dd>
            <dt>Linked Dispatch Location identity</dt><dd>{raw.dispatch_location_id}</dd>
          </dl>
          <h3>Site topology — current owner counts</h3>
          <dl>
            <dt>Rooms</dt><dd>{raw.room_count}</dd>
            <dt>Racks</dt><dd>{raw.rack_count}</dd>
            <dt>Network Elements</dt><dd>{raw.network_element_count}</dd>
            <dt>Cloud Deployments</dt><dd>{raw.cloud_deployment_count}</dd>
          </dl>
          <h3>Owner validation signals</h3>
          <p>Archive blockers: {raw.archive_blocker_count}. Possible duplicate-address candidates: {raw.duplicate_candidate_count}.</p>
          <p>These are accepted Site query counts, not an inferred physical tree or permission to archive or merge Sites.
            Cloud deployment, physical placement, containment and Dispatch Location remain separate owner relationships.</p>
          <InfrastructureSiteBlockers key={raw.site_id} siteId={raw.site_id}/>
        </>;
      }}/>
  </section>;
}
