import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
 FULL_STRUCTURE,structurePreset,structurePath,moveStructureLevel,toggleStructureLevel,
 projectStructureRows,validStructure,
} from '../.test-build/presentation/infrastructure-structure.js';

const owner=[
 {kind:'site',id:'site',parent_context_id:null},
 {kind:'room',id:'room',parent_context_id:'site'},
 {kind:'rack',id:'rack',parent_context_id:'room'},
 {kind:'cloud_deployment',id:'cloud',parent_context_id:'site'},
 {kind:'network_element',id:'ne',parent_context_id:'rack'},
 {kind:'containment',id:'ne',parent_context_id:'other-ne'},
];
test('Study29 presets pin Customer and Network Element, and preserve complete source identities',()=>{
 const full=projectStructureRows(owner,FULL_STRUCTURE);
 assert.deepEqual(full.map(n=>n.kind),[
  'cloud_deployment','site','room','rack','network_element','containment']);
 assert.equal(structurePath(FULL_STRUCTURE),'Customer → Cloud → Site → Room → Rack → Network Element');
 const siteCloud=structurePreset('site-cloud');
 assert.deepEqual(projectStructureRows(owner,siteCloud).map(n=>n.kind),[
  'site','cloud_deployment','room','rack','network_element','containment']);
 assert.equal(structurePath(siteCloud),'Customer → Site → Cloud → Room → Rack → Network Element');
 const direct=structurePreset('direct');
 assert.equal(structurePath(direct),'Customer → Network Element');
 assert.deepEqual(projectStructureRows(owner,direct).map(n=>n.kind),[
  'network_element','containment']);
 // Display-only: no mutation of owner DTOs or physical/containment parents.
 assert.deepEqual(owner.map(n=>n.parent_context_id),[
  null,'site','room','site','rack','other-ne']);
 assert.equal(projectStructureRows(owner,FULL_STRUCTURE)[0],owner[3]);
});
test('Reorder and hide preserve hidden order; reveal recovers it without changing authoritative objects',()=>{
 let view=moveStructureLevel(FULL_STRUCTURE,'site',-1);
 assert.deepEqual(view.order,['site','cloud_deployment','room','rack']);
 view=toggleStructureLevel(view,'room');
 assert.equal(view.visible.includes('room'),false);
 assert.equal(projectStructureRows(owner,view).some(n=>n.kind==='room'),false);
 view=moveStructureLevel(view,'room',-1);
 view=toggleStructureLevel(view,'room');
 assert.deepEqual(projectStructureRows(owner,view).map(n=>n.kind),
  ['site','room','cloud_deployment','rack','network_element','containment']);
 assert.equal(view.visible.includes('room'),true);
 assert.deepEqual(owner.map(n=>n.kind),[
  'site','room','rack','cloud_deployment','network_element','containment']);
});
test('Structure view is bounded, closed and rejects fabricated intermediate levels',()=>{
 for(const wrong of [
  {order:['site','room','rack','rack'],visible:['site']},
  {order:['site','room','rack','network_element'],visible:['site']},
  {order:['site','room','rack'],visible:['site']},
  {order:[...FULL_STRUCTURE.order],visible:['site','site']},
  {order:[...FULL_STRUCTURE.order],visible:['customer']},
 ])assert.equal(validStructure(wrong),false);
 assert.throws(()=>projectStructureRows(owner,{order:['site'],visible:[]}),/Invalid bounded/u);
 assert.throws(()=>projectStructureRows(Array.from({length:201},()=>owner[0]),FULL_STRUCTURE),/Invalid bounded/u);
 assert.deepEqual(projectStructureRows([],structurePreset('direct')),[]);
});
