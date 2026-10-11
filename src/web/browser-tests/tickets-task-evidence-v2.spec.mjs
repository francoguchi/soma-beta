import {test,expect} from '@playwright/test';

// Retain a browser trace only on failure. Startup of the frozen static host
// must be diagnosed separately from a rejected Task attention owner response.
test.use({trace:'retain-on-failure'});
const sr='11111111-1111-4111-8111-111111111111';
const rfc='22222222-2222-4222-8222-222222222222';
const task='33333333-3333-4333-8333-333333333333';
const id='44444444-4444-4444-8444-444444444444';
const link='55555555-5555-4555-8555-555555555555';
const rootRow={task_id:task,kind:'local',display_name:'Evidence Task',creation_origin:'manual',revision:1,
  owning_rfc:null,operational_plan:null,membership:null,execution_state:'not_started',
  review_state:'unreviewed',accepted_outcome:null,operational_count_included:true,warnings:[]};
const detail={task_id:task,kind:'local',display_name:'Evidence Task',revision:1,
  operational_plan:null,objective_membership:null,
  actual_execution:{execution_state:'not_started',actual_start_utc:null,actual_end_utc:null},
  reviewed_outcome:null,relationship_summary:{exact_total:1},attention_summary:{warning_codes:[]}};

test('Selected Task evidence remains lazy, read-only and honors actual SR relationship',async({page})=>{
  let reads=0;
  await page.route('**/api/v1/tasks?*',route=>route.fulfill({json:{
    items:[rootRow],continuation:null,exact_total:1,
  }}));
  await page.route('**/api/v1/tasks/'+task,route=>route.fulfill({json:detail}));
  await page.route('**/api/v1/tasks/'+task+'/relationships?*',route=>{
    reads++;return route.fulfill({json:{items:[{kind:'sr',relationship_id:link,related_id:sr}],
      exact_total:1,continuation:null}});
  });
  await page.route('**/api/v1/tasks/'+task+'/attention?*',route=>{
    reads++;return route.fulfill({json:{items:[],exact_total:0,continuation:null}});
  });
  await page.goto('http://127.0.0.1:4174/tickets/sr/'+sr);
  await page.getByRole('tab',{name:'Tasks'}).click();
  const panel=page.getByRole('region',{name:'Service Request Tasks'});
  await expect(panel.getByRole('button',{name:'Evidence Task'})).toBeVisible();
  expect(reads).toBe(0);
  await panel.getByRole('button',{name:'Evidence Task'}).click();
  const details=panel.getByRole('complementary',{name:'Selected Task details'});
  await expect(details.getByText('Evidence Task')).toBeVisible();
  expect(reads).toBe(0);
  await panel.getByRole('button',{name:'Inspect Task relationships and attention'}).click();
  const relations=panel.getByRole('region',{name:'Active Task relationships'});
  await expect(relations.getByRole('button',{name:'Open linked SR'})).toBeVisible();
  await expect(panel.getByText('No pending Task attention in this page.')).toBeVisible();
  expect(reads).toBe(2);
  await relations.getByRole('button',{name:'Open linked SR'}).click();
  await expect(page).toHaveURL(new RegExp('/tickets/sr/'+sr+'$'));
});

test('Malformed Task attention proof remains unavailable instead of showing untrusted content',async({page})=>{
  const bootstrapErrors=[];
  page.on('pageerror',error=>bootstrapErrors.push('runtime: '+error.message));
  page.on('requestfailed',request=>bootstrapErrors.push('request: '+request.url()+'; '+(request.failure()?.errorText??'unknown')));
  page.on('response',response=>{
    if(response.status()>=400&&new URL(response.url()).host==='127.0.0.1:4174')
      bootstrapErrors.push('HTTP '+response.status()+': '+response.url());
  });
  await page.route('**/api/v1/tasks?*',route=>route.fulfill({json:{
    items:[rootRow],continuation:null,exact_total:1,
  }}));
  await page.route('**/api/v1/tasks/'+task,route=>route.fulfill({json:detail}));
  await page.route('**/api/v1/tasks/'+task+'/relationships?*',route=>route.fulfill({json:{
    items:[],continuation:null,exact_total:0,
  }}));
  await page.route('**/api/v1/tasks/'+task+'/attention?*',route=>route.fulfill({json:{
    items:[{kind:'historical',item_id:id,revision:1,created_at_utc:1,
      input_fingerprint:'not-a-hash'}],continuation:null,exact_total:1,
  }}));
  const navigation=await page.goto('http://127.0.0.1:4174/tickets/rfc/'+rfc);
  expect(navigation?.status(), 'The frozen RFC workbench URL must return HTTP 200').toBe(200);
  try {
    await expect(page.getByRole('tablist',{name:'Record sections'})).toBeVisible({timeout:10000});
  }catch(error){
    const root=await page.locator('#root').innerText().catch(()=>'<root unavailable>');
    throw new Error('RFC workbench bootstrap did not mount before Task attention test; '+
      'route='+page.url()+'; root='+root.slice(0,800)+
      '; browser/HTTP failures='+JSON.stringify(bootstrapErrors.slice(0,12))+
      '; original='+String(error));
  }
  await page.getByRole('tab',{name:'Tasks',exact:true}).click();
  const panel=page.getByRole('region',{name:'RFC Tasks'});
  await panel.getByRole('button',{name:'Evidence Task'}).click();
  await panel.getByRole('button',{name:'Inspect Task relationships and attention'}).click();
  const alerts=panel.getByRole('region',{name:'Pending Task attention'});
  await expect(alerts.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(alerts.getByText('not-a-hash')).toHaveCount(0);
});

const emptyInventory=(taskId=task)=>({
  task_id:taskId,allocation_history:[],local_fulfillment_history:[],
  physical_consequences:[],return_obligations:[],
});
async function taskInventoryFixture(page,raw,reads){
  await page.route('**/api/v1/tasks?*',route=>route.fulfill({json:{
    items:[rootRow],continuation:null,exact_total:1,
  }}));
  await page.route('**/api/v1/tasks/'+task,route=>route.fulfill({json:detail}));
  await page.route('**/api/v1/inventory/tasks/'+task,route=>{
    reads.push(route.request().url());return route.fulfill({json:raw});
  });
  await page.goto('http://127.0.0.1:4174/tickets/sr/'+sr);
  await page.getByRole('tab',{name:'Tasks',exact:true}).click();
  const panel=page.getByRole('region',{name:'Service Request Tasks'});
  await panel.getByRole('button',{name:'Evidence Task'}).click();
  return panel.getByRole('complementary',{name:'Selected Task details'});
}
test('Task Inventory point is lazy beneath accepted Task and distinguishes allocation from physical consequence',async({page})=>{
  const calls=[];
  const projection={
    ...emptyInventory(),
    allocation_history:[{
      allocation_event_id:id,allocation_id:link,spare_part_unit_id:link,
      spare_need_id:null,event_kind:'planned_selection',reason_code:null,recorded_at_utc:1720000000,
    }],
    local_fulfillment_history:[],
    physical_consequences:[{
      physical_consequence_id:id,task_review_fingerprint:'a'.repeat(64),rma_id:rfc,
      physical_disposition:'installed',installed_spare_part_unit_id:link,
      removed_device_part_unit_id:null,inbound_spare_part_unit_id:link,
      parent_dismantled_unit_id:null,revision:1,input_fingerprint:'b'.repeat(64),
    }],
    return_obligations:[{
      rma_id:rfc,state:'open',device_part_unit_id:null,spare_part_unit_id:link,
      physical_consequence_id:id,revision:1,
    }],
  };
  const selected=await taskInventoryFixture(page,projection,calls);
  const toggle=selected.getByRole('button',{name:'Inspect Task Inventory evidence'});
  await expect(toggle).toBeVisible();
  expect(calls).toHaveLength(0);
  await toggle.click();
  const pane=selected.getByRole('region',{name:'Task Inventory evidence',exact:true});
  await expect(pane.getByRole('region',{name:'Task unit allocation events'})).toContainText('planned_selection');
  await expect(pane.getByRole('region',{name:'Task physical consequences'})).toContainText('installed');
  await expect(pane.getByRole('region',{name:'Task return obligations'})).toContainText('open');
  await expect(pane).toContainText('not an independent proof of Task existence');
  expect(calls).toHaveLength(1);
  await expect(page.getByRole('button',{name:'Reserve selected unit'})).toHaveCount(0);
});
test('Foreign Task Inventory owner identity fails closed, despite valid-looking allocations',async({page})=>{
  const calls=[];
  const selected=await taskInventoryFixture(page,{
    ...emptyInventory(rfc),
    allocation_history:[{
      allocation_event_id:id,allocation_id:link,spare_part_unit_id:link,
      spare_need_id:null,event_kind:'UNTRUSTED_TASK_ALLOCATION',
      reason_code:null,recorded_at_utc:1720000000,
    }],
  },calls);
  await selected.getByRole('button',{name:'Inspect Task Inventory evidence'}).click();
  const pane=selected.getByRole('region',{name:'Task Inventory evidence',exact:true});
  await expect(pane.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(pane).not.toContainText('UNTRUSTED_TASK_ALLOCATION');
  expect(calls).toHaveLength(1);
});
test('Out-of-order Task Inventory allocation evidence rejects the entire projection',async({page})=>{
  const calls=[];
  const selected=await taskInventoryFixture(page,{
    ...emptyInventory(),
    allocation_history:[
      {allocation_event_id:link,allocation_id:id,spare_part_unit_id:id,
        spare_need_id:null,event_kind:'recent',reason_code:null,recorded_at_utc:200},
      {allocation_event_id:id,allocation_id:link,spare_part_unit_id:link,
        spare_need_id:null,event_kind:'UNTRUSTED_OLD_ALLOCATION',reason_code:null,recorded_at_utc:100},
    ],
  },calls);
  await selected.getByRole('button',{name:'Inspect Task Inventory evidence'}).click();
  const pane=selected.getByRole('region',{name:'Task Inventory evidence',exact:true});
  await expect(pane.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(pane).not.toContainText('UNTRUSTED_OLD_ALLOCATION');
});
