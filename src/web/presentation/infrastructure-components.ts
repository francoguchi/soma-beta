/** LLD-08 InstalledComponentQuery returned rows are accepted evidence only
 * after their typed complete owner envelope passes bounded validation.
 * The query's private slot match sort key is NOT included in the row DTO:
 * ordering proof must remain with the query cursor/owner, not guessed from
 * the human-readable slot_label.
 */
export type InstalledComponentRow=Readonly<{
  installed_component_id:string;state:'installed'|'removed'|'unknown';
  bom_code:string|null;manufacturer_serial:string|null;slot_label:string|null;
  condition:'unknown'|'normal'|'faulty'|'removed'|'quarantined';
  device_part_unit_id:string|null;physical_consequence_id:string|null;
}>;
export type InstalledComponentPage=Readonly<{
  items:readonly InstalledComponentRow[];next_cursor:unknown|null;
}>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const optionalRef=(value:unknown)=>value===null||typeof value==='string'&&uuid.test(value);
const bounded=(value:unknown,bytes:number)=>value===null
  ||typeof value==='string'&&new TextEncoder().encode(value).length<=bytes;
const keys=['installed_component_id','state','bom_code','manufacturer_serial',
  'slot_label','condition','device_part_unit_id','physical_consequence_id'];
export function verifyInstalledComponentPage(page:InstalledComponentPage):void {
  if(!page||typeof page!=='object'||!Array.isArray(page.items)||page.items.length>200
    ||!Object.hasOwn(page,'next_cursor'))throw new Error('Invalid Installed Component owner page');
  const seen=new Set<string>();
  for(const row of page.items){
    if(!row||typeof row!=='object'||Array.isArray(row)
      ||Object.keys(row).length!==keys.length
      ||Object.keys(row).some(key=>!keys.includes(key))
      ||typeof row.installed_component_id!=='string'||!uuid.test(row.installed_component_id)
      ||seen.has(row.installed_component_id)
      ||!['installed','removed','unknown'].includes(row.state)
      ||!['unknown','normal','faulty','removed','quarantined'].includes(row.condition)
      ||!bounded(row.bom_code,640)||!bounded(row.manufacturer_serial,640)
      ||!bounded(row.slot_label,384)
      ||!optionalRef(row.device_part_unit_id)||!optionalRef(row.physical_consequence_id))
      throw new Error('Invalid Installed Component owner evidence');
    seen.add(row.installed_component_id);
  }
}
