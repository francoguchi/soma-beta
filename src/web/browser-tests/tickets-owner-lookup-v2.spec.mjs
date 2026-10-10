import {test,expect} from '@playwright/test';

const serviceRequestId='33333333-3333-4333-8333-333333333333';
test('Tickets exact identity lookup displays only an accepted owner SR and opens its real route',async({page})=>{
  const queried=[];
  await page.route('**/api/v1/tickets/service-requests/by-business-id/*',route=>{
    const url=new URL(route.request().url());
    queried.push(url.pathname);
    return route.fulfill({json:{
      service_request_id:serviceRequestId,identity:{official_sr_no:'39345597',local_sr_no:null},
      revision:2,source_projection:{fields:{
        problem_summary:{value_state:'usable',value:'Owner-accepted incident summary'},
        status:{value_state:'usable',value:'Open'}}},
      reference_context:{customer:null},linked_root_rfc_count:0,
      device_reference_count:0,warnings:[],
    }});
  });
  await page.goto('http://127.0.0.1:4174/tickets');
  const find=page.getByRole('button',{name:'Find exact SR'});
  await expect(find).toBeDisabled();
  await page.getByLabel('Official SR (8 digits) or local SR (LSR-########)').fill('3934559');
  await expect(find).toBeDisabled();
  await page.getByLabel('Official SR (8 digits) or local SR (LSR-########)').fill('39345597');
  await expect(find).toBeEnabled();
  await find.click();
  await expect(page.getByText('Owner-accepted incident summary')).toBeVisible();
  await expect(page.getByText('EXACT MATCH · OWNER-ACCEPTED RECORD')).toBeVisible();
  expect(queried).toEqual(['/api/v1/tickets/service-requests/by-business-id/39345597']);
  await page.getByRole('button',{name:'Open Service Request'}).click();
  await expect(page).toHaveURL(new RegExp('/tickets/sr/'+serviceRequestId+'$'));
});

test('Tickets empty lookup does not pretend to be a complete collection',async({page})=>{
  await page.goto('http://127.0.0.1:4174/tickets');
  await expect(page.getByRole('region',{name:'Service Request register'})).toBeVisible();
  await expect(page.getByText(/This register lists all current SR identities/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Find exact SR'})).toBeDisabled();
  await expect(page.getByText('EXACT MATCH · OWNER-ACCEPTED RECORD')).toHaveCount(0);
});
