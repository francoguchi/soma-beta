import {test,expect} from '@playwright/test';
const sr='11111111-1111-4111-8111-111111111111';

test('Opening a workbench reads active evidence; visited tabs keep their accepted query state',async({page})=>{
  const paths=[];
  await page.route('**/api/v1/**',route=>{
    const url=new URL(route.request().url());paths.push(url.pathname);
    if(url.pathname==='/api/v1/tickets/service-requests/'+sr)return route.fulfill({json:{
      service_request_id:sr,identity:{official_sr_no:'C0000001',local_sr_no:null},revision:1,
      linked_root_rfc_count:0,device_reference_count:0,warnings:[],
    }});
    if(url.pathname.endsWith('/devices'))return route.fulfill({json:{items:[],continuation:null}});
    if(url.pathname.endsWith('/notes'))return route.fulfill({json:{items:[],continuation:null}});
    return route.fulfill({status:503,json:{code:'OWNER_UNAVAILABLE'}});
  });
  await page.goto('http://127.0.0.1:4174/tickets/sr/'+sr);
  await expect(page.getByRole('heading',{name:'Service Request C0000001'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Canonical communication evidence'})).toContainText('Communication evidence is unavailable');
  expect(paths.filter(path=>path.startsWith('/api/v1/tickets/'))).toEqual(['/api/v1/tickets/service-requests/'+sr]);
  await page.getByRole('tab',{name:'Devices',exact:true}).click();
  await expect(page.getByRole('region',{name:'SR Device References'})).toContainText('No directly linked active Device References');
  await page.getByRole('tab',{name:'Notes',exact:true}).click();
  await expect(page.getByRole('tabpanel',{name:'Notes',exact:true})).toContainText('No active notes in this page.');
  await page.getByRole('tab',{name:'Overview',exact:true}).click();
  await page.getByRole('tab',{name:'Devices',exact:true}).click();
  await expect(page.getByRole('region',{name:'SR Device References'})).toContainText('No directly linked active Device References');
  expect(paths.filter(path=>path.endsWith('/devices'))).toHaveLength(1);
  expect(paths.filter(path=>path.endsWith('/notes'))).toHaveLength(1);
});
