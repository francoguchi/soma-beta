import {test} from 'node:test';
import assert from 'node:assert/strict';
import {infrastructureIntent} from '../.test-build/app/router.js';
import {openInfrastructureRelated} from '../.test-build/presentation/infrastructure-relationships.js';
const id=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const old={explorer:'/api/v1/infrastructure/tree?limit=200',openedId:id(1),
  openedKind:'network_element',tab:'Relationships',
  components:'/api/v1/infrastructure/network-elements/'+id(1)+'/components?limit=200',
  history:'/api/v1/infrastructure/history?target_kind=network_element&target_id='+id(1)+'&limit=5',
  workbook:null};
test('Accepted physical and logical relationship navigation preserves only exact, closed owner read intents',()=>{
  for(const kind of ['site','rack','room','cloud_deployment','network_element']){
    const target=openInfrastructureRelated(old,kind,id(2));
    assert.ok(target,kind);assert.ok(infrastructureIntent(target));
    assert.equal(target.explorer,old.explorer);
    assert.equal(target.openedId,id(2));assert.equal(target.openedKind,kind);
    assert.equal(target.tab,'Summary');assert.equal(target.workbook,null);
    assert.equal(target.components,kind==='network_element'?
      '/api/v1/infrastructure/network-elements/'+id(2)+'/components?limit=200':null);
    assert.equal(target.history,kind==='network_element'?
      '/api/v1/infrastructure/history?target_kind=network_element&target_id='+id(2)+'&limit=5':null);
  }
  assert.equal(old.openedId,id(1));assert.equal(old.tab,'Relationships');
});
test('Untrusted identities or foreign/stale source intents cannot open a plausible Infrastructure relation',()=>{
  for(const invalid of ['bad',id(2).toUpperCase(),id(1).replace('-4','-1')])
    assert.equal(openInfrastructureRelated(old,'rack',invalid),null);
  assert.equal(openInfrastructureRelated(old,'unknown',id(2)),null);
  assert.equal(openInfrastructureRelated({...old,explorer:'/api/v1/infrastructure/tree?limit=201'},'rack',id(2)),null);
  assert.equal(openInfrastructureRelated({...old,openedId:null,tab:'Relationships'},'rack',id(2)),null);
});
