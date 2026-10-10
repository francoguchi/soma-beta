import {test,expect} from '@playwright/test';

const root='33333333-3333-4333-8333-333333333333';
const child='44444444-4444-4444-8444-444444444444';
const sr='55555555-5555-4555-8555-555555555555';
const link='66666666-6666-4666-8666-666666666666';
const rootRow={rfc_id:root,rfc_no:'NC20261010000001',revision:3,hierarchy_role:'root',
  local_archive_state:'active',subordinate_count:1,direct_service_request_count:1,warnings:[]};
const childRow={rfc_id:child,rfc_no:'NC20261010000002',revision:2,hierarchy_role:'subordinate',
  local_archive_state:'active',subordinate_count:0,direct_service_request_count:0,warnings:[]};

test('RFC related tab uses owner root branch and explicit subordinate selection',async({page})=>{
  await page.route('**/api/v1/tickets/rfcs/'+root,route=>route.fulfill({json:rootRow}));
  await page.route('**/api/v1/tickets/rfcs/'+root+'/branch?*',route=>route.fulfill({json:{
    root:rootRow,subordinates:[childRow],continuation:null,branch_fingerprint:'a'.repeat(64),
  }}));
  await page.goto('http://127.0.0.1:4174/tickets/rfc/'+root);
  await page.getByRole('tab',{name:'Related RFCs'}).click();
  const branch=page.getByRole('region',{name:'RFC related branch'});
  await expect(branch.getByText('Governing root: NC20261010000001')).toBeVisible();
  await expect(branch.getByText('SUBORDINATE / NC20261010000002')).toHaveCount(0);
  await branch.getByRole('button',{name:'NC20261010000002'}).click();
  await expect(branch.getByText('SUBORDINATE / NC20261010000002')).toBeVisible();
  await branch.getByRole('button',{name:'Open RFC workbench'}).click();
  await expect(page).toHaveURL(new RegExp('/tickets/rfc/'+child+'$'));
});

test('RFC effective Service Requests tab preserves inherited lineage without inference',async({page})=>{
  await page.route('**/api/v1/tickets/rfcs/'+child+'/effective-srs?*',route=>route.fulfill({json:{
    items:[{sr_rfc_link_id:link,service_request_id:sr,governing_root_rfc_id:root,
      requested_rfc_id:child,inherited_via_root:root}],continuation:null,
  }}));
  await page.goto('http://127.0.0.1:4174/tickets/rfc/'+child);
  await page.getByRole('tab',{name:'Service Requests and Devices'}).click();
  const related=page.getByRole('region',{name:'RFC effective Service Requests'});
  await expect(related.getByText('Via root')).toBeVisible();
  await expect(related.getByText('SR / '+sr)).toHaveCount(0);
  await related.getByRole('button',{name:sr}).click();
  await expect(related.getByText('SR / '+sr)).toBeVisible();
  await related.getByRole('button',{name:'Open SR workbench'}).click();
  await expect(page).toHaveURL(new RegExp('/tickets/sr/'+sr+'$'));
});
