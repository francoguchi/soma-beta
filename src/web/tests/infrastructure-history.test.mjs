import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  historyValueText,verifyHistoryValue,
} from '../.test-build/presentation/infrastructure-history.js';

const uuid='11111111-1111-4111-8111-111111111111';
const empty={text_value:null,integer_value:null,boolean_value:null,entity_ref:null};
test('Typed Infrastructure history values reveal only matching bounded owner fields',()=>{
 const values=[
  {...empty,kind:'null'},
  {...empty,kind:'text',text_value:'previous Site'},
  {...empty,kind:'integer',integer_value:-2},
  {...empty,kind:'boolean',boolean_value:false},
  {...empty,kind:'entity_ref',entity_ref:{kind:'room',id:uuid}},
 ];
 for(const v of values)assert.equal(verifyHistoryValue(v),true);
 assert.deepEqual(values.map(historyValueText),['None','previous Site','-2','False','room: '+uuid]);
});
test('History value corruption fails closed: foreign refs, mismatched discriminants and overlong text',()=>{
 for(const value of [
  {...empty,kind:'null',integer_value:0},
  {...empty,kind:'integer',integer_value:1.5},
  {...empty,kind:'integer',integer_value:2,text_value:'forged'},
  {...empty,kind:'boolean',boolean_value:'yes'},
  {...empty,kind:'text',text_value:'x'.repeat(1601)},
  {...empty,kind:'entity_ref',entity_ref:{kind:'unknown',id:uuid}},
  {...empty,kind:'entity_ref',entity_ref:{kind:'rack',id:'not-a-uuid'}},
  {...empty,kind:'entity_ref',entity_ref:{kind:'rack',id:uuid,ownerFacts:[]}},
  {...empty,kind:'null',unexpected:0},
 ]){
   assert.equal(verifyHistoryValue(value),false);
   assert.throws(()=>historyValueText(value),/Invalid Infrastructure historical value/u);
 }
});
