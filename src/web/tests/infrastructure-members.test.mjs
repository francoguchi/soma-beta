import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {initialOwnerPage,nextOwnerPage} from '../.test-build/state/owner-page-history.js';
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
   {...history,paths:[first,nextMembersPath('room',room,{...cursor(),filter_fingerprint:'A'.repeat(64)})]},
 ]){
   assert.equal(validMembersHistory(bad,'room',room),false);
 }
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
