/** Typed LLD-08 historical field values. Render only contract-proven
 * changes, never infer a current Room/Cloud configuration from audit evidence.
 */
export type HistoryValue=Readonly<{
  kind:'null'|'text'|'integer'|'boolean'|'entity_ref';
  text_value:string|null;integer_value:number|null;
  boolean_value:boolean|null;
  entity_ref:Readonly<{kind:string;id:string}>|null;
}>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const refKinds=['site','room','rack','network_element','cloud_type','cloud_deployment',
  'model','installed_component','device_reference','device_part_unit','ip','workbook_run'];
const bounded=(value:unknown,max:number)=>typeof value==='string'
  &&new TextEncoder().encode(value).length<=max;
export function verifyHistoryValue(value:HistoryValue):boolean {
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||Object.keys(value).length!==5
    ||Object.keys(value).some(key=>!['kind','text_value','integer_value','boolean_value','entity_ref'].includes(key)))return false;
  const {kind,text_value,integer_value,boolean_value,entity_ref}=value;
  const empty=text_value===null&&integer_value===null&&boolean_value===null&&entity_ref===null;
  switch(kind){
    case 'null':return empty;
    case 'text':return bounded(text_value,1600)&&integer_value===null&&boolean_value===null&&entity_ref===null;
    case 'integer':return typeof integer_value==='number'&&Number.isSafeInteger(integer_value)
      &&text_value===null&&boolean_value===null&&entity_ref===null;
    case 'boolean':return typeof boolean_value==='boolean'&&text_value===null&&integer_value===null&&entity_ref===null;
    case 'entity_ref':return text_value===null&&integer_value===null&&boolean_value===null
      &&!!entity_ref&&typeof entity_ref==='object'&&!Array.isArray(entity_ref)
      &&Object.keys(entity_ref).length===2&&refKinds.includes(entity_ref.kind)
      &&typeof entity_ref.id==='string'&&uuid.test(entity_ref.id);
    default:return false;
  }
}
export function historyValueText(value:HistoryValue):string {
  if(!verifyHistoryValue(value))throw new Error('Invalid Infrastructure historical value');
  switch(value.kind){
    case 'null':return 'None';
    case 'text':return value.text_value!;
    case 'integer':return String(value.integer_value);
    case 'boolean':return value.boolean_value?'True':'False';
    case 'entity_ref':return value.entity_ref!.kind+': '+value.entity_ref!.id;
  }
}
