import {OwnerProjection} from '../components/OwnerProjection';
import {BoundedCollection} from '../components/BoundedCollection';

type Occupant=Readonly<{network_element_id:string;operational_name:string;u_start:number;u_span:number}>;
type Range=Readonly<{u_start:number;u_span:number}>;
type Rack=Readonly<{rack_id:string;height_u:number;row_label:string|null;column_label:string|null;
  occupants:readonly Occupant[];free_ranges:readonly Range[];corrupt_overlap_detected:boolean}>;
const uuid=(x:unknown):x is string=>typeof x==='string'&&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(x);
const integer=(x:unknown,max:number)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=1&&x<=max;
const label=(x:unknown)=>x===null||(typeof x==='string'&&new TextEncoder().encode(x).length<=256);
function validate(value:Rack,id:string):void {
  if(!value||value.rack_id!==id||!uuid(value.rack_id)||!integer(value.height_u,120)
    ||!label(value.row_label)||!label(value.column_label)
    ||typeof value.corrupt_overlap_detected!=='boolean'
    ||!Array.isArray(value.occupants)||value.occupants.length>4096
    ||!Array.isArray(value.free_ranges)||value.free_ranges.length>121)
    throw new Error('Invalid Rack occupancy owner envelope');
  const seen=new Set<string>();
  let prior:Occupant|null=null;
  for(const item of value.occupants){
    if(!item||!uuid(item.network_element_id)||seen.has(item.network_element_id)
      ||typeof item.operational_name!=='string'
      ||new TextEncoder().encode(item.operational_name).length>800
      ||!integer(item.u_start,120)||!integer(item.u_span,120)
      ||(prior&&(item.u_start<prior.u_start||
        (item.u_start===prior.u_start&&item.network_element_id<=prior.network_element_id))))
      throw new Error('Invalid Rack occupant identity/order');
    seen.add(item.network_element_id);prior=item;
  }
  for(const item of value.free_ranges){
    if(!item||!integer(item.u_start,120)||!integer(item.u_span,120)
      ||item.u_start+item.u_span-1>value.height_u)
      throw new Error('Invalid Rack free interval');
  }
  // Report corruption without presenting the returned intervals as reliable.
  if(value.corrupt_overlap_detected)return;
  const occupied=new Set<number>();
  for(const item of value.occupants){
    if(item.u_start+item.u_span-1>value.height_u)throw new Error('Rack placement outside height');
    for(let u=item.u_start;u<item.u_start+item.u_span;u++){
      if(occupied.has(u))throw new Error('Unreported Rack placement overlap');
      occupied.add(u);
    }
  }
  const free:Range[]=[];let start:number|null=null;
  for(let u=1;u<=value.height_u+1;u++){
    if(u<=value.height_u&&!occupied.has(u)){if(start===null)start=u;}
    else if(start!==null){free.push({u_start:start,u_span:u-start});start=null;}
  }
  if(free.length!==value.free_ranges.length||free.some((r,i)=>
    r.u_start!==value.free_ranges[i]?.u_start||r.u_span!==value.free_ranges[i]?.u_span))
    throw new Error('Rack free intervals disagree with accepted placements');
}
const units=(range:Range)=>range.u_span===1?'U'+range.u_start:
  'U'+range.u_start+'–U'+(range.u_start+range.u_span-1);

/** Authenticated LLD-08 RackOccupancyQuery, read-only, not a placement approval. */
export function InfrastructureRackOccupancy({id,onOpenElement}:{id:string;onOpenElement?:(id:string)=>void}){
  return <section aria-label="Opened Rack" data-scroll-owner="y" data-return-scroll="detail" className="infrastructure-detail">
    <OwnerProjection<Rack> path={'/api/v1/infrastructure/racks/'+encodeURIComponent(id)+'/occupancy'} render={owner=>{
      validate(owner,id);
      return <><h2>Rack occupancy</h2>
        <p>Rack identity: {owner.rack_id}. Height: {owner.height_u} U.</p>
        <p>Row label: {owner.row_label??'Unspecified'}. Column label: {owner.column_label??'Unspecified'}.</p>
        {owner.corrupt_overlap_detected?
          <p role="alert">The Rack owner reported corrupt or overlapping placement evidence. No reliable occupied/free layout can be displayed; inspect the source state before planning any change.</p>:
          <>
            <h3>Accepted occupied Unit ranges</h3>
            <p>{owner.occupants.length} current Network Element placements in this bounded Rack snapshot.
              Physical Rack occupancy does not establish containment or Cloud assignment.</p>
            {owner.occupants.length===0&&<p>No Network Element occupies Rack units in the accepted snapshot.</p>}
            <BoundedCollection caption="Rack occupied U ranges" rows={owner.occupants.map(item=>({
              id:item.network_element_id,cells:[units(item),item.operational_name,
                onOpenElement?<button type="button" onClick={()=>onOpenElement(item.network_element_id)}
                  aria-label={'Inspect Network Element '+item.network_element_id}>{item.network_element_id}</button>
                  :item.network_element_id]}))}
              next={false} onNext={()=>{}}/>
            <h3>Accepted available Unit ranges</h3>
            {owner.free_ranges.length===0?<p>No free U range in this Rack snapshot.</p>:
              <ul>{owner.free_ranges.map(item=><li key={item.u_start}>{units(item)}</li>)}</ul>}
          </>}
        <p>This view is read-only. Neither occupancy nor free ranges authorize placement, unplacement or mutation.</p>
      </>;
    }}/>
  </section>;
}
