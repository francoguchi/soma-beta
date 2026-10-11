import {test,expect} from '@playwright/test';
const rack='11111111-1111-4111-8111-111111111111';
const ne='22222222-2222-4222-8222-222222222222';
const ne2='33333333-3333-4333-8333-333333333333';
const site='44444444-4444-4444-8444-444444444444';
const rackRow={kind:'rack',id:rack,label:'RACK OMEGA',parent_context_id:site,lifecycle:'active',warning_codes:[]};
const neRow={kind:'network_element',id:ne,label:'NE ALPHA',parent_context_id:rack,lifecycle:'active',warning_codes:[]};
const occupancy=(name='Router Alpha')=>({
  rack_id:rack,height_u:12,row_label:'A',column_label:'03',corrupt_overlap_detected:false,
  occupants:[
    {network_element_id:ne,operational_name:name,u_start:1,u_span:3},
    {network_element_id:ne2,operational_name:'Switch Beta',u_start:7,u_span:2},
  ],
  free_ranges:[{u_start:4,u_span:3},{u_start:9,u_span:4}],
});
const element={
  network_element_id:ne,operational_name:'NE ALPHA',revision:2,lifecycle:'active',
  site:{kind:'site',id:site},customer_org_id:site,
  placement:{rack_id:rack,u_start:1,u_span:3,revision:2,explicit_unracked:false},
  model:null,cloud_deployment:null,primary_ip:null,ip_count:0,containment_parent:null,
  containment_child_count:0,device_reference_count:0,installed_component_count:0,warning_codes:[],
};
async function mock(page,owner=occupancy(),counter={rack:0,ne:0}){
  await page.route('**/api/v1/infrastructure/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/v1/infrastructure/tree')return route.fulfill({json:{nodes:[rackRow,neRow],next_cursor:null}});
    if(path==='/api/v1/infrastructure/racks/'+rack+'/occupancy'){
      counter.rack++;return route.fulfill({json:owner});
    }
    if(path==='/api/v1/infrastructure/network-elements/'+ne){
      counter.ne++;return route.fulfill({json:element});
    }
    return route.fulfill({status:404,json:{error:'Unexpected LLD-08 query'}});
  });
}
test('Rack occupancy reads exact owner only after explicit selection and renders proven occupied/free U ranges',async({page})=>{
  const count={rack:0,ne:0};const writes=[];
  await mock(page,occupancy(),count);
  page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url());});
  await page.goto('http://127.0.0.1:4174/infrastructure');
  const row=page.getByRole('listitem').filter({hasText:'RACK OMEGA'});
  await row.click();
  await expect(page.getByRole('region',{name:'Opened Rack'})).toHaveCount(0);
  expect(count).toEqual({rack:0,ne:0});
  await row.press('Enter');
  const panel=page.getByRole('region',{name:'Opened Rack'});
  await expect(panel.getByRole('heading',{name:'Rack occupancy'})).toBeVisible();
  await expect(panel).toContainText('Height: 12 U');
  await expect(panel).toContainText('Row label: A');
  await expect(panel.getByRole('table',{name:'Rack occupied U ranges'})).toContainText('U1–U3');
  await expect(panel.getByRole('table',{name:'Rack occupied U ranges'})).toContainText('U7–U8');
  await expect(panel.getByRole('table',{name:'Rack occupied U ranges'})).toContainText('Router Alpha');
  await expect(panel).toContainText('U4–U6');
  await expect(panel).toContainText('U9–U12');
  expect(count).toEqual({rack:1,ne:0});
  expect(writes).toEqual([]);
});
test('The Rack owner corruption flag never renders untrusted placement or free slots',async({page})=>{
  const bad={...occupancy(),corrupt_overlap_detected:true,
    occupants:[{network_element_id:ne,operational_name:'CORRUPT ROUTER',u_start:1,u_span:4},
      {network_element_id:ne2,operational_name:'CORRUPT SWITCH',u_start:3,u_span:2}]};
  await mock(page,bad);
  await page.goto('http://127.0.0.1:4174/infrastructure');
  await page.getByRole('listitem').filter({hasText:'RACK OMEGA'}).press('Enter');
  const panel=page.getByRole('region',{name:'Opened Rack'});
  await expect(panel.getByRole('alert')).toContainText('corrupt or overlapping placement evidence');
  await expect(panel).not.toContainText('CORRUPT ROUTER');
  await expect(panel).not.toContainText('U9–U12');
  await expect(panel.getByRole('table',{name:'Rack occupied U ranges'})).toHaveCount(0);
});
test('Unreported rack overlaps, inconsistent free ranges and foreign rack identities fail closed',async({page})=>{
  for(const owner of [
    {...occupancy(),occupants:[
      {network_element_id:ne,operational_name:'NOT TRUSTED',u_start:1,u_span:4},
      {network_element_id:ne2,operational_name:'NOT TRUSTED',u_start:3,u_span:2}]},
    {...occupancy(),free_ranges:[{u_start:4,u_span:4},{u_start:9,u_span:4}]},
    {...occupancy(),rack_id:site},
  ]){
    await page.unrouteAll({behavior:'wait'});await mock(page,owner);
    await page.goto('http://127.0.0.1:4174/infrastructure');
    await page.getByRole('listitem').filter({hasText:'RACK OMEGA'}).press('Enter');
    const panel=page.getByRole('region',{name:'Opened Rack'});
    await expect(panel.getByRole('alert')).toContainText('owner projection could not be rendered');
    await expect(panel).not.toContainText('NOT TRUSTED');
    await expect(panel.getByRole('table',{name:'Rack occupied U ranges'})).toHaveCount(0);
  }
});
test('Rack Back restores identity and re-reads owner; changing to Network Element keeps owner calls distinct',async({page})=>{
  let updated=false;const reads={rack:0,ne:0};
  await mock(page,occupancy(),reads);
  await page.route('**/api/v1/infrastructure/racks/'+rack+'/occupancy',route=>{
    reads.rack++;
    return route.fulfill({json:occupancy(updated?'Router After Refresh':'Router Before Refresh')});
  });
  await page.route('**/api/v1/objectives?*',route=>{
    const asOf=Number(new URL(route.request().url()).searchParams.get('as_of_utc'));
    return route.fulfill({json:{items:[],continuation:null,exact_total:0,as_of_utc:asOf}});
  });
  await page.goto('http://127.0.0.1:4174/infrastructure');
  await page.getByRole('listitem').filter({hasText:'RACK OMEGA'}).press('Enter');
  await expect(page.getByRole('region',{name:'Opened Rack'})).toContainText('Router Before Refresh');
  await page.getByRole('link',{name:'Objectives',exact:true}).click();
  updated=true;
  await page.goBack();
  await expect(page.getByRole('region',{name:'Opened Rack'})).toContainText('Router After Refresh');
  expect(reads.rack).toBeGreaterThanOrEqual(2);
  await page.getByRole('listitem').filter({hasText:'NE ALPHA'}).press('Enter');
  await expect(page.getByRole('region',{name:'Opened Network Element'})).toContainText('NE ALPHA');
  await expect(page.getByRole('region',{name:'Opened Rack'})).toHaveCount(0);
  expect(reads.ne).toBe(1);
});
