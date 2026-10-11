import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NavigationHistory} from '../.test-build/app/router.js';
import {
 FULL_STRUCTURE,applySessionStructure,currentSessionStructure,structurePreset,structurePath,moveStructureLevel,dropStructureLevel,toggleStructureLevel,
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

test('Structure view survives return by closed intent; historical projection never stores owner DTOs',()=>{
 const view=structurePreset('site-cloud');
 const state={
  route:'/infrastructure',filterFingerprint:'a'.repeat(64),
  activeId:null,selectedId:null,memberIds:[],scrollAnchor:null,focusToken:'infrastructure:structure',
  infrastructure:{explorer:'/api/v1/infrastructure/tree?limit=200',
    openedId:null,tab:'Summary',components:null,history:null,workbook:null},
  infrastructureStructure:view,
 };
 const history=new NavigationHistory(),token=history.remember(state);
 assert.deepEqual(history.restore(token)?.infrastructureStructure,view);
 assert.equal(Object.isFrozen(history.restore(token)?.infrastructureStructure),true);
 assert.equal(Object.isFrozen(history.restore(token)?.infrastructureStructure.order),true);
 assert.throws(()=>history.remember({...state,infrastructureStructure:{
  order:['site','rack','room','rack'],visible:['site'],
 }}),/Invalid bounded return context/u);
 assert.throws(()=>history.remember({...state,infrastructureStructure:{
  ...view,ownerRows:[{fake:true}],
 }}),/Invalid bounded return context/u);
 assert.throws(()=>history.remember({...state,route:'/inventory'}),/Invalid bounded return context/u);
});

test('Drag/drop reorders intermediate Structure levels without moving pinned endpoints',()=>{
 const moved=dropStructureLevel(FULL_STRUCTURE,'rack','site');
 assert.deepEqual(moved.order,['cloud_deployment','rack','site','room']);
 assert.equal(structurePath(moved),'Customer → Cloud → Rack → Site → Room → Network Element');
 assert.deepEqual(dropStructureLevel(moved,'rack','rack'),moved);
 assert.equal(structurePath(FULL_STRUCTURE),'Customer → Cloud → Site → Room → Rack → Network Element');
});

test('Study29 session Apply persists only closed Structure choices; fresh default is recoverable',()=>{
  try{
    const applied=applySessionStructure(structurePreset('direct'));
    assert.deepEqual(currentSessionStructure(),applied);
    assert.equal(structurePath(currentSessionStructure()),'Customer → Network Element');
    applied.order.push?.('invalid'); // detached copy does not mutate stored authority
    assert.equal(validStructure(currentSessionStructure()),true);
    assert.throws(()=>applySessionStructure({order:['site'],visible:[]}),/Invalid Structure session intent/u);
    assert.deepEqual(currentSessionStructure(),structurePreset('direct'));
  }finally{
    applySessionStructure(FULL_STRUCTURE);
  }
  assert.deepEqual(currentSessionStructure(),FULL_STRUCTURE);
});
