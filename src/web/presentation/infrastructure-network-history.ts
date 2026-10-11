import {verifyHistoryValue,type HistoryValue} from './infrastructure-history.js';
/** LLD-08 Network Element's bounded InfrastructureHistoryQuery projection. The
 * owner response is historical evidence, not current relationships.
 */
export type NetworkHistoryChange=Readonly<{field:string;prior:HistoryValue;new:HistoryValue}>;
export type NetworkHistoryEvent=Readonly<{
  event_id:string;event_kind:string;recorded_at_utc:number;
  effective_at_utc:number|null;command_id:string;
  summary:Readonly<{changes:readonly NetworkHistoryChange[];
    reason_code:string|null;warning_codes:readonly string[]}>;
}>;
export type NetworkHistoryPage=Readonly<{events:readonly NetworkHistoryEvent[];next_cursor:unknown|null}>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const seconds=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0
  &&value<=8640000000000;
const bounded=(value:unknown,max:number)=>typeof value==='string'
  &&new TextEncoder().encode(value).length<=max;
export function verifyNetworkHistoryPage(page:NetworkHistoryPage):void {
  if(!page||typeof page!=='object'||Array.isArray(page)||Object.keys(page).length!==2
    ||Object.keys(page).some(key=>!['events','next_cursor'].includes(key))
    ||!Array.isArray(page.events)||page.events.length>5)
    throw new Error('Invalid Network Element history owner envelope');
  const seen=new Set<string>();
  let previous:{at:number;id:string}|null=null;
  for(const event of page.events){
    if(!event||typeof event!=='object'||Array.isArray(event)
      ||Object.keys(event).length!==6
      ||Object.keys(event).some(key=>!['event_id','event_kind','recorded_at_utc',
        'effective_at_utc','command_id','summary'].includes(key))
      ||typeof event.event_id!=='string'||!uuid.test(event.event_id)
      ||seen.has(event.event_id)||!bounded(event.event_kind,128)
      ||!seconds(event.recorded_at_utc)
      ||!(event.effective_at_utc===null||seconds(event.effective_at_utc))
      ||typeof event.command_id!=='string'||!uuid.test(event.command_id)
      ||!event.summary||typeof event.summary!=='object'
      ||Object.keys(event.summary).length!==3
      ||Object.keys(event.summary).some(key=>!['changes','reason_code','warning_codes'].includes(key))
      ||!Array.isArray(event.summary.changes)||event.summary.changes.length>32
      ||!(event.summary.reason_code===null||bounded(event.summary.reason_code,384))
      ||!Array.isArray(event.summary.warning_codes)||event.summary.warning_codes.length>16
      ||event.summary.warning_codes.some((warning:string)=>!bounded(warning,128))
      ||event.summary.changes.some((change:NetworkHistoryChange)=>!change||typeof change!=='object'
        ||Object.keys(change).length!==3
        ||Object.keys(change).some(key=>!['field','prior','new'].includes(key))
        ||!bounded(change.field,128)
        ||!verifyHistoryValue(change.prior)||!verifyHistoryValue(change.new))
      ||previous&&(event.recorded_at_utc>previous.at
        ||event.recorded_at_utc===previous.at&&event.event_id>=previous.id))
      throw new Error('Invalid Network Element history owner event');
    seen.add(event.event_id);
    previous={at:event.recorded_at_utc,id:event.event_id};
  }
}
