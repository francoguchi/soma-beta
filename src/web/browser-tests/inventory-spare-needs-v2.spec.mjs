import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';

const need1='11111111-1111-4111-8111-111111111111';
const need2='22222222-2222-4222-8222-222222222222';
const sr='33333333-3333-4333-8333-333333333333';
const need=(id,state='active')=>({
  spare_need_id:id,service_request_id:sr,bom_code:'BOM-SAMPLE',lifecycle_state:state,
  planned_quantity:3,revision:2,contributor_count:1,
  local_allocation_summary:{active_task_allocation_count:0,local_selection_event_count:1,
    local_release_event_count:0,local_superseded_event_count:0},
  request_allocation_summary:{request_count:1,active_draft_request_quantity:2,
    submitted_snapshot_quantity:0},
});
const digest=obj=>createHash('sha256').update(JSON.stringify(Object.fromEntries(
  Object.entries(obj).sort(([a],[b])=>a<b?-1:a>b?1:0)))).digest('hex');
const cursor=(last,state=null)=>({version:1,query_id:'InventoryNeedsQuery',
  sort_registry_id:'INVENTORY_NEEDS_ID_ASC_V1',last_key_tuple:[last],
  filter_fingerprint:digest({schema:'SOMA_INVENTORY_NEEDS_FILTER_V1',service_request_id:null,
    lifecycle_state:state,bom_key:null}),null_order:'not_applicable'});

async function otherOwnerRoutes(page) {
  await page.route('**/api/v1/inventory/stock?*',route=>route.fulfill({json:{items:[],continuation:null,exact_total:0}}));
  await page.route('**/api/v1/inventory/attention?*',route=>{
    const asOf=Number(new URL(route.request().url()).searchParams.get('as_of_utc'));
    return route.fulfill({json:{items:[],continuation:null,exact_total:0,as_of_utc:asOf}});
  });
}
test('Spare Needs remains lazy and selected owner aggregates do not claim fulfillment',async({page})=>{
  const urls=[];await otherOwnerRoutes(page);
  await page.route('**/api/v1/inventory/needs?*',route=>{
    urls.push(route.request().url());return route.fulfill({json:{
      items:[need(need1)],exact_total:1,continuation:null,
    }});
  });
  await page.goto('http://127.0.0.1:4174/inventory');
  const desk=page.getByRole('region',{name:'Spare Needs Desk'});
  await expect(desk.getByRole('button',{name:'Inspect Spare Needs'})).toBeVisible();
  expect(urls).toHaveLength(0);
  await desk.getByRole('button',{name:'Inspect Spare Needs'}).click();
  const needs=desk.getByRole('region',{name:'Accepted Spare Needs'});
  await expect(needs.getByRole('button',{name:'Inspect Spare Need '+need1})).toBeVisible();
  expect(urls).toHaveLength(1);
  await needs.getByRole('button',{name:'Inspect Spare Need '+need1}).click();
  const selected=needs.getByRole('complementary',{name:'Selected Spare Need'});
  await expect(selected).toContainText('Active draft request quantity');
  await expect(selected).toContainText('Submitted snapshot quantity');
  await expect(selected).toContainText('not an accepted delivery');
  await expect(page.getByRole('button',{name:/create|submit|register|accept/i})).toHaveCount(0);
});
test('Spare Needs cursor stays canonical and lifecycle filter clears previous selection',async({page})=>{
  const urls=[];await otherOwnerRoutes(page);
  await page.route('**/api/v1/inventory/needs?*',route=>{
    const u=new URL(route.request().url());urls.push(u);
    return route.fulfill({json:u.searchParams.get('lifecycle_state')==='resolved'
      ?{items:[need(need2,'resolved')],exact_total:1,continuation:null}
      :u.searchParams.has('cursor')
      ?{items:[need(need2)],exact_total:26,continuation:null}
      :{items:[need(need1)],exact_total:26,continuation:cursor(need1)}});
  });
  await page.goto('http://127.0.0.1:4174/inventory');
  await page.getByRole('button',{name:'Inspect Spare Needs'}).click();
  const needs=page.getByRole('region',{name:'Accepted Spare Needs'});
  await needs.getByRole('button',{name:'Inspect Spare Need '+need1}).click();
  await expect(needs.getByRole('complementary',{name:'Selected Spare Need'})).toBeVisible();
  await needs.getByRole('button',{name:'Next page'}).click();
  await expect(needs.getByRole('button',{name:'Inspect Spare Need '+need2})).toBeVisible();
  await expect(needs.getByRole('complementary',{name:'Selected Spare Need'})).toHaveCount(0);
  expect(JSON.parse(urls.at(-1).searchParams.get('cursor'))).toEqual(cursor(need1));
  await needs.getByRole('combobox',{name:'Lifecycle state'}).selectOption('resolved');
  await expect(needs.getByRole('button',{name:'Inspect Spare Need '+need2})).toBeVisible();
  expect(urls.at(-1).searchParams.get('lifecycle_state')).toBe('resolved');
  expect(urls.at(-1).searchParams.has('cursor')).toBe(false);
});
test('Invalid Spare Need owner cursor fails closed and exposes no synthetic row',async({page})=>{
  await otherOwnerRoutes(page);
  await page.route('**/api/v1/inventory/needs?*',route=>route.fulfill({json:{
    items:[{...need(need1),bom_code:'UNTRUSTED-SOURCE'}],exact_total:26,
    continuation:{...cursor(need1),filter_fingerprint:'f'.repeat(64)},
  }}));
  await page.goto('http://127.0.0.1:4174/inventory');
  await page.getByRole('button',{name:'Inspect Spare Needs'}).click();
  const needs=page.getByRole('region',{name:'Accepted Spare Needs'});
  await expect(needs.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(needs.getByText('UNTRUSTED-SOURCE')).toHaveCount(0);
});

test('Spare Need history is separately opened and never confused with planning selection',async({page})=>{
  await otherOwnerRoutes(page);const calls=[];
  await page.route('**/api/v1/inventory/needs?*',route=>route.fulfill({json:{
    items:[need(need1)],exact_total:1,continuation:null,
  }}));
  await page.route('**/api/v1/inventory/history/spare_need/'+need1+'?*',route=>{
    calls.push(route.request().url());
    return route.fulfill({json:{items:[],continuation:null}});
  });
  await page.goto('http://127.0.0.1:4174/inventory');
  await page.getByRole('button',{name:'Inspect Spare Needs'}).click();
  await page.getByRole('button',{name:'Inspect Spare Need '+need1}).click();
  const selected=page.getByRole('complementary',{name:'Selected Spare Need'});
  await expect(selected.getByRole('button',{name:'Inspect Spare Need history'})).toBeVisible();
  expect(calls).toHaveLength(0);
  await selected.getByRole('button',{name:'Inspect Spare Need history'}).click();
  await expect(selected.getByRole('region',{name:'Immutable Inventory history'}))
    .toContainText('No owner history events returned');
  expect(calls).toHaveLength(1);
  expect(new URL(calls[0]).pathname).toBe('/api/v1/inventory/history/spare_need/'+need1);
});
