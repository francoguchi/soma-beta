import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NavigationHistory,infrastructureQuery} from '../.test-build/app/router.js';
import {
  EMPTY_EXPLORER_FILTERS,buildExplorerQuery,readExplorerFilters,
} from '../.test-build/presentation/infrastructure-explorer-filters.js';

const site='11111111-1111-4111-8111-111111111111';
const customer='22222222-2222-4222-8222-222222222222';
const first='/api/v1/infrastructure/tree?limit=200';
const filled={customerOrgId:customer,siteId:site,nodeKind:'network_element',lifecycle:'archived'};

test('LLD08 exact Customer/Site/kind/lifecycle filters construct only accepted first-owner-page queries',()=>{
  assert.equal(buildExplorerQuery(EMPTY_EXPLORER_FILTERS),first);
  const path=buildExplorerQuery(filled);
  assert.equal(path,first+'&customer_org_id='+customer+'&site_id='+site+
    '&node_kind=network_element&lifecycle=archived');
  assert.deepEqual(readExplorerFilters(path),filled);
  assert.deepEqual(readExplorerFilters(first),EMPTY_EXPLORER_FILTERS);
  assert.ok(infrastructureQuery(path,'explorer'));
  assert.equal(readExplorerFilters(path+'&cursor='+encodeURIComponent(JSON.stringify({
    version:1,query_id:'InfrastructureExplorerQuery',
  }))).nodeKind,'network_element');
  assert.equal(buildExplorerQuery({...filled,siteId:' '+site+' '}),path);
});

test('LLD08 malformed filter scopes fail closed instead of becoming unfiltered data',()=>{
  for(const invalid of [
    {...filled,customerOrgId:'not-a-uuid'},
    {...filled,siteId:site.toUpperCase()},
    {...filled,nodeKind:'cloud'},
    {...filled,lifecycle:'pending'},
    {...filled,extra:'injected'},
  ])assert.equal(buildExplorerQuery(invalid),null);
  for(const suffix of [
    '&site_id='+site+'&site_id='+customer,
    '&site_id='+site+'&unknown=x',
    '&node_kind=',
    '&node_kind=cloud',
    '&lifecycle=waiting',
    '&customer_org_id=not-a-uuid',
    '&customer_org_id=%20'+customer,
    '&limit=200',
    '#untrusted',
  ]){
    assert.equal(readExplorerFilters(first+suffix),null,suffix);
    assert.equal(infrastructureQuery(first+suffix,'explorer'),null,suffix);
  }
  assert.equal(readExplorerFilters('/api/v1/infrastructure/other?limit=200'),null);
});

test('Owner-filtered cursor path survives bounded return intent, without retaining any owner records',()=>{
  const path=buildExplorerQuery(filled);
  const cursor={version:1,query_id:'InfrastructureExplorerQuery',
    sort_registry_id:'InfrastructureExplorerQuery_ORDER_V1',
    last_key_tuple:[customer,site,4,site],filter_fingerprint:'a'.repeat(64),
    null_order:'NULLS_LAST'};
  const paged=path+'&cursor='+encodeURIComponent(JSON.stringify(cursor));
  assert.ok(infrastructureQuery(paged,'explorer'));
  assert.deepEqual(readExplorerFilters(paged),filled);
  const context={route:'/infrastructure',filterFingerprint:'a'.repeat(64),
    activeId:null,selectedId:null,memberIds:[],scrollAnchor:null,focusToken:null,
    infrastructure:{explorer:paged,openedId:null,tab:'Summary',components:null,history:null,workbook:null}};
  const history=new NavigationHistory();
  const id=history.remember(context);
  assert.equal(history.restore(id).infrastructure.explorer,paged);
  assert.ok(!JSON.stringify(history.restore(id)).includes('ownerRows'));
  for(const invalid of [
    paged.replace('node_kind=network_element','node_kind=made-up'),
    paged.replace('site_id='+site,'site_id=not-uuid'),
    paged+'&lifecycle=active',
  ])assert.throws(()=>history.remember({...context,infrastructure:{
    ...context.infrastructure,explorer:invalid,
  }}),/Invalid bounded return context/u);
});
