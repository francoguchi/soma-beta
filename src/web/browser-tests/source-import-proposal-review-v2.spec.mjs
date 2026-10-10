import {test,expect} from '@playwright/test';

const run='11111111-1111-4111-8111-111111111111';
const proposal='33333333-3333-4333-8333-333333333333';
const summary={import_run_id:run,source_family:'advanced_search_sr',candidate_filename:'source.xlsx',
  run_state:'waiting_review',revision:2,invocation_kind:'manual',logical_fingerprint:'a'.repeat(64),
  counts:Object.fromEntries(['observed','valid_identity','invalid','warning','proposal','pending',
    'accepted','rejected','deferred'].map(k=>[k,k==='pending'?1:0]))};
const p={proposal_id:proposal,proposal_kind:'sr_create_or_adopt',target_kind:'service_request',
  risk_class:'high',state:'pending',proposal_revision:2,proposal_fingerprint:'b'.repeat(64),
  base_state_token:'c'.repeat(64),evidence:{mode:'observed_row',import_run_id:run}};
const review={proposal:p,stale:false,allowed_dispositions:['accept','reject','defer'],
  changes:[{ordinal:0,field_key:'official_sr_no',change_kind:'create',value_kind:'identity',
    before:null,after:'12345678',source_observation_field_id:null}],
  target_preview:{owner:'service_request',preview_available:true,identity:'12345678'}};

async function setup(page){
  await page.route('**/api/v1/imports/sources/*',route=>route.fulfill({json:{
    source_family:route.request().url().split('/').at(-1),configured:false,profile_ids:{},
    checkpoint:null,latest_run:null,
  }}));
  await page.route('**/api/v1/imports/runs?*',route=>route.fulfill({json:{items:[summary],next_cursor:null}}));
  await page.route('**/api/v1/imports/runs/'+run,route=>route.fulfill({json:{
    run:summary,checkpoint_comparison:null,
    review_state:{pending:1,accepted:0,rejected:0,deferred:0,can_finalize:false,recovery_authorized:false},
  }}));
  await page.route('**/api/v1/imports/runs/'+run+'/findings?*',route=>route.fulfill({json:{
    items:[],exact_total:0,next_cursor:null,
  }}));
  await page.route('**/api/v1/imports/runs/'+run+'/proposals?*',route=>route.fulfill({json:{
    items:[p],exact_total:1,next_cursor:null,
  }}));
}
async function openReview(page){
  await page.goto('http://127.0.0.1:4174/tickets/imports');
  await page.getByRole('button',{name:'Inspect run '+run}).click();
  const selected=page.getByRole('complementary',{name:'Selected import run'});
  await expect(selected.getByRole('button',{name:'Inspect import findings and reconciliation proposals'})).toBeVisible();
  await selected.getByRole('button',{name:'Inspect import findings and reconciliation proposals'}).click();
  const region=page.getByRole('region',{name:'Reconciliation proposals'});
  const choice=region.getByRole('button',{name:'Inspect proposal '+proposal});
  await expect(choice).toBeVisible();
  return choice;
}

test('Import proposal point review loads only after selecting exact proposal',async({page})=>{
  let detailReads=0;
  await setup(page);
  await page.route('**/api/v1/imports/proposals/'+proposal,route=>{
    detailReads++;return route.fulfill({json:review});
  });
  const choice=await openReview(page);
  expect(detailReads).toBe(0);
  await choice.click();
  const selected=page.getByRole('complementary',{name:'Selected reconciliation proposal'});
  await expect(selected.getByText('Current at this owner read')).toBeVisible();
  await expect(selected.getByRole('region',{name:'Proposal field changes'})).toContainText('12345678');
  await expect(selected.getByRole('region',{name:'Proposal target preview'})).toContainText('preview_available');
  await expect(selected).toContainText('accept, reject, defer');
  expect(detailReads).toBe(1);
  for(const action of ['Accept proposal','Reject proposal','Defer proposal']){
    await expect(page.getByRole('button',{name:action})).toHaveCount(0);
  }
});

test('Changed list-vs-point proposal revision fails closed',async({page})=>{
  await setup(page);
  await page.route('**/api/v1/imports/proposals/'+proposal,route=>route.fulfill({json:{
    ...review,proposal:{...p,proposal_revision:3},
    target_preview:{danger:'UNTRUSTED-PREVIEW'},
  }}));
  const choice=await openReview(page);await choice.click();
  const selected=page.getByRole('complementary',{name:'Selected reconciliation proposal'});
  await expect(selected.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(selected).not.toContainText('UNTRUSTED-PREVIEW');
});

test('Stale owner review shows explicit status and cannot advertise acceptance',async({page})=>{
  await setup(page);
  await page.route('**/api/v1/imports/proposals/'+proposal,route=>route.fulfill({json:{
    ...review,stale:true,allowed_dispositions:['reject','defer'],
  }}));
  const choice=await openReview(page);await choice.click();
  const selected=page.getByRole('complementary',{name:'Selected reconciliation proposal'});
  await expect(selected.getByText('STALE — refresh source evidence')).toBeVisible();
  await expect(selected).toContainText('reject, defer');
  await expect(selected.getByRole('button',{name:'Accept proposal'})).toHaveCount(0);
});
