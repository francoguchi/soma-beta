/** Complete LLD-08 explorer-node envelope validation before displaying any
 * owner rows or a presentational Study29 permutation. No ancestry inference.
 * The kind+id composite identity permits a separate containment context row
 * for the same actual Network Element identity.
 */
export type InfrastructureExplorerNode=Readonly<{
  kind:'site'|'room'|'rack'|'cloud_deployment'|'network_element'|'containment';
  id:string;label:string;parent_context_id:string|null;
  lifecycle:'active'|'archived'|null;warning_codes:readonly string[];
}>;
export type InfrastructureExplorerPage=Readonly<{
  nodes:readonly InfrastructureExplorerNode[];next_cursor:unknown|null;
}>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const kinds=['site','room','rack','cloud_deployment','network_element','containment'];
const bounded=(value:unknown,max:number)=>typeof value==='string'
  &&new TextEncoder().encode(value).length<=max;
const properties=['kind','id','label','parent_context_id','lifecycle','warning_codes'];
export function verifyInfrastructureExplorerPage(page:InfrastructureExplorerPage):void {
  if(!page||typeof page!=='object'||Array.isArray(page)
    ||Object.keys(page).length!==2
    ||Object.keys(page).some(key=>!['nodes','next_cursor'].includes(key))
    ||!Array.isArray(page.nodes)||page.nodes.length>200)
    throw new Error('Invalid Infrastructure explorer owner envelope');
  const identities=new Set<string>();
  for(const node of page.nodes){
    if(!node||typeof node!=='object'||Array.isArray(node)
      ||Object.keys(node).length!==properties.length
      ||Object.keys(node).some(key=>!properties.includes(key))
      ||!kinds.includes(node.kind)
      ||typeof node.id!=='string'||!uuid.test(node.id)
      ||!bounded(node.label,800)
      ||!(node.parent_context_id===null||typeof node.parent_context_id==='string'
        &&uuid.test(node.parent_context_id))
      ||!(node.lifecycle===null||node.lifecycle==='active'||node.lifecycle==='archived')
      ||!Array.isArray(node.warning_codes)||node.warning_codes.length>16
      ||node.warning_codes.some(code=>!bounded(code,128)))
      throw new Error('Invalid Infrastructure explorer owner node');
    const identity=node.kind+':'+node.id;
    if(identities.has(identity))throw new Error('Duplicate Infrastructure explorer owner context');
    identities.add(identity);
  }
}
