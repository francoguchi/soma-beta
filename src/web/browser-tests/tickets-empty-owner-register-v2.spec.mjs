import {test,expect} from '@playwright/test';

test('empty SR and RFC owners show onboarding context without fabricated entries',async({page})=>{
  await page.route('**/api/v1/tickets/service-requests?*',route=>route.fulfill({json:{
    items:[],total_count_at_read:0,sort_registry_id:'SR_UPDATED_ID_DESC_V1',continuation:null,
  }}));
  await page.route('**/api/v1/tickets/rfcs?*',route=>route.fulfill({json:{
    items:[],total_count_at_read:0,sort_registry_id:'RFC_UPDATED_ID_DESC_V1',continuation:null,
  }}));
  await page.goto('http://127.0.0.1:4174/tickets');
  const sr=page.getByRole('region',{name:'Service Request register'});
  await expect(sr.getByRole('status').filter({hasText:'No Service Requests registered'})).toBeVisible();
  await expect(sr.getByText('no demonstration records',{exact:false})).toBeVisible();
  await expect(sr.getByRole('button',{name:'Next page'})).toBeDisabled();
  await expect(sr.getByRole('button',{name:'Previous page'})).toBeDisabled();
  await page.getByRole('link',{name:'RFCs',exact:true}).click();
  const rfcs=page.getByRole('region',{name:'RFC register'});
  await expect(rfcs.getByRole('status').filter({hasText:'No RFC identities registered'})).toBeVisible();
  await expect(rfcs.getByText('nothing is simulated',{exact:false})).toBeVisible();
  await expect(rfcs.getByRole('button',{name:'Next page'})).toBeDisabled();
  await expect(rfcs.getByRole('button',{name:'Previous page'})).toBeDisabled();
  await expect(rfcs.getByRole('button',{name:'Find exact RFC'})).toBeDisabled();
});
