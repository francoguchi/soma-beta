import {test,expect} from '@playwright/test';
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
  await page.goto('http://127.0.0.1:4174/tickets/rfc/'+rfc);
  await page.getByRole('tab',{name:'Tasks'}).click();
  const panel=page.getByRole('region',{name:'RFC Tasks'});
  await panel.getByRole('button',{name:'Evidence Task'}).click();
  await panel.getByRole('button',{name:'Inspect Task relationships and attention'}).click();
  const alerts=panel.getByRole('region',{name:'Pending Task attention'});
  await expect(alerts.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(alerts.getByText('not-a-hash')).toHaveCount(0);
});
