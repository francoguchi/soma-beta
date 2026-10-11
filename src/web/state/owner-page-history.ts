/** Bounded keyset cursor history shared by owner-backed registers. */
export type OwnerPageHistory=Readonly<{paths:readonly string[];first:number;page:number}>;
const CAPACITY=51;
export function initialOwnerPage(path:string):OwnerPageHistory {
  return {paths:[path],first:0,page:0};
}
export function ownerPagePath(history:OwnerPageHistory):string {
  const offset=history.page-history.first;
  const path=history.paths[offset];
  if(!Number.isSafeInteger(offset)||offset<0||offset>=history.paths.length||!path)
    throw new Error('Invalid owner cursor history');
  return path;
}
export function previousOwnerPage(history:OwnerPageHistory):OwnerPageHistory {
  return history.page===history.first?history:{...history,page:history.page-1};
}
export function nextOwnerPage(history:OwnerPageHistory,path:string,expectedPrefix:string):OwnerPageHistory {
  if(!path.startsWith(expectedPrefix)||path.length>4096||path.includes('#'))
    throw new Error('Invalid owner continuation');
  const kept=[...history.paths.slice(0,history.page-history.first+1),path];
  const dropped=Math.max(0,kept.length-CAPACITY);
  return {paths:kept.slice(dropped),first:history.first+dropped,page:history.page+1};
}
