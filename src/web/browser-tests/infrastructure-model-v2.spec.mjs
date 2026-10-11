import {test,expect} from '@playwright/test';
const ne='11111111-1111-4111-8111-111111111111', site='22222222-2222-4222-8222-222222222222';
const model='33333333-3333-4333-8333-333333333333', other='44444444-4444-4444-8444-444444444444';
const details={network_element_id:ne,operational_name:'Linked NE',revision:2,lifecycle:'active',
  site:{kind:'site',id:site},customer_org_id:site,model:{kind:'model',id:model},
  placement:{rack_id:null,u_start:null,u_span:null,revision:1,explicit_unracked:true},
  cloud_deployment:null,primary_ip:null,ip_count:0,containment_parent:null,
  containment_child_count:0,device_reference_count:0,installed_component_count:0,warning_codes:[]};
const accepted=(name='Model M')=>({model_id:model,revision:5,name,manufacturer:'Vendor M',
  lifecycle:'active',compatibility_count:3,assigned_network_element_count:7});
async function fixtures(page,read,modelPayload=accepted()){
  await page.route('**/api/v1/infrastructure/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/api/v1/infrastructure/tree')return route.fulfill({json:{
      nodes:[{kind:'network_element',id:ne,label:'Linked NE',parent_context_id:site,
        lifecycle:'active',warning_codes:[]}],next_cursor:null}});
    if(pathname==='/api/v1/infrastructure/network-elements/'+ne){
      read.ne++;return route.fulfill({json:details});
    }
    if(pathname==='/api/v1/infrastructure/models/'+model){
      read.model++;return route.fulfill({json:modelPayload});
    }
    return route.fulfill({status:404,json:{error:'Unexpected query'}});
  });
}
async function open(page){
  await page.goto('http://127.0.0.1:4174/infrastructure');
  await page.getByRole('listitem').filter({hasText:'Linked NE'}).press('Enter');
  return page.getByRole('region',{name:'Opened Network Element'});
}
test('Model detail is a separate, lazy read beneath an accepted Network Element',async({page})=>{
  const reads={ne:0,model:0};await fixtures(page,reads);
  const nePanel=await open(page);
  await expect(nePanel.getByRole('button',{name:'Inspect linked Model'})).toBeVisible();
  expect(reads).toEqual({ne:1,model:0});
  await nePanel.getByRole('button',{name:'Inspect linked Model'}).click();
  const modelPanel=nePanel.getByRole('region',{name:'Linked Model evidence'});
  await expect(modelPanel).toContainText('Vendor M');
  await expect(modelPanel).toContainText('Compatible Model/BOM relationships');
  await expect(modelPanel).toContainText('Network Elements assigned to this Model');
  expect(reads).toEqual({ne:1,model:1});
  await expect(modelPanel.getByRole('button',{name:/Apply|Assign|Delete/u})).toHaveCount(0);
});
test('Model owner with foreign identity or invalid counts fails closed',async({page})=>{
  const reads={ne:0,model:0};
  await fixtures(page,reads,{...accepted('UNTRUSTED MODEL'),model_id:other,compatibility_count:-1});
  const nePanel=await open(page);
  await nePanel.getByRole('button',{name:'Inspect linked Model'}).click();
  const selected=nePanel.getByRole('region',{name:'Linked Model evidence'});
  await expect(selected.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(selected).not.toContainText('UNTRUSTED MODEL');
});
test('Network Element without a Model never requests model detail',async({page})=>{
  const reads={ne:0,model:0};
  await fixtures(page,reads);
  await page.route('**/api/v1/infrastructure/network-elements/'+ne,route=>{
    reads.ne++;return route.fulfill({json:{...details,model:null}});
  });
  const nePanel=await open(page);
  await expect(nePanel).toContainText('Model identity: Unassigned');
  await expect(nePanel.getByRole('button',{name:'Inspect linked Model'})).toHaveCount(0);
  expect(reads.model).toBe(0);
});
