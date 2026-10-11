import {test,expect} from '@playwright/test';

const site='11111111-1111-4111-8111-111111111111';
const ne='22222222-2222-4222-8222-222222222222';
const customer='33333333-3333-4333-8333-333333333333';
const dispatch='44444444-4444-4444-8444-444444444444';
const siteRow={kind:'site',id:site,label:'Recorded Site',parent_context_id:null,lifecycle:'active',warning_codes:[]};
const neRow={kind:'network_element',id:ne,label:'Observed NE',parent_context_id:site,lifecycle:'active',warning_codes:[]};
const siteDetail=(name='Recorded Site')=>({
  site_id:site,revision:3,customer_org_id:customer,name,address_text:'Warehouse District',
  lifecycle:'active',dispatch_location_id:dispatch,room_count:4,rack_count:15,
  network_element_count:7,cloud_deployment_count:2,archive_blocker_count:1,duplicate_candidate_count:0,
});
const neDetail={
  network_element_id:ne,revision:1,lifecycle:'active',operational_name:'Observed NE',
  site:{kind:'site',id:site},customer_org_id:customer,
  placement:{rack_id:null,u_start:null,u_span:null,revision:1,explicit_unracked:true},
  model:null,cloud_deployment:null,primary_ip:null,ip_count:0,containment_parent:null,
  containment_child_count:0,device_reference_count:0,installed_component_count:0,warning_codes:[],
};
async function explorer(page,siteResponse=siteDetail(),readCounts={site:0,ne:0}){
  await page.route('**/api/v1/infrastructure/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/v1/infrastructure/tree')return route.fulfill({json:{nodes:[siteRow,neRow],next_cursor:null}});
    if(path==='/api/v1/infrastructure/sites/'+site){
      readCounts.site++;
      return route.fulfill({json:siteResponse});
    }
    if(path==='/api/v1/infrastructure/network-elements/'+ne){
      readCounts.ne++;
      return route.fulfill({json:neDetail});
    }
    return route.fulfill({status:404,json:{error:'Unexpected owner read'}});
  });
}

test('Site identity opens only on explicit operator action and uses exact LLD-08 Site owner',async({page})=>{
  const reads={site:0,ne:0};
  await explorer(page,siteDetail(),reads);
  await page.goto('http://127.0.0.1:4174/infrastructure');
  const row=page.getByRole('listitem').filter({hasText:'Recorded Site'});
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole('region',{name:'Opened Site'})).toHaveCount(0);
  expect(reads).toEqual({site:0,ne:0});
  await row.press('Enter');
  const panel=page.getByRole('region',{name:'Opened Site'});
  await expect(panel.getByRole('heading',{name:'Recorded Site',exact:true})).toBeVisible();
  await expect(panel).toContainText('Warehouse District');
  await expect(panel).toContainText(customer);
  await expect(panel).toContainText(dispatch);
  await expect(panel).toContainText('Possible duplicate-address candidates: 0');
  await expect(panel).toContainText('Archive blockers: 1');
  await expect(panel).toContainText('Cloud Deployments');
  expect(reads).toEqual({site:1,ne:0});
  await expect(panel.getByRole('button',{name:/Archive|Create|Apply/u})).toHaveCount(0);
});

test('An unrelated or malformed Site owner response fails closed without displaying candidate values',async({page})=>{
  await explorer(page,{...siteDetail('UNTRUSTED SITE LABEL'),site_id:customer,room_count:-1});
  await page.goto('http://127.0.0.1:4174/infrastructure');
  await page.getByRole('listitem').filter({hasText:'Recorded Site'}).press('Enter');
  const panel=page.getByRole('region',{name:'Opened Site'});
  await expect(panel.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(panel).not.toContainText('UNTRUSTED SITE LABEL');
  await expect(panel).not.toContainText('Warehouse District');
});

test('Site return restores opened identity and refetches current owner details; switching to NE keeps owners separate',async({page})=>{
  const readCounts={site:0,ne:0};let updated=false;
  await explorer(page,siteDetail(),readCounts);
  await page.route('**/api/v1/infrastructure/sites/'+site,route=>{
    readCounts.site++;
    return route.fulfill({json:siteDetail(updated?'Site renamed by owner':'Recorded Site')});
  });
  await page.route('**/api/v1/objectives?*',route=>{
    const asOf=Number(new URL(route.request().url()).searchParams.get('as_of_utc'));
    return route.fulfill({json:{items:[],continuation:null,exact_total:0,as_of_utc:asOf}});
  });
  await page.goto('http://127.0.0.1:4174/infrastructure');
  await page.getByRole('listitem').filter({hasText:'Recorded Site'}).press('Enter');
  await expect(page.getByRole('region',{name:'Opened Site'})).toContainText('Recorded Site');
  await page.getByRole('link',{name:'Objectives',exact:true}).click();
  updated=true;
  await page.goBack();
  await expect(page.getByRole('region',{name:'Opened Site'})).toContainText('Site renamed by owner');
  expect(readCounts.site).toBeGreaterThanOrEqual(2);
  await page.getByRole('listitem').filter({hasText:'Observed NE'}).press('Enter');
  await expect(page.getByRole('region',{name:'Opened Network Element'})).toContainText('Observed NE');
  await expect(page.getByRole('region',{name:'Opened Site'})).toHaveCount(0);
  expect(readCounts.ne).toBe(1);
});
