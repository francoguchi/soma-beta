import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';

const tagA='11111111-1111-4111-8111-111111111111';
const tagB='22222222-2222-4222-8222-222222222222';
const member='33333333-3333-4333-8333-333333333333';
const rma='44444444-4444-4444-8444-444444444444';
const consequence='55555555-5555-4555-8555-555555555555';
const listRow=(id,archived=false)=>({
  fault_tag_id:id,tracking_handle:'FT-12345678',state:'draft',archived,
  submitted_member_count:0,awaiting_receipt_count:0,awaiting_final_count:0,
  accepted_count:0,rejected_count:0,revision:1,
});
const detail={
  ...listRow(tagA),draft_revision:1,draft_return_method:'non_pickup',
  current_submission_snapshot_id:null,current_pickup_location:null,
  counts:{submitted:0,awaiting_receipt:0,awaiting_final:0,accepted:0,rejected:0},
  members:[{fault_tag_membership_id:member,rma_id:rma,
    physical_consequence_id:consequence,current_c10:'C1234567890',state:'draft',
    active_submitted:false,return_reason:'defective_unit',promised_bom_code:'BOM-SAMPLE',
    current_unit_bom_code:'BOM-SAMPLE',revision:1,
    device_part_unit_id:null,spare_part_unit_id:null}],
  submission_history:[],lineage:[],
};
const digest=value=>createHash('sha256').update(JSON.stringify(Object.fromEntries(
  Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)))).digest('hex');
const cursor=(id,archived=null)=>({
  version:1,query_id:'FaultTagListQuery',sort_registry_id:'INVENTORY_FAULT_TAG_ID_ASC_V1',
  last_key_tuple:[id],filter_fingerprint:digest({
    schema:'SOMA_FAULT_TAG_LIST_FILTER_V1',state:null,archived,
  }),null_order:'not_applicable',
});
async function base(page){
  await page.route('**/api/v1/inventory/stock?*',route=>route.fulfill({json:{
    items:[],continuation:null,exact_total:0,
  }}));
  await page.route('**/api/v1/inventory/attention?*',route=>{
    const asOf=Number(new URL(route.request().url()).searchParams.get('as_of_utc'));
    return route.fulfill({json:{items:[],continuation:null,exact_total:0,as_of_utc:asOf}});
  });
}
async function openDesk(page){
  await page.goto('http://127.0.0.1:4174/inventory');
  const desk=page.getByRole('region',{name:'Fault Tags Desk'});
  await desk.getByRole('button',{name:'Inspect Fault Tags'}).click();
  return desk.getByRole('region',{name:'Accepted Fault Tags'});
}
test('Fault Tag read-only list and member evidence require explicit opening and selection',async({page})=>{
  await base(page);const seen=[];
  await page.route('**/api/v1/inventory/fault-tags?*',route=>{
    seen.push('list');return route.fulfill({json:{items:[listRow(tagA)],continuation:null,exact_total:1}});
  });
  await page.route('**/api/v1/inventory/fault-tags/'+tagA,route=>{
    seen.push('detail');return route.fulfill({json:detail});
  });
  await page.goto('http://127.0.0.1:4174/inventory');
  const desk=page.getByRole('region',{name:'Fault Tags Desk'});
  await expect(desk.getByRole('button',{name:'Inspect Fault Tags'})).toBeVisible();
  expect(seen).toHaveLength(0);
  await desk.getByRole('button',{name:'Inspect Fault Tags'}).click();
  const register=desk.getByRole('region',{name:'Accepted Fault Tags'});
  await expect(register.getByRole('button',{name:'Inspect Fault Tag '+tagA})).toBeVisible();
  expect(seen).toEqual(['list']);
  await register.getByRole('button',{name:'Inspect Fault Tag '+tagA}).click();
  const chosen=register.getByRole('complementary',{name:'Selected Fault Tag'});
  await expect(chosen.getByRole('region',{name:'Fault Tag memberships'})).toContainText('C1234567890');
  await expect(chosen).toContainText('Submission is not warehouse receipt');
  expect(seen).toEqual(['list','detail']);
  for(const action of ['Submit Fault Tag','Record warehouse receipt','Accept warehouse decision']){
    await expect(page.getByRole('button',{name:action})).toHaveCount(0);
  }
});
test('Fault Tag cursor binds all/archive filter and clears selection on page transitions',async({page})=>{
  await base(page);const urls=[];
  await page.route('**/api/v1/inventory/fault-tags?*',route=>{
    const u=new URL(route.request().url());urls.push(u);
    return route.fulfill({json:u.searchParams.get('archived')==='true'?
      {items:[listRow(tagB,true)],continuation:null,exact_total:1}:
      u.searchParams.has('cursor')?
      {items:[listRow(tagB)],continuation:null,exact_total:26}:
      {items:[listRow(tagA)],continuation:cursor(tagA),exact_total:26}});
  });
  await page.route('**/api/v1/inventory/fault-tags/'+tagA,route=>route.fulfill({json:detail}));
  const register=await openDesk(page);
  await register.getByRole('button',{name:'Inspect Fault Tag '+tagA}).click();
  await expect(register.getByRole('complementary',{name:'Selected Fault Tag'})).toBeVisible();
  await register.getByRole('button',{name:'Next page'}).click();
  await expect(register.getByRole('button',{name:'Inspect Fault Tag '+tagB})).toBeVisible();
  await expect(register.getByRole('complementary',{name:'Selected Fault Tag'})).toHaveCount(0);
  expect(JSON.parse(urls[1].searchParams.get('cursor'))).toEqual(cursor(tagA));
  await register.getByRole('combobox',{name:'Archive status'}).selectOption('archived');
  await expect(register.getByRole('button',{name:'Inspect Fault Tag '+tagB})).toBeVisible();
  expect(urls.at(-1).searchParams.get('archived')).toBe('true');
  expect(urls.at(-1).searchParams.has('cursor')).toBe(false);
});
test('Fault Tag list refuses wrong fingerprint without rendering untrusted row',async({page})=>{
  await base(page);
  await page.route('**/api/v1/inventory/fault-tags?*',route=>route.fulfill({json:{
    items:[{...listRow(tagA),tracking_handle:'UNTRUSTED-FAULT'}],exact_total:26,
    continuation:{...cursor(tagA),filter_fingerprint:'f'.repeat(64)},
  }}));
  const register=await openDesk(page);
  await expect(register.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(register.getByText('UNTRUSTED-FAULT')).toHaveCount(0);
});
test('Fault Tag list-to-detail revision drift rejects untrusted member information',async({page})=>{
  await base(page);
  await page.route('**/api/v1/inventory/fault-tags?*',route=>route.fulfill({json:{
    items:[listRow(tagA)],exact_total:1,continuation:null,
  }}));
  await page.route('**/api/v1/inventory/fault-tags/'+tagA,route=>route.fulfill({json:{
    ...detail,revision:2,
    members:[{...detail.members[0],current_c10:'UNTRUSTED-C10'}],
  }}));
  const register=await openDesk(page);
  await register.getByRole('button',{name:'Inspect Fault Tag '+tagA}).click();
  const chosen=register.getByRole('complementary',{name:'Selected Fault Tag'});
  await expect(chosen.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(chosen).not.toContainText('UNTRUSTED-C10');
});
