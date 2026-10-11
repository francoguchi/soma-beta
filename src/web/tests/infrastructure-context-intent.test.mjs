import {test} from 'node:test';
import assert from 'node:assert/strict';
import {infrastructureIntent,NavigationHistory} from '../.test-build/app/router.js';
import {firstInfrastructureContextHistory,validInfrastructureContextHistory} from '../.test-build/presentation/infrastructure-context-intent.js';
import {initialOwnerPage,nextOwnerPage} from '../.test-build/state/owner-page-history.js';
const room='11111111-1111-4111-8111-111111111111';
const cloud='22222222-2222-4222-8222-222222222222';
const event=n=>'55555555-5555-4555-8555-'+String(n).padStart(12,'0');
const cursor=(at,id=event(1),digest='a'.repeat(64))=>({
 version:1,query_id:'InfrastructureHistoryQuery',sort_registry_id:'InfrastructureHistoryQuery_ORDER_V1',
 last_key_tuple:[at,id],filter_fingerprint:digest,null_order:'NOT_APPLICABLE',
});
const base=firstInfrastructureContextHistory(room,'room');
const next=(c)=>base+'&cursor='+encodeURIComponent(JSON.stringify(c));
const empty=()=>initialOwnerPage(base);
const context=nextOwnerPage(empty(),next(cursor(100)),base+'&cursor=');
const intent={explorer:'/api/v1/infrastructure/tree?limit=200',openedId:room,openedKind:'room',
  tab:'Summary',components:null,history:null,workbook:null,contextHistory:context};
const remember=(value)=>new NavigationHistory().remember({
  route:'/infrastructure',filterFingerprint:'a'.repeat(64),activeId:null,selectedId:null,
  memberIds:[],scrollAnchor:null,focusToken:null,infrastructure:value,
});
test('Room/Cloud history return carries bounded cursor paths, never response DTOs',()=>{
 assert.equal(firstInfrastructureContextHistory(cloud,'cloud_deployment').includes('target_kind=cloud_deployment'),true);
 assert.equal(validInfrastructureContextHistory(context,room,'room'),true);
 assert.ok(infrastructureIntent(intent));
 const history=new NavigationHistory(),token=history.remember({
   route:'/infrastructure',filterFingerprint:'a'.repeat(64),activeId:null,selectedId:null,
   memberIds:[],scrollAnchor:null,focusToken:null,infrastructure:intent,
 });
 const saved=history.restore(token).infrastructure.contextHistory;
 assert.notEqual(saved,context);assert.deepEqual(saved,context);
 assert.equal(Object.isFrozen(saved),true);assert.equal(Object.isFrozen(saved.paths),true);
 assert.equal(JSON.stringify(saved).includes('ownerRows'),false);
 assert.equal(validInfrastructureContextHistory(empty(),room,'room'),true);
 assert.equal(infrastructureIntent({...intent,openedKind:'site'}),null);
 assert.equal(infrastructureIntent({...intent,openedKind:'network_element'}),null);
 assert.equal(infrastructureIntent({...intent,openedId:cloud}),null);
});
test('Room/Cloud history return rejects foreign, forged, stale and unbounded cursor histories',()=>{
 const stale=(c)=>({...context,paths:[base,next(c)]});
 const bad=[
  {...context,paths:[base,next(cursor(100,cloud))+'#frag']},
  stale({...cursor(100),query_id:'OtherHistoryQuery'}),
  stale({...cursor(100),last_key_tuple:[true,event(1)]}),
  stale({...cursor(100),filter_fingerprint:'X'.repeat(64)}),
  stale({...cursor(100),sourceRows:[{id:'fake'}]}),
  {...context,paths:[base,base]},
  {...context,page:5},
  {...context,first:1},
  {...context,paths:[base,...Array(51).fill(next(cursor(100)))]},
  {...context,paths:[base,next(cursor(100))+'&limit=5']},
  {...context,extra:'forged'},
  {...context,paths:[base,next(cursor(100)),next(cursor(101))],page:2},
  {...context,paths:[base,next(cursor(100)),next(cursor(99,event(2),'b'.repeat(64)))],page:2},
 ];
 for(const item of bad){
  assert.equal(validInfrastructureContextHistory(item,room,'room'),false);
  assert.equal(infrastructureIntent({...intent,contextHistory:item}),null);
  assert.throws(()=>remember({...intent,contextHistory:item}),/Invalid bounded return context/u);
 }
 assert.equal(infrastructureIntent({...intent,contextHistory:undefined}),null);
 assert.equal(infrastructureIntent({...intent,contextHistory:null}),null);
});
