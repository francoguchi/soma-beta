import {test,expect} from '@playwright/test';
const sr='11111111-1111-4111-8111-111111111111';
const rfc='22222222-2222-4222-8222-222222222222';
const taskA='33333333-3333-4333-8333-333333333333';
const taskB='44444444-4444-4444-8444-444444444444';
const objective='55555555-5555-4555-8555-555555555555';
const task=(id,name,plan=null)=>({task_id:id,kind:'local',display_name:name,creation_origin:'manual',
  revision:1,owning_rfc:null,operational_plan:plan,membership:null,execution_state:'not_started',
  review_state:'unreviewed',accepted_outcome:null,operational_count_included:true,warnings:[]});
const plan={plan_revision_id:'66666666-6666-4666-8666-666666666666',
  revision:1,start_utc:1800000,end_utc:1803600,origin:'manual'};

test('SR Tasks query is owner-filtered and selection reveals current task point',async({page})=>{
  const calls=[];
  await page.route('**/api/v1/tasks?*',route=>{
    const url=new URL(route.request().url());calls.push(url);
    return route.fulfill({json:url.searchParams.has('cursor')?{items:[task(taskB,'Task Beta')],exact_total:2,continuation:null}:
      {items:[task(taskA,'Task Alpha',plan)],exact_total:2,continuation:{unscheduled:0,start_utc:1800000,task_id:taskA}}});
  });
  await page.route('**/api/v1/tasks/'+taskA,route=>route.fulfill({json:{
    task_id:taskA,kind:'local',display_name:'Task Alpha',revision:1,operational_plan:plan,
    objective_membership:{objective_id:objective},
    actual_execution:{execution_state:'not_started',actual_start_utc:null,actual_end_utc:null},
    reviewed_outcome:null,relationship_summary:{exact_total:1},attention_summary:{warning_codes:[]},
  }}));
  await page.goto('http://127.0.0.1:4174/tickets/sr/'+sr);
  await page.getByRole('tab',{name:'Tasks',exact:true}).click();
  const panel=page.getByRole('region',{name:'Service Request Tasks'});
  await expect(panel.getByRole('button',{name:'Task Alpha'})).toBeVisible();
  expect(calls[0].searchParams.get('sr_id')).toBe(sr);
  expect(calls[0].searchParams.has('rfc_id')).toBe(false);
  await expect(panel.getByRole('complementary',{name:'Selected Task details'})).toHaveCount(0);
  await panel.getByRole('button',{name:'Task Alpha'}).click();
  const details=panel.getByRole('complementary',{name:'Selected Task details'});
  await expect(details.getByText('Task Alpha')).toBeVisible();
  await expect(details.getByText('No current Objective membership')).toHaveCount(0);
  await panel.getByRole('button',{name:'Next page'}).click();
  await expect(panel.getByRole('button',{name:'Task Beta'})).toBeVisible();
  await expect(details).toHaveCount(0);
  expect(JSON.parse(calls[1].searchParams.get('cursor'))).toEqual({unscheduled:0,start_utc:1800000,task_id:taskA});
  await panel.getByRole('button',{name:'Previous page'}).click();
  await expect(panel.getByRole('button',{name:'Task Alpha'})).toBeVisible();
});

test('RFC Tasks filter never pretends an SR query or task membership',async({page})=>{
  const calls=[];
  await page.route('**/api/v1/tasks?*',route=>{
    calls.push(new URL(route.request().url()));return route.fulfill({json:{items:[],continuation:null,exact_total:0}});
  });
  await page.goto('http://127.0.0.1:4174/tickets/rfc/'+rfc);
  await page.getByRole('tab',{name:'Tasks',exact:true}).click();
  const panel=page.getByRole('region',{name:'RFC Tasks'});
  await expect(panel.getByText('No Tasks returned for this accepted RFC context.')).toBeVisible();
  expect(calls.at(-1).searchParams.get('rfc_id')).toBe(rfc);
  expect(calls.at(-1).searchParams.has('sr_id')).toBe(false);
});

test('Task list rejects malformed owner cursor and never exposes synthetic row',async({page})=>{
  await page.route('**/api/v1/tasks?*',route=>route.fulfill({json:{
    items:[task(taskA,'UNTRUSTED',plan)],exact_total:1,
    continuation:{unscheduled:1,start_utc:null,task_id:taskA},
  }}));
  await page.goto('http://127.0.0.1:4174/tickets/sr/'+sr);
  await page.getByRole('tab',{name:'Tasks',exact:true}).click();
  const panel=page.getByRole('region',{name:'Service Request Tasks'});
  await expect(panel.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(panel.getByText('UNTRUSTED')).toHaveCount(0);
});
