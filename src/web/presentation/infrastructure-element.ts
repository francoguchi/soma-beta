/** Strict envelope validation for the LLD-08 NetworkElementDetailQuery.
 * Read-only presentation must reject a foreign or corrupt owner response before
 * showing nested IDs, an apparent physical Rack placement or Model evidence.
 */
export type InfraRef=Readonly<{kind:string;id:string}>;
export type NetworkElementOwner=Readonly<{
  network_element_id:string;revision:number;lifecycle:string;operational_name:string;
  site:InfraRef;customer_org_id:string;
  placement:Readonly<{rack_id:string|null;u_start:number|null;u_span:number|null;
    revision:number;explicit_unracked:boolean}>;
  model:InfraRef|null;cloud_deployment:InfraRef|null;primary_ip:string|null;
  ip_count:number;containment_parent:InfraRef|null;containment_child_count:number;
  device_reference_count:number;installed_component_count:number;warning_codes:readonly string[];
}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const whole=(x:unknown)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const positive=(x:unknown)=>whole(x)&&Number(x)>0;
const text=(x:unknown,bytes:number)=>typeof x==='string'&&new TextEncoder().encode(x).length<=bytes;
const ref=(x:unknown,kind:string)=>typeof x==='object'&&x!==null&&!Array.isArray(x)
  &&(x as InfraRef).kind===kind&&typeof (x as InfraRef).id==='string'
  &&UUID.test((x as InfraRef).id);
export function verifyNetworkElement(v:NetworkElementOwner,id:string):void {
  if(!v||typeof v!=='object'||!UUID.test(id)||v.network_element_id!==id
    ||!positive(v.revision)||!['active','archived'].includes(v.lifecycle)
    ||!text(v.operational_name,800)||v.operational_name.length===0
    ||!ref(v.site,'site')||!UUID.test(v.customer_org_id)
    ||!(v.model===null||ref(v.model,'model'))
    ||!(v.cloud_deployment===null||ref(v.cloud_deployment,'cloud_deployment'))
    ||!(v.containment_parent===null||ref(v.containment_parent,'network_element'))
    ||!(v.primary_ip===null||text(v.primary_ip,256))
    ||!whole(v.ip_count)||!whole(v.containment_child_count)
    ||!whole(v.device_reference_count)||!whole(v.installed_component_count)
    ||!Array.isArray(v.warning_codes)||v.warning_codes.length>32
    ||v.warning_codes.some(w=>!text(w,128)))
    throw new Error('Invalid Network Element owner identity or summary');
  const p=v.placement;
  if(!p||typeof p!=='object'||!positive(p.revision)||typeof p.explicit_unracked!=='boolean'
    ||!(p.rack_id===null||typeof p.rack_id==='string'&&UUID.test(p.rack_id))
    ||(p.rack_id===null?(p.u_start!==null||p.u_span!==null||!p.explicit_unracked):
      (!positive(p.u_start)||!positive(p.u_span)||p.explicit_unracked)))
    throw new Error('Invalid Network Element placement projection');
}
