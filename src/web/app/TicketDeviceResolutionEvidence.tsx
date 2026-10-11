import {useContext,useState} from 'react';
import {OwnerProjection,OwnerReturnRefresh} from '../components/OwnerProjection';

type Resolution=Readonly<{device_reference_id:string;device_reference_revision:number;
  current_network_element_id:string|null;resolution_revision:number;history_count:number}>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const whole=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
function check(row:Resolution,id:string,revision:number):void{
  if(!row||!uuid.test(id)||row.device_reference_id!==id
    ||!whole(row.device_reference_revision)||row.device_reference_revision!==revision
    ||!whole(row.resolution_revision)||!whole(row.history_count)
    ||row.current_network_element_id!==null&&
      !(typeof row.current_network_element_id==='string'&&uuid.test(row.current_network_element_id)))
    throw new Error('Infrastructure resolution owner disagrees with selected Device Reference');
}
/** LLD-08 resolution ownership is independent of ticket display labels and
 * physical inventory. Open only after an operator accepts a direct ticket link.
 */
export function TicketDeviceResolutionEvidence({deviceId,revision,ticketResolution}:{
  deviceId:string;revision:number;ticketResolution:string|null;
}){
  const [opened,setOpened]=useState(false);
  const refresh=useContext(OwnerReturnRefresh);
  return <section aria-label="Device Reference resolution controls">
    <button type="button" aria-expanded={opened} onClick={()=>setOpened(v=>!v)}>
      {opened?'Hide':'Inspect'} Infrastructure resolution
    </button>
    {opened&&<section aria-label="Infrastructure Device Reference resolution">
      <OwnerProjection<Resolution> key={refresh}
        path={'/api/v1/infrastructure/device-references/'+encodeURIComponent(deviceId)+'/resolution'}
        render={row=>{
          check(row,deviceId,revision);
          const drift=row.current_network_element_id!==ticketResolution;
          return <>
            <h4>Current Infrastructure resolution</h4>
            <dl><dt>Device Reference identity</dt><dd>{row.device_reference_id}</dd>
              <dt>Device Reference revision</dt><dd>{row.device_reference_revision}</dd>
              <dt>Resolved Network Element</dt><dd>{row.current_network_element_id??'Not resolved'}</dd>
              <dt>Resolution revision</dt><dd>{row.resolution_revision}</dd>
              <dt>Historical resolution events</dt><dd>{row.history_count}</dd></dl>
            {drift&&<p role="alert">The Ticket link and Infrastructure resolution currently disagree.
              They are separate owner reads and must not be treated as a reconciled identity.</p>}
            <p>This is resolution history and identity evidence only. No device registration,
              physical unit movement, installation or Network Element assignment is performed here.</p>
          </>;
        }}/>
    </section>}
  </section>;
}
