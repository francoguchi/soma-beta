import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyNetworkHistoryPage} from '../.test-build/presentation/infrastructure-network-history.js';
const id=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const nil={kind:'null',text_value:null,integer_value:null,boolean_value:null,entity_ref:null};
const event=(n,at)=>({event_id:id(n),event_kind:'physical_change',recorded_at_utc:at,
  effective_at_utc:null,command_id:id(500),
  summary:{changes:[{field:'rack_id',prior:nil,new:nil}],reason_code:null,warning_codes:[]}});
const fail=page=>assert.throws(()=>verifyNetworkHistoryPage(page),/Invalid Network Element history/u);
test('Network Element historical projection accepts a complete bounded chronological owner page',()=>{
 assert.doesNotThrow(()=>verifyNetworkHistoryPage({events:[],next_cursor:null}));
 assert.doesNotThrow(()=>verifyNetworkHistoryPage({events:[event(1,9),event(2,8)],next_cursor:null}));
 assert.doesNotThrow(()=>verifyNetworkHistoryPage({events:[event(2,9),event(1,9)],next_cursor:null}));
});
test('Corrupt history facts cannot be displayed as accepted Network Element chronology',()=>{
 for(const bad of [
   {...event(1,1),event_id:'fake'},
   {...event(1,1),recorded_at_utc:1.2},
   {...event(1,1),effective_at_utc:-1},
   {...event(1,1),command_id:'fake'},
   {...event(1,1),summary:{...event(1,1).summary,reason_code:'界'.repeat(129)}},
   {...event(1,1),summary:{...event(1,1).summary,changes:[{field:'rack',
     prior:nil,new:{...nil,kind:'integer',integer_value:3,text_value:'forged'}}]}},
   {...event(1,1),extra:'owner facts'},
 ])fail({events:[bad],next_cursor:null});
 fail({events:[event(1,1),event(1,0)],next_cursor:null});
 fail({events:[event(1,1),event(2,2)],next_cursor:null});
 fail({events:Array.from({length:6},(_,i)=>event(i+1,10-i)),next_cursor:null});
 fail({events:[event(1,1)]});
});
