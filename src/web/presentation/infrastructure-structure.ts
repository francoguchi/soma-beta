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
  return !!view&&typeof view==='object'&&!Array.isArray(view)
    &&Object.keys(view).length===2&&Object.keys(view).every(key=>key==='order'||key==='visible')
    &&Array.isArray(view.order)&&Array.isArray(view.visible)
    &&view.order.length===INTERMEDIATE_LEVELS.length
    &&new Set(view.order).size===INTERMEDIATE_LEVELS.length
    &&view.order.every(level=>INTERMEDIATE_LEVELS.includes(level))
    &&new Set(view.visible).size===view.visible.length
    &&view.visible.every(level=>INTERMEDIATE_LEVELS.includes(level));
}
// Document-session-only view preference. No localStorage, database write,
// user Setting, snapshot DTO or cross-tab persistence. A fresh page reload
// begins with Full structure; route navigation within the SPA retains Apply.
let sessionStructure:StructureView=FULL_STRUCTURE;
export function currentSessionStructure():StructureView {
  return {order:[...sessionStructure.order],visible:[...sessionStructure.visible]};
}
export function applySessionStructure(view:StructureView):StructureView {
  if(!validStructure(view))throw new Error('Invalid Structure session intent');
  sessionStructure=Object.freeze({
    order:Object.freeze([...view.order]),visible:Object.freeze([...view.visible]),
  });
  return currentSessionStructure();
}
export function moveStructureLevel(view:StructureView,level:StructureLevel,direction:-1|1):StructureView {
  if(!validStructure(view))throw new Error('Invalid Structure view');
  const order=[...view.order];
  const index=order.indexOf(level),next=index+direction;
  if(index===-1||next<0||next>=order.length)return view;
  [order[index],order[next]]=[order[next]!,order[index]!];
  return {order,visible:[...view.visible]};
}
/** Optional pointer/drag equivalent to the keyboard arrow controls. Drops
 * before the named intermediate level; pinned endpoints are not movable.
 */
export function dropStructureLevel(view:StructureView,from:StructureLevel,before:StructureLevel):StructureView {
  if(!validStructure(view))throw new Error('Invalid Structure view');
  const order=[...view.order],origin=order.indexOf(from),destination=order.indexOf(before);
  if(origin<0||destination<0)return view;
  if(origin===destination)return view;
  order.splice(origin,1);
  order.splice(order.indexOf(before),0,from);
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
  if(nodes.some(node=>!node||typeof node.kind!=='string'||typeof node.id!=='string'
    ||node.id.length===0||(!['network_element','containment'].includes(node.kind)
      &&!(INTERMEDIATE_LEVELS as readonly string[]).includes(node.kind))))
    throw new Error('Invalid Infrastructure owner node for Structure projection');
  return nodes.map((node,index)=>({node,index}))
    .filter(({node})=>!(INTERMEDIATE_LEVELS as readonly string[]).includes(node.kind)||shown.has(node.kind as StructureLevel))
    .sort((a,b)=>rank(a.node.kind)-rank(b.node.kind)||a.index-b.index)
    .map(({node})=>node);
}
