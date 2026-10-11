/** Study 29 Infrastructure Structure is a LOCAL VIEW projection.
 * LLD-08 explorer owns parentage, record IDs, scope, snapshots and pagination.
 * Neither hidden levels nor rearranged rows change a domain relationship.
 */
export const INTERMEDIATE_LEVELS=['cloud_deployment','site','room','rack'] as const;
export type StructureLevel=typeof INTERMEDIATE_LEVELS[number];
export type StructureView=Readonly<{
  order:readonly StructureLevel[];
  visible:readonly StructureLevel[];
}>;
export type StructurePreset='full'|'site-cloud'|'direct';
export const LEVEL_NAMES:Readonly<Record<StructureLevel,string>>={
  cloud_deployment:'Cloud',site:'Site',room:'Room',rack:'Rack',
};
export const FULL_STRUCTURE:StructureView=Object.freeze({
  order:Object.freeze([...INTERMEDIATE_LEVELS]),
  visible:Object.freeze([...INTERMEDIATE_LEVELS]),
});
export function structurePreset(preset:StructurePreset):StructureView {
  const order=preset==='site-cloud'
    ?['site','cloud_deployment','room','rack'] as const
    :INTERMEDIATE_LEVELS;
  return {order:[...order],visible:preset==='direct'?[]:[...order]};
}
export function validStructure(view:StructureView):boolean {
  return !!view&&Array.isArray(view.order)&&Array.isArray(view.visible)
    &&view.order.length===INTERMEDIATE_LEVELS.length
    &&new Set(view.order).size===INTERMEDIATE_LEVELS.length
    &&view.order.every(level=>INTERMEDIATE_LEVELS.includes(level))
    &&new Set(view.visible).size===view.visible.length
    &&view.visible.every(level=>INTERMEDIATE_LEVELS.includes(level));
}
export function moveStructureLevel(view:StructureView,level:StructureLevel,direction:-1|1):StructureView {
  if(!validStructure(view))throw new Error('Invalid Structure view');
  const order=[...view.order];
  const index=order.indexOf(level),next=index+direction;
  if(index===-1||next<0||next>=order.length)return view;
  [order[index],order[next]]=[order[next]!,order[index]!];
  return {order,visible:[...view.visible]};
}
export function toggleStructureLevel(view:StructureView,level:StructureLevel):StructureView {
  if(!validStructure(view)||!INTERMEDIATE_LEVELS.includes(level))throw new Error('Invalid Structure level');
  const enabled=new Set(view.visible);
  if(enabled.has(level))enabled.delete(level);else enabled.add(level);
  return {order:[...view.order],visible:view.order.filter(item=>enabled.has(item))};
}
export function structurePath(view:StructureView):string {
  if(!validStructure(view))throw new Error('Invalid Structure view');
  return ['Customer',...view.order.filter(level=>view.visible.includes(level)).map(level=>LEVEL_NAMES[level]),'Network Element'].join(' → ');
}
type ExplorerNode=Readonly<{kind:string;id:string}>;
/** Stable *current-page* display order only; preserves original owner row objects.
 * The containment alias remains an owner Network Element context row, not a
 * synthetic hierarchy edge. Cross-page domain ordering is untouched.
 */
export function projectStructureRows<T extends ExplorerNode>(nodes:readonly T[],view:StructureView):readonly T[] {
  if(!validStructure(view)||!Array.isArray(nodes)||nodes.length>200)
    throw new Error('Invalid bounded Infrastructure Structure projection');
  const shown=new Set(view.visible);
  const rank=(kind:string)=>{
    if(kind==='network_element'||kind==='containment')return INTERMEDIATE_LEVELS.length;
    return (view.order as readonly string[]).indexOf(kind);
  };
  return nodes.map((node,index)=>({node,index}))
    .filter(({node})=>!(INTERMEDIATE_LEVELS as readonly string[]).includes(node.kind)||shown.has(node.kind as StructureLevel))
    .sort((a,b)=>rank(a.node.kind)-rank(b.node.kind)||a.index-b.index)
    .map(({node})=>node);
}
