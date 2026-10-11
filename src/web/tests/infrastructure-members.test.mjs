import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {initialOwnerPage,nextOwnerPage} from '../.test-build/state/owner-page-history.js';
import {infrastructureIntent,NavigationHistory} from '../.test-build/app/router.js';
import {firstInfrastructureContextHistory} from '../.test-build/presentation/infrastructure-context-intent.js';
import {firstMembersPath,membersDigestInput,nextMembersPath,
  validMembersHistory,validRoomCloudState,verifyMembersPage} from '../.test-build/presentation/infrastructure-members.js';
const room='11111111-1111-4111-8111-111111111111';
const site='22222222-2222-4222-8222-222222222222';
const rack=n=>'33333333-3333-4333-8333-'+String(n).padStart(12,'0');
const sortedJson=value=>'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+JSON.stringify(value[k])).join(',')+'}';
const digest=createHash('sha256').update(sortedJson(membersDigestInput('room',room))).digest('hex');
const cursor=(id=100)=>({version:1,query_id:'InfrastructureRelationshipChildrenQuery',
  sort_registry_id:'InfrastructureRelationshipChildrenQuery_ORDER_V1',last_key_tuple:[rack(id)],
  filter_fingerprint:digest,null_order:'NOT_APPLICABLE'});
test('accepted Room member cursor preserves 51 identity paths with exact filters and no owner DTOs',()=>{
 const first=firstMembersPath('room',room);
 const second=nextMembersPath('room',room,cursor());
 const history=nextOwnerPage(initialOwnerPage(first),second,first+'&cursor=');
 assert.equal(validMembersHistory(history,'room',room),true);
 assert.deepEqual(membersDigestInput('room',room),{parent_kind:'room',parent_id:room,
   relationship:'room_racks',lifecycle:null,limit:100});
 assert.equal(validRoomCloudState({section:'Members',members:history},'room',room),true);
 for(const bad of [
   {...history,page:30},{...history,paths:[first,first]},
   {...history,paths:[first,second+'&evil=1']},{...history,extra:1},
   // A forged cursor must enter through an untrusted raw path, not through
   // nextMembersPath(), which correctly refuses to construct it.
   {...history,paths:[first,first+'&cursor='+encodeURIComponent(JSON.stringify({
     ...cursor(),filter_fingerprint:'A'.repeat(64),
   }))]},
 ]){
   assert.equal(validMembersHistory(bad,'room',room),false);
 }
 assert.throws(()=>nextMembersPath('room',room,{...cursor(),filter_fingerprint:'A'.repeat(64)}),
   /Invalid direct-member continuation/u);
 assert.equal(validRoomCloudState({section:'Members',members:null},'room',room),false);
 assert.equal(validRoomCloudState({section:'Summary',members:null},'room',room),true);
 assert.equal(validMembersHistory(history,'cloud_deployment',room),false);
});
test('typed direct members fail closed on forged owner rows and cursor order',()=>{
 const page={items:Array.from({length:100},(_,i)=>({kind:'rack',id:rack(i+1),label:'Rack',
   lifecycle:'active',site_id:site,parent_id:room,relationship:'room_racks'})),next_cursor:cursor()};
 assert.doesNotThrow(()=>verifyMembersPage(page,'room',room,site,digest,firstMembersPath('room',room)));
 for(const bad of [
   {...page,items:[{...page.items[0],site_id:room}]},
   {...page,items:[{...page.items[0],relationship:'cloud_assigned_elements'}]},
   {...page,items:[page.items[1],page.items[0]]},
   {...page,items:[page.items[0],page.items[0]]},
   {...page,next_cursor:{...cursor(),filter_fingerprint:'a'.repeat(64)}},
   {...page,next_cursor:cursor(101)},
 ]){
  assert.throws(()=>verifyMembersPage(bad,'room',room,site,digest,firstMembersPath('room',room)));
 }
 assert.throws(()=>verifyMembersPage(page,'room',room,site,digest,
   nextMembersPath('room',room,cursor(101))));
});

test('Room member history and active tab are immutable closed return intent, not owner data',()=>{
 const first=firstMembersPath('room',room),second=nextMembersPath('room',room,cursor(100));
 const members=nextOwnerPage(initialOwnerPage(first),second,first+'&cursor=');
 const intent={explorer:'/api/v1/infrastructure/tree?limit=200',openedId:room,
   openedKind:'room',tab:'Summary',components:null,history:null,workbook:null,
   contextHistory:initialOwnerPage(firstInfrastructureContextHistory(room,'room')),
   roomCloud:{section:'Members',members}};
 assert.ok(infrastructureIntent(intent));
 const history=new NavigationHistory(),token=history.remember({
   route:'/infrastructure',filterFingerprint:'a'.repeat(64),activeId:null,
   selectedId:null,memberIds:[],scrollAnchor:null,focusToken:null,
   infrastructure:intent,
 });
 const saved=history.restore(token).infrastructure.roomCloud;
 assert.equal(saved.section,'Members');
 assert.deepEqual(saved.members,members);
 assert.ok(Object.isFrozen(saved));
 assert.ok(Object.isFrozen(saved.members));
 assert.ok(Object.isFrozen(saved.members.paths));
 assert.ok(infrastructureIntent({...intent,roomCloud:{section:'History',members}}));
 assert.equal(infrastructureIntent({...intent,roomCloud:{section:'Members',members:null}}),null);
 assert.equal(infrastructureIntent({...intent,openedKind:'site'}),null);
 assert.equal(infrastructureIntent({...intent,roomCloud:{section:'Members',members,
   cachedRows:[{id:room}]}}),null);
 assert.equal(infrastructureIntent({...intent,roomCloud:{section:'Members',members:{
   ...members,paths:[...members.paths,'synthetic-current-owner-row'],
 }}}),null);
});
