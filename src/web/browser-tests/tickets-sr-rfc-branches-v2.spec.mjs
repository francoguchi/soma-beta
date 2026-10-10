import {test,expect} from '@playwright/test';

const sr='33333333-3333-4333-8333-333333333333';
const root='44444444-4444-4444-8444-444444444444';
const child='55555555-5555-4555-8555-555555555555';
const direct='66666666-6666-4666-8666-666666666666';
const fingerprint='a'.repeat(64);
test('SR RFC tab uses accepted root/subordinate branch and fetches selected RFC identity',async({page})=>{
  const calls=[];
  await page.route('**/api/v1/tickets/service-requests/*/rfcs?*',route=>{
    calls.push(new URL(route.request().url()).pathname);
    return route.fulfill({json:{items:[
      {direct_link_id:direct,root_rfc_id:root,member_rfc_id:root,role:'root'},
      {direct_link_id:direct,root_rfc_id:root,member_rfc_id:child,role:'subordinate'},
    ],continuation:null}});
  });
  await page.route('**/api/v1/tickets/rfcs/'+child,route=>route.fulfill({json:{
    rfc_id:child,rfc_no:'NC20261010000002',revision:3,
    hierarchy_role:'subordinate',local_archive_state:'active',
    subordinate_count:0,direct_service_request_count:0,warnings:[],
  }}));
  await page.goto('http://127.0.0.1:4174/tickets/sr/'+sr);
  await page.getByRole('tab',{name:'RFCs'}).click();
  const relations=page.getByRole('region',{name:'Linked RFCs'});
  await expect(relations.getByText(/governing root/).first()).toBeVisible();
  await expect(relations.getByRole('button',{name:child})).toBeVisible();
  await expect(relations.getByText('RFC / NC20261010000002')).toHaveCount(0);
  await relations.getByRole('button',{name:child}).click();
  await expect(relations.getByText('RFC / NC20261010000002')).toBeVisible();
  await expect(relations.getByText('subordinate').first()).toBeVisible();
  await relations.getByRole('button',{name:'Open RFC workbench'}).click();
  await expect(page).toHaveURL(new RegExp('/tickets/rfc/'+child+'$'));
  expect(calls).toEqual(['/api/v1/tickets/service-requests/'+sr+'/rfcs']);
});
