import {useContext,useState} from 'react';
import {OwnerProjection,OwnerReturnRefresh} from '../components/OwnerProjection';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const validText=(input:unknown)=>typeof input==='string'&&input.length>0&&
  new TextEncoder().encode(input).length<=1024;
const wholeSeconds=(input:unknown):input is number=>typeof input==='number'&&
  Number.isSafeInteger(input)&&input>=0;
type Edge=Readonly<{lineage_id:string;relation_type:string;predecessor_fault_tag_id:string;
  successor_fault_tag_id:string;reason_code:string;recorded_at_utc:number}>;
type Projection=Readonly<{fault_tag_id:string;edges:readonly Edge[]}>;
function validated(value:Projection,faultTagId:string,expectedCount:number):readonly Edge[]{
  if(!value||value.fault_tag_id!==faultTagId||!Array.isArray(value.edges)
    ||value.edges.length!==expectedCount||value.edges.length>5000)
    throw new Error('Fault Tag lineage disagrees with selected owner');
  const ids=new Set<string>();
  let previous:readonly [number,string]|null=null;
  for(const edge of value.edges){
    if(!edge||!uuid.test(edge.lineage_id)||ids.has(edge.lineage_id)
      ||!uuid.test(edge.predecessor_fault_tag_id)||!uuid.test(edge.successor_fault_tag_id)
      ||edge.predecessor_fault_tag_id===edge.successor_fault_tag_id
      ||edge.predecessor_fault_tag_id!==faultTagId&&edge.successor_fault_tag_id!==faultTagId
      ||!validText(edge.relation_type)||!validText(edge.reason_code)
      ||!wholeSeconds(edge.recorded_at_utc)
      ||previous!==null&&(edge.recorded_at_utc<previous[0]||
        edge.recorded_at_utc===previous[0]&&edge.lineage_id<=previous[1]))
      throw new Error('Invalid or unordered Fault Tag lineage edge');
    ids.add(edge.lineage_id);
    previous=[edge.recorded_at_utc,edge.lineage_id];
  }
  return value.edges;
}
/** The lineage owner is fetched only after opening a specific accepted Fault Tag.
 * It carries historical relations; it is not replacement or warehouse command authority. */
export function FaultTagLineage({faultTagId,expectedCount}:{
  faultTagId:string;expectedCount:number;
}){
  const [opened,setOpened]=useState(false);
  const generation=useContext(OwnerReturnRefresh);
  return <section aria-label="Fault Tag lineage control">
    <button type="button" aria-expanded={opened} onClick={()=>setOpened(value=>!value)}>
      {opened?'Hide':'Inspect'} Fault Tag lineage
    </button>
    {opened&&<section className="soma-v2-rfc-links" aria-label="Fault Tag lineage relationships">
      <h5>Immutable Fault Tag lineage</h5>
      <p>Predecessor and successor links are recorded historical relationships.
        They do not approve replacements, reopen a return, or authorize warehouse decisions.</p>
      <OwnerProjection<Projection> key={generation}
        path={'/api/v1/inventory/fault-tags/'+encodeURIComponent(faultTagId)+'/lineage'}
        render={raw=>{
          const edges=validated(raw,faultTagId,expectedCount);
          return <>
            <p>{edges.length} owner lineage relationships for this selected Fault Tag.</p>
            {edges.length===0&&<p role="status">No recorded lineage relationships.</p>}
            {edges.length>0&&<div className="soma-v2-sr-table-viewport" data-scroll-owner="x">
              <table className="soma-v2-sr-table">
                <thead><tr><th scope="col">Recorded locally</th><th scope="col">Relationship</th>
                  <th scope="col">Predecessor</th><th scope="col">Successor</th>
                  <th scope="col">Reason</th></tr></thead>
                <tbody>{edges.slice(0,25).map(edge=><tr key={edge.lineage_id}>
                  <td>{new Date(edge.recorded_at_utc*1000).toLocaleString()}</td>
                  <td>{edge.relation_type}</td><td>{edge.predecessor_fault_tag_id}</td>
                  <td>{edge.successor_fault_tag_id}</td><td>{edge.reason_code}</td>
                </tr>)}</tbody>
              </table>
            </div>}
            {edges.length>25&&<p>Showing only the first 25 relationships;
              all {edges.length} are included in the owner's unpaged projection.</p>}
          </>;
        }}/>
    </section>}
  </section>;
}
