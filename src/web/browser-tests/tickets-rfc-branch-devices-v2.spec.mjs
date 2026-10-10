import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
const root='33333333-3333-4333-8333-333333333333';
const child='44444444-4444-4444-8444-444444444444';
const devA='55555555-5555-4555-8555-555555555555';
const devB='66666666-6666-4666-8666-666666666666';
const rootRow={rfc_id:root,rfc_no:'NC20261010000001',revision:3,hierarchy_role:'root',
  local_archive_state:'active',subordinate_count:1,direct_service_request_count:0,warnings:[]};
const childRow={rfc_id:child,rfc_no:'NC20261010000002',revision:2,hierarchy_role:'subordinate',
  local_archive_state:'active',subordinate_count:0,direct_service_request_count:0,warnings:[]};
const row=(owner,role,id,name)=>({owning_rfc_id:owner,role,device_reference_id:id,
  operational_name:name,revision:1,registered_network_element_id:null});
const cursor=(owner,device)=>({version:1,query_id:'GetRfcDeviceContextForBranch',
  sort_registry_id:'RFC_BRANCH_DEVICE_REFERENCE_ORDER_V1',last_key_tuple:[owner,device],
  filter_fingerprint:createHash('sha256').update(JSON.stringify({
    root_rfc_id:root,schema:'SOMA_RFC_BRANCH_DEVICE_REFERENCE_FILTER_V1',
  })).digest('hex'),null_order:'not_applicable'});

test('Root RFC branch keeps direct device owning member and cursor evidence',async({page})=>{
  const reads=[];
  await page.route('**/api/v1/tickets/rfcs/'+root,route=>route.fulfill({json:rootRow}));
  await page.route('**/api/v1/tickets/rfcs/'+root+'/branch?*',route=>route.fulfill({json:{
    root:rootRow,subordinates:[childRow],continuation:null,branch_fingerprint:'a'.repeat(64),
  }}));
  await page.route('**/api/v1/tickets/rfcs/'+root+'/branch-devices?*',route=>{
    const url=new URL(route.request().url());reads.push(url);
    return route.fulfill({json:url.searchParams.has('cursor')
      ?{items:[row(child,'subordinate',devB,'child-router')],continuation:null}
      :{items:[row(root,'root',devA,'root-router')],continuation:cursor(root,devA)}});
  });
  await page.goto('http://127.0.0.1:4174/tickets/rfc/'+root);
  await page.getByRole('tab',{name:'Related RFCs'}).click();
  const panel=page.getByRole('region',{name:'RFC branch Device References'});
  await expect(panel.getByRole('button',{name:'root-router'})).toBeVisible();
  await panel.getByRole('button',{name:'root-router'}).click();
  const details=panel.getByRole('complementary',{name:'Selected branch Device Reference'});
  await expect(details.getByText(root)).toBeVisible();
  await expect(details.getByText('root',{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Next page'}).click();
  await expect(panel.getByRole('button',{name:'child-router'})).toBeVisible();
  await expect(details).toHaveCount(0);
  await panel.getByRole('button',{name:'child-router'}).click();
  await expect(details.getByText(child)).toBeVisible();
  expect(JSON.parse(reads[1].searchParams.get('cursor'))).toEqual(cursor(root,devA));
  await panel.getByRole('button',{name:'Previous page'}).click();
  await expect(panel.getByRole('button',{name:'root-router'})).toBeVisible();
});

test('Subordinate RFC does not invent governing root and does not call branch-devices',async({page})=>{
  const reads=[];
  await page.route('**/api/v1/tickets/rfcs/'+child,route=>route.fulfill({json:childRow}));
  await page.route('**/api/v1/tickets/rfcs/*/branch-devices?*',route=>{
    reads.push(route.request().url());return route.abort();
  });
  await page.goto('http://127.0.0.1:4174/tickets/rfc/'+child);
  await page.getByRole('tab',{name:'Related RFCs'}).click();
  await expect(page.getByText(/governing root cannot be inferred/)).toBeVisible();
  await expect(page.getByRole('region',{name:'RFC branch Device References'})).toHaveCount(0);
  expect(reads).toHaveLength(0);
});

test('Branch device source rows reject wrong owner roles without displaying them',async({page})=>{
  await page.route('**/api/v1/tickets/rfcs/'+root,route=>route.fulfill({json:rootRow}));
  await page.route('**/api/v1/tickets/rfcs/'+root+'/branch?*',route=>route.fulfill({json:{
    root:rootRow,subordinates:[],continuation:null,branch_fingerprint:'a'.repeat(64),
  }}));
  await page.route('**/api/v1/tickets/rfcs/'+root+'/branch-devices?*',route=>route.fulfill({json:{
    items:[row(child,'root',devA,'invalid-assignment')],continuation:null,
  }}));
  await page.goto('http://127.0.0.1:4174/tickets/rfc/'+root);
  await page.getByRole('tab',{name:'Related RFCs'}).click();
  const panel=page.getByRole('region',{name:'RFC branch Device References'});
  await expect(panel.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(panel.getByText('invalid-assignment')).toHaveCount(0);
});
