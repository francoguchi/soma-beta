import {infrastructureIntent,type InfrastructureIntent} from '../app/router.js';

/** Navigate only to existing LLD-08 owner read surfaces. A selected
 * relationship from the accepted current owner is authority to request
 * the related point/history; it is NOT evidence of a fabricated tree.
 * New destination details must independently validate their owner response.
 */
export type InfrastructureRelatedKind='site'|'rack'|'room'|'cloud_deployment'|'network_element';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export function openInfrastructureRelated(
  current:InfrastructureIntent,kind:InfrastructureRelatedKind,id:string,
):InfrastructureIntent|null {
  if(infrastructureIntent(current)===null||typeof id!=='string'||!UUID.test(id)
    ||!['site','rack','room','cloud_deployment','network_element'].includes(kind))
    return null;
  const isElement=kind==='network_element';
  const result:InfrastructureIntent={
    explorer:current.explorer,openedId:id,openedKind:kind,tab:'Summary',
    components:isElement?'/api/v1/infrastructure/network-elements/'+id+'/components?limit=200':null,
    history:isElement?'/api/v1/infrastructure/history?target_kind=network_element&target_id='+id+'&limit=5':null,
    workbook:null,
  };
  return infrastructureIntent(result);
}
