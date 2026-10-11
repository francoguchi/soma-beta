import {test} from 'node:test';
import assert from 'node:assert/strict';
import {infrastructureQuery,NavigationHistory} from '../.test-build/app/router.js';
import {
  EMPTY_COMPONENT_FILTERS,buildComponentQuery,readComponentFilters,
} from '../.test-build/presentation/infrastructure-component-filters.js';
const id='11111111-1111-4111-8111-111111111111';
const component='22222222-2222-4222-8222-222222222222';
const base='/api/v1/infrastructure/network-elements/'+id+'/components?limit=200';
const filters={state:'removed',bomKey:'exact-bom-key',slotKey:'slot/A'};

test('LLD08 Installed Component filters preserve exact owner keys and existing page shape',()=>{
 assert.deepEqual(EMPTY_COMPONENT_FILTERS,{state:'',bomKey:'',slotKey:''});
 assert.equal(buildComponentQuery(id,{state:'',bomKey:'',slotKey:''}),base,
   'A plain canonical empty filter must open the first component owner page');
 assert.equal(buildComponentQuery(id,EMPTY_COMPONENT_FILTERS),base,
   'The immutable empty filter must build the same first-page owner query');
 const path=buildComponentQuery(id,filters);
 assert.equal(path,base+'&state=removed&bom_key=exact-bom-key&slot_match_key=slot%2FA');
 assert.deepEqual(readComponentFilters(path,id),filters);
 assert.ok(infrastructureQuery(path,'components',id));
 assert.equal(readComponentFilters(path,component),null);
 const cursor={version:1,query_id:'InstalledComponentQuery',
   sort_registry_id:'InstalledComponentQuery_ORDER_V1',last_key_tuple:[null,component],
   filter_fingerprint:'a'.repeat(64),null_order:'NULLS_LAST'};
 const paged=path+'&cursor='+encodeURIComponent(JSON.stringify(cursor));
 assert.deepEqual(readComponentFilters(paged,id),filters);
 assert.deepEqual(infrastructureQuery(paged,'components',id).cursor,cursor);
 const history=new NavigationHistory();
 const state={route:'/infrastructure',filterFingerprint:'a'.repeat(64),
   activeId:null,selectedId:null,memberIds:[],focusToken:null,scrollAnchor:null,
   infrastructure:{explorer:'/api/v1/infrastructure/tree?limit=200',openedId:id,
     tab:'Components',components:paged,history:'/api/v1/infrastructure/history?target_kind=network_element&target_id='+id+'&limit=5',workbook:null}};
 const token=history.remember(state);
 assert.equal(history.restore(token).infrastructure.components,paged);
});
test('Invalid state, oversized multibyte match keys and foreign query parameters fail closed',()=>{
 for(const invalid of [
  {...filters,state:'damaged'},
  {...filters,bomKey:'界'.repeat(214)},
  {...filters,slotKey:'界'.repeat(129)},
  {...filters,extra:'untrusted'},
 ])assert.equal(buildComponentQuery(id,invalid),null);
 assert.equal(buildComponentQuery('not-uuid',filters),null);
 for(const suffix of [
  '&state=unknown&state=installed',
  '&state=unspecified',
  '&bom_key=',
  '&slot_match_key=',
  '&site_id='+id,
  '&limit=200',
  '#untrusted',
 ]){
   assert.equal(readComponentFilters(base+suffix,id),null,suffix);
   assert.equal(infrastructureQuery(base+suffix,'components',id),null,suffix);
 }
});
