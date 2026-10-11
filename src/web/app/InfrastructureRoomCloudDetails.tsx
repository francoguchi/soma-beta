import {useEffect,useId,useState} from 'react';
import {OwnerProjection} from '../components/OwnerProjection';
import {BoundedCollection} from '../components/BoundedCollection';
import {InfrastructureContextHistory} from './InfrastructureContextHistory';
import {filterFingerprint} from '../data/query-controller';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage,type OwnerPageHistory} from '../state/owner-page-history';
import {firstInfrastructureContextHistory} from '../presentation/infrastructure-context-intent';
import {firstMembersPath,membersDigestInput,nextMembersPath,verifyMembersPage,
  type MembersKind,type MembersPage,type MembersSection,type RoomCloudState} from '../presentation/infrastructure-members';
type Room=Readonly<{room_id:string;site_id:string;customer_org_id:string;name:string;
  lifecycle:'active'|'archived';revision:number;rack_count:number}>;
type Cloud=Readonly<{cloud_deployment_id:string;cloud_type_id:string;site_id:string;customer_org_id:string;
  name:string;lifecycle:'active'|'archived';revision:number;assigned_network_element_count:number}>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const count=(x:unknown)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
function verifyDetail(value:Room|Cloud,kind:MembersKind,id:string):void {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid Room/Cloud owner detail');
  const isRoom=kind==='room';
  const fields=isRoom?['room_id','site_id','customer_org_id','name','lifecycle','revision','rack_count']:
    ['cloud_deployment_id','cloud_type_id','site_id','customer_org_id','name','lifecycle','revision','assigned_network_element_count'];
  if(Object.keys(value).length!==fields.length||Object.keys(value).some(field=>!fields.includes(field)))
    throw new Error('Unexpected Room/Cloud owner fields');
  const v=value as Room&Cloud;
  if((isRoom?v.room_id:v.cloud_deployment_id)!==id||!uuid.test(id)
    ||!uuid.test(v.site_id)||!uuid.test(v.customer_org_id)
    ||(!isRoom&&!uuid.test(v.cloud_type_id))
    ||!['active','archived'].includes(v.lifecycle)
    ||!count(v.revision)||v.revision<1
    ||typeof v.name!=='string'||!v.name.trim()
    ||new TextEncoder().encode(v.name).length>(isRoom?640:800)
    ||!count(isRoom?v.rack_count:v.assigned_network_element_count))
    throw new Error('Invalid Room/Cloud owner detail');
}
function Members({kind,id,siteId,history,onHistory,onOpenRelated}:{kind:MembersKind;id:string;
  siteId:string;history:OwnerPageHistory;onHistory:(history:OwnerPageHistory)=>void;
  onOpenRelated:(kind:'rack'|'network_element',id:string)=>void}) {
  const [digest,setDigest]=useState<string|null>(null);
  useEffect(()=>{
    let active=true;
    void filterFingerprint(membersDigestInput(kind,id)).then(value=>{if(active)setDigest(value);})
      .catch(()=>{if(active)setDigest(null);});
    return()=>{active=false;};
  },[kind,id]);
  return <section aria-label={kind==='room'?'Room direct Racks':'Cloud directly assigned Network Elements'}>
    <p>{kind==='room'?'Direct physical Rack membership':'Current direct Cloud Deployment assignments'}.
      This is a bounded authoritative owner query; other pages and other relationships are not inferred.</p>
    {digest===null?<p role="status">Preparing owner relation identity.</p>:
      <OwnerProjection<MembersPage> path={ownerPagePath(history)} render={page=>{
        verifyMembersPage(page,kind,id,siteId,digest,ownerPagePath(history));
        return <><p>{page.items.length} direct members on this owner page.</p>
          {page.items.length===0&&<p>No direct members on this accepted page.</p>}
          <BoundedCollection caption={kind==='room'?'Room Rack members':'Cloud assigned Network Elements'}
            rows={page.items.map(item=>({id:item.id,cells:[item.label,item.lifecycle,item.id,
              <button type="button" onClick={()=>onOpenRelated(item.kind,item.id)}>
                Open {item.kind==='rack'?'Rack occupancy':'Network Element'}
              </button>]}))}
            next={false} onNext={()=>{}}/>
          <div className="soma-v2-sr-pager">
            <button type="button" disabled={history.page===history.first}
              onClick={()=>onHistory(previousOwnerPage(history))}>Previous member page</button>
            <span>Member page {history.page+1}</span>
            <button type="button" disabled={page.next_cursor===null} onClick={()=>{
              if(page.next_cursor===null)return;
              const path=nextMembersPath(kind,id,page.next_cursor);
              onHistory(nextOwnerPage(history,path,firstMembersPath(kind,id)+'&cursor='));
            }}>Next member page</button>
          </div>
        </>;
      }}/>}
  </section>;
}
export function InfrastructureRoomCloudDetails({kind,id,state,onState,history,onHistory,onBrowseSite,onOpenRelated}:{
  kind:MembersKind;id:string;state:RoomCloudState;onState:(state:RoomCloudState)=>void;
  history:OwnerPageHistory;onHistory:(history:OwnerPageHistory)=>void;
  onBrowseSite:(customer:string,site:string)=>void;
  onOpenRelated:(kind:'rack'|'network_element',id:string)=>void;
}) {
  const prefix=useId();
  const sections=['Summary','Members','History'] as const;
  const path=kind==='room'?'/api/v1/infrastructure/rooms/'+id:
    '/api/v1/infrastructure/cloud-deployments/'+id;
  const activate=(section:MembersSection)=>onState({section,
    members:section==='Members'?(state.members??initialOwnerPage(firstMembersPath(kind,id))):state.members});
  return <section aria-label={kind==='room'?'Opened Room':'Opened Cloud Deployment'}
    data-scroll-owner="y" data-return-scroll="detail" className="infrastructure-detail">
    <OwnerProjection<Room|Cloud> path={path} render={raw=>{
      verifyDetail(raw,kind,id);
      const details=raw as Room&Cloud;
      return <><h2>{details.name}</h2>
        <p>{kind==='room'?'Room':'Cloud Deployment'} identity: {id}.
          Lifecycle: {details.lifecycle}. Accepted revision: {details.revision}.</p>
        <div role="tablist" aria-label={kind==='room'?'Room sections':'Cloud Deployment sections'}>
          {sections.map((name,index)=><button type="button" role="tab" key={name}
            id={prefix+'-tab-'+index} aria-controls={prefix+'-panel-'+index}
            aria-selected={state.section===name} tabIndex={state.section===name?0:-1}
            data-focus-token={'infrastructure:context:tab:'+name}
            onClick={()=>activate(name)} onKeyDown={event=>{
              if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
              event.preventDefault();
              const next=event.key==='Home'?0:event.key==='End'?sections.length-1:
                (index+(event.key==='ArrowRight'?1:-1)+sections.length)%sections.length;
              activate(sections[next]!);
              document.getElementById(prefix+'-tab-'+next)?.focus();
            }}>{name==='Members'?(kind==='room'?'Racks':'Assigned Elements'):name}</button>)}
        </div>
        {sections.map((name,index)=><div key={name} role="tabpanel"
          id={prefix+'-panel-'+index} aria-labelledby={prefix+'-tab-'+index}
          hidden={state.section!==name}>
          {state.section===name&&(name==='Summary'?<>
            <h3>Current owner identity and parent Site</h3>
            <dl><dt>Site</dt><dd>{details.site_id}</dd>
              <dt>Customer Organization</dt><dd>{details.customer_org_id}</dd>
              {kind==='cloud_deployment'&&<><dt>Cloud Type reference</dt><dd>{details.cloud_type_id}</dd></>}
              <dt>{kind==='room'?'Direct Racks (all lifecycles)':'Current directly assigned Network Elements (all lifecycles)'}</dt>
              <dd>{kind==='room'?details.rack_count:details.assigned_network_element_count}</dd>
            </dl>
            <button type="button" onClick={()=>onBrowseSite(details.customer_org_id,details.site_id)}>
              Explore parent Site in owner collection
            </button>
            <p>{kind==='room'?'Physical Room→Rack relationship':
              'Site-scoped Cloud assignment'} is independent of Network Element containment.
              Counts do not authorize changes or imply that all children are loaded.</p>
          </>:name==='Members'&&state.members?
            <Members kind={kind} id={id} siteId={details.site_id}
              history={state.members} onHistory={members=>onState({...state,members})}
              onOpenRelated={onOpenRelated}/>:
            name==='History'?
              <InfrastructureContextHistory kind={kind} id={id} history={history} onHistory={onHistory}/>:
              <p role="alert">Member page identity is unavailable.</p>)}
        </div>)}
        <p>Read-only Infrastructure owner evidence. No local data changes, guessed topology or inferred physical Cloud ancestry.</p>
      </>;
    }}/>
  </section>;
}
