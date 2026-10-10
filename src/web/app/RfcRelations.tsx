import {useState} from 'react';
import {OwnerProjection} from '../components/OwnerProjection';
import {initialOwnerPage,nextOwnerPage,ownerPagePath,previousOwnerPage} from '../state/owner-page-history';

const uuid4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const rfcNo=/^NC[0-9]{14}$/;
type RfcDetail=Readonly<{rfc_id:string;rfc_no:string;revision:number;hierarchy_role:string;
  local_archive_state:string;subordinate_count:number;warnings:readonly string[]}>;
type Branch=Readonly<{root:RfcDetail;subordinates:readonly RfcDetail[];
  continuation:unknown|null;branch_fingerprint:string}>;
type SrRelation=Readonly<{sr_rfc_link_id:string;service_request_id:string;
  governing_root_rfc_id:string;requested_rfc_id:string;inherited_via_root:string|null}>;
type SrPage=Readonly<{items:readonly SrRelation[];continuation:unknown|null}>;

function isRFC(value:RfcDetail):boolean {
  return !!value&&uuid4.test(value.rfc_id)&&rfcNo.test(value.rfc_no)
    &&Number.isSafeInteger(value.revision)&&value.revision>0
    &&['root','standalone','subordinate'].includes(value.hierarchy_role)
    &&['active','archived'].includes(value.local_archive_state);
}
function pageControls(history:ReturnType<typeof initialOwnerPage>, continuation:unknown, base:string,
  advance:(route:string)=>void,back:()=>void) {
  return <div className="soma-v2-sr-pager">
    <button type="button" disabled={history.page===history.first} onClick={back}>Previous page</button>
    <button type="button" disabled={continuation===null} onClick={()=>{
      if(continuation===null)return;
      advance(base+'&cursor='+encodeURIComponent(JSON.stringify(continuation)));
    }}>Next page</button>
  </div>;
}

/** Governed RFC root/subordinate branch query; subordinate identity is not guessed. */
export function RfcRelated({id,navigate}:{id:string;navigate:(url:string)=>void}) {
  const first='/api/v1/tickets/rfcs/'+encodeURIComponent(id);
  return <section aria-label="RFC related branch" className="soma-v2-rfc-links">
    <OwnerProjection<RfcDetail> path={first} render={detail=>{
      if(!isRFC(detail)||detail.rfc_id!==id)throw new Error('Invalid RFC identity');
      if(detail.hierarchy_role==='subordinate')return <p role="status">
        This RFC is subordinate. Its governing root cannot be inferred from its display fields.
        Inspect the accepted SR relationship context for root lineage.
      </p>;
      return <RfcRootBranch id={id} navigate={navigate}/>;
    }}/>
  </section>;
}
function RfcRootBranch({id,navigate}:{id:string;navigate:(url:string)=>void}) {
  const first='/api/v1/tickets/rfcs/'+encodeURIComponent(id)+'/branch?limit=25';
  const [history,setHistory]=useState(()=>initialOwnerPage(first));
  const [selected,setSelected]=useState<string|null>(null);
  return <OwnerProjection<Branch> path={ownerPagePath(history)} render={raw=>{
    if(!raw||!isRFC(raw.root)||raw.root.rfc_id!==id
      ||!Array.isArray(raw.subordinates)||raw.subordinates.length>25
      ||typeof raw.branch_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(raw.branch_fingerprint)
      ||raw.subordinates.some(x=>!isRFC(x)||x.hierarchy_role!=='subordinate')
      ||new Set(raw.subordinates.map(x=>x.rfc_id)).size!==raw.subordinates.length)
      throw new Error('Invalid accepted RFC branch');
    const selectedChild=selected===null?null:raw.subordinates.find(x=>x.rfc_id===selected)??null;
    return <>
      <h2>Governing root: {raw.root.rfc_no}</h2>
      <p>Accepted root revision {raw.root.revision}; local archive: {raw.root.local_archive_state}.</p>
      <div className="soma-v2-sr-table-viewport">
        <table className="soma-v2-sr-table"><thead><tr><th scope="col">Subordinate RFC</th>
          <th scope="col">Local archive</th><th scope="col">Revision</th></tr></thead>
          <tbody>{raw.subordinates.map(child=><tr key={child.rfc_id}
            data-selected={selectedChild?.rfc_id===child.rfc_id?'true':'false'}>
            <td><button className="soma-v2-sr-rowselect" type="button"
              aria-pressed={selectedChild?.rfc_id===child.rfc_id}
              onClick={()=>setSelected(child.rfc_id)}>{child.rfc_no}</button></td>
            <td>{child.local_archive_state}</td><td>{child.revision}</td>
          </tr>)}</tbody></table>
      </div>
      {!raw.subordinates.length&&<p role="status">No subordinate RFCs in this page.</p>}
      {raw.subordinates.length>0&&!selectedChild&&<p role="status">Select a subordinate RFC to inspect it.</p>}
      {pageControls(history,raw.continuation,first,next=>{
        setHistory(old=>nextOwnerPage(old,next,first+'&cursor='));setSelected(null);
      },()=>{setHistory(previousOwnerPage);setSelected(null);})}
      {selectedChild&&<aside aria-label="Selected subordinate RFC" className="soma-v2-sr-details">
        <div className="soma-v2-sr-details-title"><strong>SUBORDINATE / {selectedChild.rfc_no}</strong>
          <button type="button" onClick={()=>navigate('/tickets/rfc/'+encodeURIComponent(selectedChild.rfc_id))}>Open RFC workbench ↗</button>
        </div><p>Governing root: {raw.root.rfc_no}. The subordinate cannot become a parent.</p>
      </aside>}
    </>;
  }}/>;
}

/** Inherited SR context is resolved by LLD-03, never manufactured from UI labels. */
export function RfcServiceRequests({id,navigate}:{id:string;navigate:(url:string)=>void}) {
  const first='/api/v1/tickets/rfcs/'+encodeURIComponent(id)+'/effective-srs?limit=25';
  const [history,setHistory]=useState(()=>initialOwnerPage(first));
  const [selected,setSelected]=useState<string|null>(null);
  return <section aria-label="RFC effective Service Requests" className="soma-v2-rfc-links">
    <h2>Effective Service Request context</h2>
    <OwnerProjection<SrPage> path={ownerPagePath(history)} render={page=>{
      if(!page||!Array.isArray(page.items)||page.items.length>25)throw new Error('Invalid RFC SR context');
      const seen=new Set<string>();
      for(const row of page.items){
        if(!row||!uuid4.test(row.sr_rfc_link_id)||!uuid4.test(row.service_request_id)
          ||!uuid4.test(row.governing_root_rfc_id)||row.requested_rfc_id!==id
          ||row.inherited_via_root!==null&&(!uuid4.test(row.inherited_via_root)||row.inherited_via_root!==row.governing_root_rfc_id)
          ||seen.has(row.service_request_id))throw new Error('Invalid accepted RFC SR relationship');
        seen.add(row.service_request_id);
      }
      const current=selected===null?null:page.items.find(x=>x.service_request_id===selected)??null;
      return <>
        <p>Links are direct to the governing root; subordinate context may be inherited.</p>
        <div className="soma-v2-sr-table-viewport">
          <table className="soma-v2-sr-table"><thead><tr><th scope="col">SR identity</th>
            <th scope="col">Governing root</th><th scope="col">Inheritance</th></tr></thead>
            <tbody>{page.items.map(x=><tr key={x.service_request_id} data-selected={current?.service_request_id===x.service_request_id?'true':'false'}>
              <td><button type="button" className="soma-v2-sr-rowselect"
                aria-pressed={current?.service_request_id===x.service_request_id}
                onClick={()=>setSelected(x.service_request_id)}>{x.service_request_id}</button></td>
              <td>{x.governing_root_rfc_id}</td><td>{x.inherited_via_root===null?'Direct root':'Via root'}</td>
            </tr>)}</tbody></table>
        </div>
        {page.items.length===0&&<p role="status">No effective Service Request links in this page.</p>}
        {page.items.length>0&&!current&&<p role="status">Select a linked Service Request to inspect it.</p>}
        {pageControls(history,page.continuation,first,next=>{
          setHistory(old=>nextOwnerPage(old,next,first+'&cursor='));setSelected(null);
        },()=>{setHistory(previousOwnerPage);setSelected(null);})}
        {current&&<aside aria-label="Selected effective SR" className="soma-v2-sr-details">
          <div className="soma-v2-sr-details-title"><strong>SR / {current.service_request_id}</strong>
            <button type="button" onClick={()=>navigate('/tickets/sr/'+encodeURIComponent(current.service_request_id))}>Open SR workbench ↗</button>
          </div><p>Governing root: {current.governing_root_rfc_id}; {current.inherited_via_root?'inherited':'direct'} relationship.</p>
        </aside>}
      </>;
    }}/>
    <p className="soma-v2-ticket-collection-scope">Device Reference memberships are not part of this owner query and remain unbound in this view.</p>
  </section>;
}
