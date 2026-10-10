import {test,expect} from '@playwright/test';

const identities=[
  {service_request_id:'33333333-3333-4333-8333-333333333333',
    official_sr_no:'48576001',local_sr_no:null,revision:1,
    updated_at_utc:1770000100,summary:'Accepted source summary A',status:'Open',summary_truncated:false,status_truncated:false},
  {service_request_id:'44444444-4444-4444-8444-444444444444',
    official_sr_no:'48576002',local_sr_no:null,revision:2,
    updated_at_utc:1770000000,summary:'Accepted source summary B',status:'Suspended',summary_truncated:false,status_truncated:false},
  {service_request_id:'55555555-5555-4555-8555-555555555555',
    official_sr_no:'48576003',local_sr_no:null,revision:3,
    updated_at_utc:1769999990,summary:null,status:null,summary_truncated:false,status_truncated:false},
];

test('SR register shows paged owner identities and selected detail, without invented lifecycle',async({page})=>{
  let calls=0;
  await page.route('**/api/v1/tickets/service-requests?*',route=>{
    const url=new URL(route.request().url());
    const c=url.searchParams.get('cursor');
    const cursor=c?JSON.parse(c):null;
    const start=cursor?identities.findIndex(x=>x.service_request_id===cursor.service_request_id)+1:0;
    const items=identities.slice(start,start+2);
    const hasMore=start+items.length<identities.length;
    calls++;
    return route.fulfill({json:{
      items,total_count_at_read:3,sort_registry_id:'SR_UPDATED_ID_DESC_V1',
      continuation:hasMore?{version:1,sort_registry_id:'SR_UPDATED_ID_DESC_V1',
        updated_at_utc:items.at(-1).updated_at_utc,service_request_id:items.at(-1).service_request_id}:null,
    }});
  });
  await page.goto('http://127.0.0.1:4174/tickets');
  const register=page.getByRole('region',{name:'Service Request register'});
  await expect(register.getByText('Accepted source summary A')).toBeVisible();
  await expect(register.getByText('3 Service Request(s) at read')).toBeVisible();
  await expect(register.getByText('DETAILS / 48576001')).toHaveCount(0);
  await expect(register.getByText(/Select a Service Request to inspect/)).toBeVisible();
  await register.getByRole('button',{name:'48576001'}).click();
  await expect(register.getByText('DETAILS / 48576001')).toBeVisible();
  await register.getByRole('button',{name:'48576002'}).click();
  await expect(register.getByText('DETAILS / 48576002')).toBeVisible();
  await register.getByRole('button',{name:'Next page'}).click();
  await expect(register.getByRole('button',{name:'48576003'})).toBeVisible();
  await expect(register.getByText('Not reported').first()).toBeVisible();
  await expect(register.getByRole('button',{name:'Next page'})).toBeDisabled();
  await register.getByRole('button',{name:'Previous page'}).click();
  await expect(register.getByText('DETAILS / 48576001')).toHaveCount(0);
  await expect(register.getByText(/Select a Service Request to inspect/)).toBeVisible();
  await register.getByRole('button',{name:'48576001'}).click();
  await expect(register.getByText('DETAILS / 48576001')).toBeVisible();
  await register.getByRole('button',{name:'Refresh from latest'}).click();
  await expect(register.getByText('DETAILS / 48576001')).toHaveCount(0);
  await expect(register.getByText(/Select a Service Request to inspect/)).toBeVisible();
  expect(calls).toBeGreaterThanOrEqual(2);
});
