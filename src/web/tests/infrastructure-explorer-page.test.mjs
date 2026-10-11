import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyInfrastructureExplorerPage} from '../.test-build/presentation/infrastructure-explorer-page.js';
const id=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const node=(kind='site',n=1)=>({kind,id:id(n),label:'Valid owner node',
  parent_context_id:null,lifecycle:'active',warning_codes:[]});
const assertBad=page=>assert.throws(()=>verifyInfrastructureExplorerPage(page),/Invalid Infrastructure|Duplicate Infrastructure/u);
test('LLD08 explorer validates bounded typed nodes while retaining distinct containment context',()=>{
 const page={nodes:[node('network_element'),{...node('containment'),parent_context_id:id(2)}],next_cursor:null};
 assert.doesNotThrow(()=>verifyInfrastructureExplorerPage(page));
 assert.doesNotThrow(()=>verifyInfrastructureExplorerPage({nodes:[],next_cursor:null}));
 assert.doesNotThrow(()=>verifyInfrastructureExplorerPage({nodes:Array.from({length:200},(_,i)=>node('rack',i+1)),next_cursor:null}));
});
test('LLD08 corrupt owner envelope fails closed before display or Study29 selection',()=>{
 for(const bad of [
   {...node(),kind:'customer'},
   {...node(),id:'invalid-uuid'},
   {...node(),label:'界'.repeat(267)},
   {...node(),parent_context_id:'foreign'},
   {...node(),lifecycle:'unknown'},
   {...node(),warning_codes:['界'.repeat(43)]},
   {...node(),warning_codes:Array.from({length:17},()=> 'x')},
   {...node(),hiddenOwnerData:{id:id(10)}},
 ])assertBad({nodes:[bad],next_cursor:null});
 const {warning_codes,...missing}=node();
 assertBad({nodes:[missing],next_cursor:null});
 assertBad({nodes:[node(),node()],next_cursor:null});
 assertBad({nodes:Array.from({length:201},(_,i)=>node('room',i+1)),next_cursor:null});
 assertBad({nodes:[],next_cursor:null,untrusted:true});
 assertBad({nodes:[]});
});
