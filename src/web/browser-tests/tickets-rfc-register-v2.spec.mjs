import {test,expect} from '@playwright/test';

const data=[
  {rfc_id:'33333333-3333-4333-8333-333333333333',rfc_no:'NC20261010000001',
    revision:1,updated_at_utc:1770000100,local_archive_state:'active',
    hierarchy_role:'standalone',subordinate_count:0,direct_service_request_count:1,
    customer_org_id:null,source_summary:'Owner-proven RFC summary',
    source_summary_truncated:false,source_status:'Open',source_status_truncated:false,
    source_status_class:'pre_implement'},
  {rfc_id:'44444444-4444-4444-8444-444444444444',rfc_no:'NC20261010000002',
    revision:2,updated_at_utc:1770000000,local_archive_state:'archived',
    hierarchy_role:'root',subordinate_count:2,direct_service_request_count:0,
    customer_org_id:null,source_summary:null,source_summary_truncated:false,
    source_status:null,source_status_truncated:false,source_status_class:'unknown'},
];

test('RFC owner register is selected-only, paged and opens real RFC workbench',async({page})=>{
  await page.route('**/api/v1/tickets/rfcs?*',route=>{
    const url=new URL(route.request().url());
    const cursor=url.searchParams.get('cursor');
    const items=cursor?[data[1]]:[data[0]];
    return route.fulfill({json:{
      items,total_count_at_read:2,sort_registry_id:'RFC_UPDATED_ID_DESC_V1',
      continuation:cursor?null:{version:1,sort_registry_id:'RFC_UPDATED_ID_DESC_V1',
        updated_at_utc:data[0].updated_at_utc,rfc_id:data[0].rfc_id},
    }});
  });
  await page.goto('http://127.0.0.1:4174/tickets/rfcs');
  const register=page.getByRole('region',{name:'RFC register'});
  await expect(register.getByText('Owner-proven RFC summary')).toBeVisible();
  await expect(register.getByText('DETAILS / NC20261010000001')).toHaveCount(0);
  await expect(register.getByText(/Select an RFC to inspect/)).toBeVisible();
  await register.getByRole('button',{name:'NC20261010000001'}).click();
  await expect(register.getByText('DETAILS / NC20261010000001')).toBeVisible();
  await register.getByRole('button',{name:'Next page'}).click();
  await expect(register.getByRole('button',{name:'NC20261010000002'})).toBeVisible();
  await expect(register.getByText('DETAILS / NC20261010000001')).toHaveCount(0);
  await register.getByRole('button',{name:'NC20261010000002'}).click();
  await expect(register.getByText('DETAILS / NC20261010000002')).toBeVisible();
  await register.getByRole('button',{name:'Open RFC workbench'}).click();
  await expect(page).toHaveURL(new RegExp('/tickets/rfc/'+data[1].rfc_id+'$'));
});

test('RFC list is explicitly available in the Tickets contextual navigation',async({page})=>{
  await page.goto('http://127.0.0.1:4174/tickets');
  await page.getByRole('link',{name:'RFCs',exact:true}).click();
  await expect(page).toHaveURL(/\/tickets\/rfcs$/);
  await expect(page.getByRole('region',{name:'RFC register'})).toBeVisible();
});
