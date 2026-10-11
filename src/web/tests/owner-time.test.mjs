import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatOwnerLocalTime} from '../.test-build/presentation/owner-time.js';

test('Owner epoch remains exact while operator presentation uses local calendar, not raw UTC ISO',()=>{
  const epoch=1704067200;
  const expected=new Date(epoch*1000).toLocaleString(undefined,{
    dateStyle:'medium',timeStyle:'short',
  });
  assert.equal(formatOwnerLocalTime(epoch),expected);
  assert.doesNotMatch(formatOwnerLocalTime(epoch),/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z/u);
});
test('Local presentation does not silently invent times from invalid owner seconds',()=>{
  for(const value of [-1,1.5,NaN,Infinity,8640000000001,Number.MAX_SAFE_INTEGER])
    assert.throws(()=>formatOwnerLocalTime(value),/Invalid owner instant/u);
});
test('Owner epoch zero is a known local instant, not an unknown/null sentinel',()=>{
  assert.equal(formatOwnerLocalTime(0),new Date(0).toLocaleString(undefined,{
    dateStyle:'medium',timeStyle:'short',
  }));
});
