import {useState} from 'react';
import {OwnerProjection} from '../components/OwnerProjection';

type Model=Readonly<{model_id:string;revision:number;name:string;manufacturer:string|null;
  lifecycle:'active'|'archived';compatibility_count:number;assigned_network_element_count:number}>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const nonnegative=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const bounded=(value:unknown,size:number)=>typeof value==='string'&&new TextEncoder().encode(value).length<=size;
function validate(model:Model,identity:string):void {
  if(!model||!uuid.test(identity)||model.model_id!==identity
    ||!nonnegative(model.revision)||model.revision<1
    ||!bounded(model.name,800)||model.name.length===0
    ||!(model.manufacturer===null||bounded(model.manufacturer,800))
    ||!['active','archived'].includes(model.lifecycle)
    ||!nonnegative(model.compatibility_count)||!nonnegative(model.assigned_network_element_count))
    throw new Error('Invalid Network Element Model owner response');
}
/** Owner-backed Model detail is requested only after deliberate inspection.
 * Compatibility/assignment are counts, not inferred BOM or NE membership.
 */
export function InfrastructureModelEvidence({modelId}:{modelId:string}){
  const [opened,setOpened]=useState(false);
  return <section aria-label="Model evidence controls">
    <button type="button" aria-expanded={opened} onClick={()=>setOpened(value=>!value)}>
      {opened?'Hide':'Inspect'} linked Model
    </button>
    {opened&&<section aria-label="Linked Model evidence">
      <OwnerProjection<Model> path={'/api/v1/infrastructure/models/'+encodeURIComponent(modelId)} render={model=>{
        validate(model,modelId);
        return <><h4>{model.name}</h4><p>Model identity: {model.model_id}. Revision: {model.revision}.</p>
          <dl><dt>Manufacturer</dt><dd>{model.manufacturer??'Not recorded'}</dd>
            <dt>Lifecycle</dt><dd>{model.lifecycle}</dd>
            <dt>Compatible Model/BOM relationships</dt><dd>{model.compatibility_count}</dd>
            <dt>Network Elements assigned to this Model</dt><dd>{model.assigned_network_element_count}</dd></dl>
          <p>These are authoritative summary counts, not a BOM compatibility listing,
            spare reservation or a claim that a physical component has been installed.</p>
        </>;
      }}/>
    </section>}
  </section>;
}
