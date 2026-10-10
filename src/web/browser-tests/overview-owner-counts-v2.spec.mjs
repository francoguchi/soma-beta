import {test,expect} from '@playwright/test';

test('Overview shows only independent owner totals and never invents operational lifecycle',async({page})=>{
  let sr=0,rfc=0;
  await page.route('**/api/v1/tickets/service-requests?limit=1',route=>{
    sr++;
    return route.fulfill({json:{items:[{service_request_id:'33333333-3333-4333-8333-333333333333'}],
      total_count_at_read:128,sort_registry_id:'SR_UPDATED_ID_DESC_V1',continuation:null}});
  });
  await page.route('**/api/v1/tickets/rfcs?limit=1',route=>{
    rfc++;
    return route.fulfill({json:{items:[],total_count_at_read:17,
      sort_registry_id:'RFC_UPDATED_ID_DESC_V1',continuation:null}});
  });
  await page.goto('http://127.0.0.1:4174/overview');
  const overview=page.getByRole('region',{name:'Operations overview'});
  await expect(overview.getByRole('region',{name:'Service Requests register total'}).getByText('128')).toBeVisible();
  await expect(overview.getByRole('region',{name:'RFCs register total'}).getByText('17')).toBeVisible();
  await expect(overview.getByText(/separate owner reads, not a synchronized report/)).toBeVisible();
  await expect(overview.getByText(/operational timeline are not yet composed/)).toBeVisible();
  expect(sr).toBe(1);expect(rfc).toBe(1);
  await overview.getByRole('button',{name:'Open RFCs'}).click();
  await expect(page).toHaveURL(/\/tickets\/rfcs$/);
});

test('Overview refuses malformed owner totals instead of presenting fabricated counts',async({page})=>{
  await page.route('**/api/v1/tickets/service-requests?limit=1',route=>route.fulfill({json:{
    items:[],total_count_at_read:-8,sort_registry_id:'SR_UPDATED_ID_DESC_V1',continuation:null,
  }}));
  await page.route('**/api/v1/tickets/rfcs?limit=1',route=>route.fulfill({json:{
    items:[],total_count_at_read:0,sort_registry_id:'RFC_UPDATED_ID_DESC_V1',continuation:null,
  }}));
  await page.goto('http://127.0.0.1:4174/overview');
  const requests=page.getByRole('region',{name:'Service Requests register total'});
  await expect(requests.getByRole('alert')).toContainText('could not be rendered');
  await expect(requests.getByText('-8')).toHaveCount(0);
});
