import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
const reqA='11111111-1111-4111-8111-111111111111';
const reqB='22222222-2222-4222-8222-222222222222';
const sr='33333333-3333-4333-8333-333333333333';
const contact='44444444-4444-4444-8444-444444444444';
const rma='55555555-5555-4555-8555-555555555555';
const batch='66666666-6666-4666-8666-666666666666';
const need='77777777-7777-4777-8777-777777777777';
const alias='C1234567890';
const request=(id,state='authorized')=>({
  spare_request_id:id,local_handle:'SPARE-LOCAL',service_request_id:sr,
  requester_contact_id:contact,requester_context:{},lifecycle_state:state,
  official_sr7:'SR1234567',submitted_quantity:2,authorized_rma_count:1,
  response_warning_start_utc:null,response_warning_age_seconds:null,revision:3,
});
const linkedRma={rma_id:rma,authorization_batch_id:batch,response_ordinal:1,
  promised_bom_code:'BOM-SAMPLE',current_c10:alias,state:'authorized',revision:1,
  target_device_part_unit_id:null,direct_inbound_spare_part_unit_id:null,return_obligation_open:true};
const detail={
  spare_request_id:reqA,local_handle:'SPARE-LOCAL',service_request_id:sr,
  requester:{contact_id:contact,creation_context:{},current_context:{
    display_name:'Operator Contact',lifecycle_state:'active',revision:1}},
  creation_origin:'manual',lifecycle_state:'authorized',official_sr7:'SR1234567',
  current_submission_snapshot_id:batch,submitted_quantity:2,authorized_rma_count:1,
  response_warning_start_utc:null,revision:3,
  draft_logistics:{mode:'receiver',receiver_contact_id:contact,dispatch_location_id:batch,revision:2},
  allocations:[{request_need_allocation_id:batch,spare_need_id:need,quantity:2,revision:1,
    active_draft:false,bom_code:'BOM-SAMPLE'}],
  submission_history:[{submission_snapshot_id:batch,temporary_tracking_id:'TRACK-123',
    recorded_at_utc:1234}],sr7_aliases:[{sr7:'SR1234567',alias_kind:'current'}],
  rmas:[linkedRma],history:[],
};
const rmaDetail={rma_id:rma,spare_request_id:reqA,promised_bom_code:'BOM-SAMPLE',
  promised_bom_key:'bom-sample',state:'authorized',revision:1,
  target_device_part_unit_id:null,direct_inbound_spare_part_unit_id:null,
  return_device_part_unit_id:null,return_spare_part_unit_id:null,
  return_obligation_open:true,active_fault_tag_membership_id:null,
  c10_aliases:[{c10:alias,alias_kind:'current'}],assignment_history:[],
  return_obligation:{state:'open',device_part_unit_id:null,spare_part_unit_id:null,
    physical_consequence_id:null,revision:1,last_event_id:null},
  fault_tag_memberships:[],actual_logistics:[],
};
const digest=value=>createHash('sha256').update(JSON.stringify(Object.fromEntries(
  Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)))).digest('hex');
const cursor=(last,asOf,state=null)=>({
  version:1,query_id:'SpareRequestListQuery',sort_registry_id:'INVENTORY_REQUEST_ID_ASC_V1',
  last_key_tuple:[last],filter_fingerprint:digest({schema:'SOMA_SPARE_REQUEST_LIST_FILTER_V1',
    service_request_id:null,lifecycle_state:state,response_warning_only:false,as_of_utc:asOf}),
  null_order:'not_applicable',
});
async function base(page) {
  await page.route('**/api/v1/inventory/stock?*',route=>route.fulfill({json:{
    items:[],continuation:null,exact_total:0,
  }}));
  await page.route('**/api/v1/inventory/attention?*',route=>{
    const asOf=Number(new URL(route.request().url()).searchParams.get('as_of_utc'));
    return route.fulfill({json:{items:[],continuation:null,exact_total:0,as_of_utc:asOf}});
  });
}
async function showRequests(page) {
  await page.goto('http://127.0.0.1:4174/inventory');
  const desk=page.getByRole('region',{name:'Spare Requests Desk'});
  await desk.getByRole('button',{name:'Inspect Spare Requests'}).click();
  return desk.getByRole('region',{name:'Accepted Spare Requests'});
}
test('Request list and nested RMA point read only on explicit operator selection',async({page})=>{
  await base(page);const seen=[];
  await page.route('**/api/v1/inventory/requests?*',route=>{
    const u=new URL(route.request().url());seen.push('list');
    return route.fulfill({json:{items:[request(reqA)],continuation:null,exact_total:1,
      as_of_utc:Number(u.searchParams.get('as_of_utc'))}});
  });
  await page.route('**/api/v1/inventory/requests/'+reqA,route=>{
    seen.push('request');return route.fulfill({json:detail});
  });
  await page.route('**/api/v1/inventory/rmas/'+rma,route=>{
    seen.push('rma');return route.fulfill({json:rmaDetail});
  });
  const requests=await showRequests(page);
  await expect(requests.getByRole('button',{name:'Inspect Spare Request '+reqA})).toBeVisible();
  expect(seen).toEqual(['list']);
  await requests.getByRole('button',{name:'Inspect Spare Request '+reqA}).click();
  const selected=requests.getByRole('complementary',{name:'Selected Spare Request'});
  await expect(selected.getByText('Operator Contact')).toBeVisible();
  await expect(selected.getByRole('button',{name:'Inspect RMA '+rma})).toBeVisible();
  expect(seen).toEqual(['list','request']);
  await selected.getByRole('button',{name:'Inspect RMA '+rma}).click();
  const rmaPanel=selected.getByRole('complementary',{name:'Selected RMA'});
  await expect(rmaPanel.getByText('No actual inbound receipt registered')).toBeVisible();
  await expect(rmaPanel).toContainText('Warehouse acceptance');
  expect(seen).toEqual(['list','request','rma']);
  for(const mutation of ['Submit Spare Request','Register LSU','Accept RMA receipt']){
    await expect(page.getByRole('button',{name:mutation})).toHaveCount(0);
  }
});
test('Request cursor binds exact as-of and lifecycle filter resets selected request',async({page})=>{
  await base(page);const urls=[];
  await page.route('**/api/v1/inventory/requests?*',route=>{
    const u=new URL(route.request().url());urls.push(u);
    const asOf=Number(u.searchParams.get('as_of_utc'));
    return route.fulfill({json:u.searchParams.get('lifecycle_state')==='draft'
      ?{items:[request(reqB,'draft')],continuation:null,exact_total:1,as_of_utc:asOf}
      :u.searchParams.has('cursor')
      ?{items:[request(reqB)],continuation:null,exact_total:26,as_of_utc:asOf}
      :{items:[request(reqA)],continuation:cursor(reqA,asOf),exact_total:26,as_of_utc:asOf}});
  });
  await page.route('**/api/v1/inventory/requests/'+reqA,route=>route.fulfill({json:detail}));
  const requests=await showRequests(page);
  await requests.getByRole('button',{name:'Inspect Spare Request '+reqA}).click();
  await expect(requests.getByRole('complementary',{name:'Selected Spare Request'})).toBeVisible();
  await requests.getByRole('button',{name:'Next page'}).click();
  await expect(requests.getByRole('button',{name:'Inspect Spare Request '+reqB})).toBeVisible();
  await expect(requests.getByRole('complementary',{name:'Selected Spare Request'})).toHaveCount(0);
  const first=urls[0],second=urls[1];
  expect(first.searchParams.get('as_of_utc')).toBe(second.searchParams.get('as_of_utc'));
  expect(JSON.parse(second.searchParams.get('cursor'))).toEqual(cursor(reqA,Number(first.searchParams.get('as_of_utc'))));
  await requests.getByRole('combobox',{name:'Request lifecycle'}).selectOption('draft');
  await expect(requests.getByRole('button',{name:'Inspect Spare Request '+reqB})).toBeVisible();
  expect(urls.at(-1).searchParams.get('lifecycle_state')).toBe('draft');
  expect(urls.at(-1).searchParams.has('cursor')).toBe(false);
});
test('Corrupt request continuation prevents rendering its rows',async({page})=>{
  await base(page);
  await page.route('**/api/v1/inventory/requests?*',route=>{
    const asOf=Number(new URL(route.request().url()).searchParams.get('as_of_utc'));
    return route.fulfill({json:{items:[{...request(reqA),local_handle:'UNTRUSTED-REQUEST'}],
      exact_total:26,as_of_utc:asOf,continuation:{...cursor(reqA,asOf),
        filter_fingerprint:'f'.repeat(64)}}});
  });
  const requests=await showRequests(page);
  await expect(requests.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(requests.getByText('UNTRUSTED-REQUEST')).toHaveCount(0);
});
test('Cross-request RMA point response fails closed rather than claiming receipt',async({page})=>{
  await base(page);
  await page.route('**/api/v1/inventory/requests?*',route=>{
    const asOf=Number(new URL(route.request().url()).searchParams.get('as_of_utc'));
    return route.fulfill({json:{items:[request(reqA)],exact_total:1,continuation:null,as_of_utc:asOf}});
  });
  await page.route('**/api/v1/inventory/requests/'+reqA,route=>route.fulfill({json:detail}));
  await page.route('**/api/v1/inventory/rmas/'+rma,route=>route.fulfill({json:{
    ...rmaDetail,spare_request_id:reqB,actual_logistics:[{logistics_event_id:batch,
      event_kind:'UNTRUSTED-ACTUAL-RECEIPT',recorded_at_utc:1234}],
  }}));
  const requests=await showRequests(page);
  await requests.getByRole('button',{name:'Inspect Spare Request '+reqA}).click();
  await requests.getByRole('button',{name:'Inspect RMA '+rma}).click();
  const panel=requests.getByRole('complementary',{name:'Selected RMA'});
  await expect(panel.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(panel).not.toContainText('UNTRUSTED-ACTUAL-RECEIPT');
});
