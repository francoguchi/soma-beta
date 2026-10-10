import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  initialOwnerPage,ownerPagePath,previousOwnerPage,nextOwnerPage
} from '../.test-build/state/owner-page-history.js';

const first='/api/v1/tickets/rfcs?limit=25';
const key=index=>first+'&cursor='+encodeURIComponent(JSON.stringify({
  version:1,sort_registry_id:'RFC_UPDATED_ID_DESC_V1',
  updated_at_utc:index,rfc_id:'33333333-3333-4333-8333-333333333333'
}));
const prefix=first+'&cursor=';

test('RFC owner history keeps advancing beyond 51 pages with a 51-cursor bound',()=>{
  let h=initialOwnerPage(first);
  for(let i=0;i<128;i++){
    h=nextOwnerPage(h,key(i),prefix);
    assert.equal(ownerPagePath(h),key(i));
    assert.ok(h.paths.length<=51);
    assert.equal(h.page,i+1);
    assert.equal(h.first,Math.max(0,i+2-51));
  }
  for(let i=0;i<50;i++)h=previousOwnerPage(h);
  assert.equal(h.page,h.first);
  assert.deepEqual(previousOwnerPage(h),h);
  assert.equal(ownerPagePath(h),key(77));
});

test('RFC history trims forward cursor keys and fails closed on unrelated routes',()=>{
  let h=initialOwnerPage(first);
  h=nextOwnerPage(h,key(1),prefix);
  h=nextOwnerPage(h,key(2),prefix);
  h=previousOwnerPage(h);
  h=nextOwnerPage(h,key(3),prefix);
  assert.deepEqual(h.paths,[first,key(1),key(3)]);
  for(const x of ['/tickets','/api/v1/tickets/service-requests?limit=25&cursor=x',
    prefix+'x'.repeat(4096),prefix+'abc#fragment']){
    assert.throws(()=>nextOwnerPage(h,x,prefix),/Invalid owner continuation/);
  }
  assert.throws(()=>ownerPagePath({paths:[],page:0,first:0}),/Invalid owner cursor history/);
});
