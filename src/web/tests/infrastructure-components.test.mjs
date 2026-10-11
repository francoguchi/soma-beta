import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyInstalledComponentPage} from '../.test-build/presentation/infrastructure-components.js';
const id=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const row=(n=1)=>({installed_component_id:id(n),state:'installed',
  bom_code:'BOM-A',manufacturer_serial:'SERIAL-A',slot_label:'SLOT-A',
  condition:'normal',device_part_unit_id:null,physical_consequence_id:null});
test('Complete bounded LLD08 Installed Component evidence accepts owned active and removed instances',()=>{
 assert.doesNotThrow(()=>verifyInstalledComponentPage({items:[],next_cursor:null}));
 assert.doesNotThrow(()=>verifyInstalledComponentPage({items:[
   row(1),{...row(2),state:'removed',condition:'quarantined',
     device_part_unit_id:id(3),physical_consequence_id:id(4)},
 ],next_cursor:null}));
 assert.doesNotThrow(()=>verifyInstalledComponentPage({
   items:Array.from({length:200},(_,n)=>row(n+1)),next_cursor:null}));
});
test('Invalid Component IDs, conditions, duplicates, missing/forged fields and unbounded pages fail closed',()=>{
 const wrong=[
   {...row(),installed_component_id:'foreign'},
   {...row(),state:'in-transit'},
   {...row(),condition:'good'},
   {...row(),device_part_unit_id:'not-a-uuid'},
   {...row(),physical_consequence_id:'invalid'},
   {...row(),bom_code:'界'.repeat(214)},
   {...row(),manufacturer_serial:'x'.repeat(641)},
   {...row(),slot_label:'界'.repeat(129)},
   {...row(),extra_field:'untrusted'},
 ];
 for(const item of wrong)assert.throws(()=>
   verifyInstalledComponentPage({items:[item],next_cursor:null}),/Invalid Installed Component/u);
 const {slot_label,...missing}=row();
 assert.throws(()=>verifyInstalledComponentPage({items:[missing],next_cursor:null}),/Invalid Installed Component/u);
 assert.throws(()=>verifyInstalledComponentPage({items:[row(),row()],next_cursor:null}),/Invalid Installed Component/u);
 assert.throws(()=>verifyInstalledComponentPage({items:Array.from({length:201},(_,n)=>row(n+1)),next_cursor:null}),/Invalid Installed Component/u);
 assert.throws(()=>verifyInstalledComponentPage({items:[row()]}),/Invalid Installed Component/u);
});
