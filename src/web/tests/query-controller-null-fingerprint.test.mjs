import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {filterFingerprint} from '../.test-build/data/query-controller.js';

const runId='11111111-1111-4111-8111-111111111111';
const digest=json=>createHash('sha256').update(json,'utf8').digest('hex');

test('LLD-04 finding cursor fingerprint hashes canonical explicit-null filters',async()=>{
  const filters={schema:'SOMA_IMPORT_FINDING_LIST_FILTER_V1',import_run_id:runId,
    severity:null,scope_kind:null};
  const canonical='{"import_run_id":"'+runId+'","schema":"SOMA_IMPORT_FINDING_LIST_FILTER_V1","scope_kind":null,"severity":null}';
  assert.equal(await filterFingerprint(filters),digest(canonical));
  assert.notEqual(await filterFingerprint({...filters,severity:''}),digest(canonical));
  assert.notEqual(await filterFingerprint({schema:filters.schema,import_run_id:runId}),digest(canonical));
});

test('LLD-04 proposal cursor fingerprint includes all null state/risk/kind owner filters',async()=>{
  const expected='{"import_run_id":"'+runId+'","kind":null,"risk":null,"schema":"SOMA_IMPORT_PROPOSAL_LIST_FILTER_V1","state":null}';
  assert.equal(await filterFingerprint({
    schema:'SOMA_IMPORT_PROPOSAL_LIST_FILTER_V1',import_run_id:runId,
    state:null,risk:null,kind:null,
  }),digest(expected));
});

test('Existing string-only filters preserve their canonical fingerprint',async()=>{
  const filters={ticket_type:'service_request',schema:'SOMA_TICKET_DEVICE_REFERENCE_FILTER_V1',ticket_id:runId};
  const expected='{"schema":"SOMA_TICKET_DEVICE_REFERENCE_FILTER_V1","ticket_id":"'+runId+'","ticket_type":"service_request"}';
  assert.equal(await filterFingerprint(filters),digest(expected));
});

test('LLD-07 Spare Request cursor hash treats as_of_utc as a number, not text',async()=>{
  const filters={schema:'SOMA_SPARE_REQUEST_LIST_FILTER_V1',service_request_id:null,
    lifecycle_state:null,response_warning_only:false,as_of_utc:1791700000};
  const canonical='{"as_of_utc":1791700000,"lifecycle_state":null,"response_warning_only":false,"schema":"SOMA_SPARE_REQUEST_LIST_FILTER_V1","service_request_id":null}';
  assert.equal(await filterFingerprint(filters),digest(canonical));
  assert.notEqual(await filterFingerprint({...filters,as_of_utc:'1791700000'}),digest(canonical));
  assert.notEqual(await filterFingerprint({...filters,response_warning_only:true}),digest(canonical));
});

test('LLD-07 Inventory history cursor hash binds exact target kind and UUID',async()=>{
  const id='11111111-1111-4111-8111-111111111111';
  const filters={schema:'SOMA_INVENTORY_HISTORY_FILTER_V1',target_kind:'rma',target_id:id};
  const canonical='{"schema":"SOMA_INVENTORY_HISTORY_FILTER_V1","target_id":"'+id+'","target_kind":"rma"}';
  assert.equal(await filterFingerprint(filters),digest(canonical));
  assert.notEqual(await filterFingerprint({...filters,target_kind:'spare_request'}),digest(canonical));
  assert.notEqual(await filterFingerprint({...filters,target_id:'22222222-2222-4222-8222-222222222222'}),digest(canonical));
});

test('LLD-07 Fault Tag list fingerprint binds archived null/false/true separately',async()=>{
  const owner={schema:'SOMA_FAULT_TAG_LIST_FILTER_V1',state:null,archived:null};
  const canonical='{"archived":null,"schema":"SOMA_FAULT_TAG_LIST_FILTER_V1","state":null}';
  assert.equal(await filterFingerprint(owner),digest(canonical));
  assert.notEqual(await filterFingerprint({...owner,archived:false}),digest(canonical));
  assert.notEqual(await filterFingerprint({...owner,archived:true}),digest(canonical));
});
