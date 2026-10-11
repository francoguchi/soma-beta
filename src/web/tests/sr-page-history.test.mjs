import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initialSrPageHistory,currentSrPagePath,previousSrPage,nextSrPage
} from '../.test-build/state/sr-page-history.js';

const first='/api/v1/tickets/service-requests?limit=25';
const next=n=>first+'&cursor='+encodeURIComponent(JSON.stringify({
  version:1,sort_registry_id:'SR_UPDATED_ID_DESC_V1',
  service_request_id:'33333333-3333-4333-8333-333333333333',updated_at_utc:n,
}));

test('SR selection pagination can advance beyond page 51 with bounded retained cursors',()=>{
  let state=initialSrPageHistory(first);
  for(let index=0;index<100;index++){
    const route=next(index);
    state=nextSrPage(state,route);
    assert.equal(currentSrPagePath(state),route);
    assert.ok(state.paths.length<=51);
    assert.equal(state.page,index+1);
    assert.equal(state.first,Math.max(0,index+2-51));
  }
  for(let index=0;index<50;index++)state=previousSrPage(state);
  assert.equal(state.page,50);
  assert.equal(state.first,50);
  const edge=previousSrPage(state);
  assert.deepEqual(edge,state);
  assert.equal(currentSrPagePath(state),next(49));
});

test('SR bounded browsing trims future keys after navigating backward and forward again',()=>{
  let state=initialSrPageHistory(first);
  state=nextSrPage(state,next(1));
  state=nextSrPage(state,next(2));
  state=previousSrPage(state);
  assert.equal(currentSrPagePath(state),next(1));
  state=nextSrPage(state,next(3));
  assert.deepEqual(state.paths,[first,next(1),next(3)]);
  assert.equal(currentSrPagePath(state),next(3));
  assert.deepEqual(initialSrPageHistory(first),{paths:[first],first:0,page:0});
});

test('SR history only accepts bounded owner collection cursor routes',()=>{
  const state=initialSrPageHistory(first);
  for(const bad of ['/tickets','/api/v1/tickets/rfcs?cursor=1',
    first+'&cursor='+('x'.repeat(4097))]){
    assert.throws(()=>nextSrPage(state,bad),/Invalid SR continuation/);
  }
  assert.throws(()=>currentSrPagePath({paths:[],first:0,page:0}),/Invalid SR cursor history/);
});
