import {OwnerProjection} from '../components/OwnerProjection';

/** LLD-02 setting envelope over the LLD-05 Objective scheduling timezone value. */
type ObjectiveTimezoneSetting=Readonly<{
  setting_key:'OBJECTIVE_TIMEZONE_V1';
  contract_name:'OBJECTIVE_TIMEZONE_V1';
  contract_version:1;
  semantic_owner:'LLD-05';
  value:string;
  source:'DEFAULT'|'PERSISTED';
  revision:number|null;
}>;
export function ObjectiveSettings() {
  return <section aria-label="Objective scheduling settings" className="soma-v2-settings-owner">
    <h2>Objective scheduling timezone</h2>
    <OwnerProjection<ObjectiveTimezoneSetting> path="/api/v1/settings/OBJECTIVE_TIMEZONE_V1" render={value=>{
      if(!value||Object.keys(value).length!==7
        ||value.setting_key!=='OBJECTIVE_TIMEZONE_V1'
        ||value.contract_name!=='OBJECTIVE_TIMEZONE_V1'
        ||value.contract_version!==1||value.semantic_owner!=='LLD-05'
        ||typeof value.value!=='string'||!value.value||new TextEncoder().encode(value.value).length>255
        ||(value.source==='DEFAULT'?value.revision!==null:
          value.source!=='PERSISTED'||!Number.isSafeInteger(value.revision)||(value.revision??0)<1)){
        throw new Error('Invalid accepted Objective timezone setting');
      }
      return <><p><strong>Scheduling timezone:</strong> {value.value}</p>
        <p>Source: {value.source==='DEFAULT'?'Default':'Persisted'} · {value.revision===null?'No saved revision':'Revision '+value.revision}</p>
        <p>Owner: LLD-05. This setting governs Task/Objective scheduling interpretation. Saved UTC instants remain authoritative and changing presentation alone does not reschedule work.</p>
      </>;
    }}/></section>;
}
