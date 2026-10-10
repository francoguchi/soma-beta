import {useState} from 'react';
import {OwnerProjection} from '../components/OwnerProjection';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';

const uuid4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const rfcNo=/^NC[0-9]{14}$/;
type BranchMember=Readonly<{direct_link_id:string;root_rfc_id:string;member_rfc_id:string;role:'root'|'subordinate'}>;
type BranchCursor=Readonly<{version:1;query_id:'GetServiceRequestRfcBranches';sort_registry_id:'SR_RFC_BRANCH_MEMBER_ORDER_V1';
  last_key_tuple:readonly [string,number,string];filter_fingerprint:string;null_order:'not_applicable'}>;
type BranchPage=Readonly<{items:readonly BranchMember[];continuation:BranchCursor|null}>;
type RfcDetail=Readonly<{rfc_id:string;rfc_no:string;revision:number;hierarchy_role:string;local_archive_state:string;
  subordinate_count:number;direct_service_request_count:number;warnings:readonly string[]}>;
function accepted(page:BranchPage):BranchPage{
  if(!page||!Array.isArray(page.items)||page.items.length>25)throw new Error('Invalid SR RFC branch page');
  const seen=new Set<string>();
  for(const member of page.items){
    if(!member||!uuid4.test(member.direct_link_id)||!uuid4.test(member.root_rfc_id)
      ||!uuid4.test(member.member_rfc_id)||!['root','subordinate'].includes(member.role)
      ||member.role==='root'&&member.root_rfc_id!==member.member_rfc_id
      ||member.role==='subordinate'&&member.root_rfc_id===member.member_rfc_id
      ||seen.has(member.member_rfc_id))throw new Error('Invalid SR RFC branch member');
    seen.add(member.member_rfc_id);
  }
  const c=page.continuation;
  if(c!==null&&(!c||c.version!==1||c.query_id!=='GetServiceRequestRfcBranches'
    ||c.sort_registry_id!=='SR_RFC_BRANCH_MEMBER_ORDER_V1'||c.null_order!=='not_applicable'
    ||!Array.isArray(c.last_key_tuple)||c.last_key_tuple.length!==3
    ||!uuid4.test(c.last_key_tuple[0])||![0,1].includes(c.last_key_tuple[1])
    ||!uuid4.test(c.last_key_tuple[2])
    ||typeof c.filter_fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(c.filter_fingerprint)))
    throw new Error('Invalid SR RFC owner cursor');
  return page;
}
function selectedDetails(raw:RfcDetail,id:string):RfcDetail{
  if(!raw||raw.rfc_id!==id||!rfcNo.test(raw.rfc_no)||!Number.isSafeInteger(raw.revision)||raw.revision<1
    ||!['root','subordinate','standalone'].includes(raw.hierarchy_role)
    ||!['active','archived'].includes(raw.local_archive_state)
    ||!Number.isSafeInteger(raw.subordinate_count)||raw.subordinate_count<0
    ||!Number.isSafeInteger(raw.direct_service_request_count)||raw.direct_service_request_count<0
    ||!Array.isArray(raw.warnings))throw new Error('Invalid RFC owner details');
  return raw;
}
/** LLD-03 GetServiceRequestRfcBranches, not a locally inferred RFC graph. */
export function TicketRfcLinks({id,navigate}:{id:string;navigate:(next:string)=>void}){
  const first='/api/v1/tickets/service-requests/'+encodeURIComponent(id)+'/rfcs?limit=25';
  const [history,setHistory]=useState(()=>initialOwnerPage(first));
  const [selected,setSelected]=useState<string|null>(null);
  return <section className="soma-v2-rfc-links" aria-label="Linked RFCs">
    <h2>Related RFC branches</h2>
    <p>Accepted root links and their subordinate RFC members. Subordinates inherit through their governing root.</p>
    <OwnerProjection<BranchPage> path={ownerPagePath(history)} render={raw=>{
      const page=accepted(raw);
      const chosen=selected===null?null:page.items.find(item=>item.member_rfc_id===selected)??null;
      return <>
        <div className="soma-v2-sr-table-viewport">
          <table className="soma-v2-sr-table">
            <thead><tr><th scope="col">RFC member identity</th><th scope="col">Branch role</th><th scope="col">Governing root</th></tr></thead>
            <tbody>{page.items.map(item=><tr key={item.member_rfc_id} data-selected={chosen?.member_rfc_id===item.member_rfc_id?'true':'false'}>
              <td><button className="soma-v2-sr-rowselect" type="button" aria-pressed={chosen?.member_rfc_id===item.member_rfc_id}
                onClick={()=>setSelected(item.member_rfc_id)}>{item.member_rfc_id}</button></td>
              <td>{item.role}</td><td>{item.root_rfc_id}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {page.items.length===0&&<p role="status">No linked RFC branch members for this Service Request.</p>}
        {page.items.length>0&&!chosen&&<p role="status">Select a member to retrieve its current RFC number and details.</p>}
        <div className="soma-v2-sr-pager">
          <button type="button" disabled={history.page===history.first} onClick={()=>{
            setHistory(previousOwnerPage);setSelected(null);}}>Previous page</button>
          <button type="button" disabled={!page.continuation} onClick={()=>{
            if(!page.continuation)return;
            const next=first+'&cursor='+encodeURIComponent(JSON.stringify(page.continuation));
            setHistory(old=>nextOwnerPage(old,next,first+'&cursor='));
            setSelected(null);
          }}>Next page</button>
        </div>
        {chosen&&<OwnerProjection<RfcDetail> path={'/api/v1/tickets/rfcs/'+encodeURIComponent(chosen.member_rfc_id)} render={rawDetail=>{
          const detail=selectedDetails(rawDetail,chosen.member_rfc_id);
          return <aside className="soma-v2-sr-details" aria-label="Selected RFC relationship">
            <div className="soma-v2-sr-details-title"><strong>RFC / {detail.rfc_no}</strong>
              <button type="button" onClick={()=>navigate('/tickets/rfc/'+encodeURIComponent(detail.rfc_id))}>Open RFC workbench ↗</button>
            </div>
            <div className="soma-v2-sr-details-grid">
              <span>Hierarchy</span><span>{detail.hierarchy_role}</span>
              <span>Governing root</span><span>{chosen.root_rfc_id}</span>
              <span>Local archive</span><span>{detail.local_archive_state}</span>
              <span>Accepted revision</span><strong>{detail.revision}</strong>
              <span>Direct SR links</span><strong>{detail.direct_service_request_count}</strong>
              <span>Subordinates</span><strong>{detail.subordinate_count}</strong>
            </div>
          </aside>;
        }}/>}
      </>;
    }}/>
  </section>;
}
