import {test,expect} from '@playwright/test';
const run='11111111-1111-4111-8111-111111111111';
const finding='22222222-2222-4222-8222-222222222222';
const proposal='33333333-3333-4333-8333-333333333333';
const counts=Object.fromEntries(['observed','valid_identity','invalid','warning','proposal','pending',
  'accepted','rejected','deferred'].map(k=>[k,k==='pending'?1:0]));
const summary={import_run_id:run,source_family:'advanced_search_sr',candidate_filename:'sample.xlsx',
  run_state:'waiting_review',revision:2,invocation_kind:'manual',logical_fingerprint:'a'.repeat(64),counts};
const detail={run:summary,checkpoint_comparison:{classification:'first_source',candidate:{},checkpoint:null},
  review_state:{pending:1,accepted:0,rejected:0,deferred:0,can_finalize:false,recovery_authorized:false}};
async function fixture(page){
  await page.route('**/api/v1/imports/sources/*',route=>route.fulfill({json:{
    source_family:route.request().url().split('/').at(-1),configured:false,profile_ids:{},
    checkpoint:null,latest_run:null,
  }}));
  await page.route('**/api/v1/imports/runs?*',route=>route.fulfill({json:{items:[summary],next_cursor:null}}));
  await page.route('**/api/v1/imports/runs/'+run,route=>route.fulfill({json:detail}));
}
test('Selecting accepted import run reads exact review only after selection',async({page})=>{
  await fixture(page);
  let detailReads=0;
  await page.route('**/api/v1/imports/runs/'+run,route=>{
    detailReads++;return route.fulfill({json:detail});
  });
  await page.goto('http://127.0.0.1:4174/tickets/imports');
  const history=page.getByRole('region',{name:'Import run history'});
  await expect(history.getByRole('button',{name:'Inspect run '+run})).toBeVisible();
  expect(detailReads).toBe(0);
  await history.getByRole('button',{name:'Inspect run '+run}).click();
  const selected=history.getByRole('complementary',{name:'Selected import run'});
  await expect(selected.getByText('first_source')).toBeVisible();
  await expect(selected.getByText('Owner does not report this run eligible')).toBeVisible();
  expect(detailReads).toBe(1);
  await expect(page.getByRole('button',{name:'Finalize import'})).toHaveCount(0);
});
test('Findings and proposal list are queried lazily after deliberate expansion',async({page})=>{
  await fixture(page);
  let reads=0;
  await page.route('**/api/v1/imports/runs/'+run+'/findings?*',route=>{
    reads++;return route.fulfill({json:{items:[{import_finding_id:finding,
      finding_code:'MISSING_HEADER',severity:'error',scope_kind:'workbook',
      message_text:'Required heading unavailable',source_observation_id:null,field_key:null}],
      exact_total:1,next_cursor:null}});
  });
  await page.route('**/api/v1/imports/runs/'+run+'/proposals?*',route=>{
    reads++;return route.fulfill({json:{items:[{proposal_id:proposal,proposal_kind:'sr_create_or_adopt',
      target_kind:'service_request',risk_class:'high',state:'pending',proposal_revision:1,
      proposal_fingerprint:'b'.repeat(64),base_state_token:'c'.repeat(64),
      evidence:{mode:'observed_row',import_run_id:run}}],exact_total:1,next_cursor:null}});
  });
  await page.goto('http://127.0.0.1:4174/tickets/imports');
  await page.getByRole('button',{name:'Inspect run '+run}).click();
  const selected=page.getByRole('complementary',{name:'Selected import run'});
  await expect(selected.getByText('first_source')).toBeVisible();
  expect(reads).toBe(0);
  await selected.getByRole('button',{name:'Inspect import findings and reconciliation proposals'}).click();
  await expect(page.getByRole('region',{name:'Import findings'}).getByText('MISSING_HEADER')).toBeVisible();
  await expect(page.getByRole('region',{name:'Reconciliation proposals'}).getByText('sr_create_or_adopt')).toBeVisible();
  expect(reads).toBe(2);
});
test('Stale import detail is rejected without exposing its untrusted candidate',async({page})=>{
  await fixture(page);
  await page.route('**/api/v1/imports/runs/'+run,route=>route.fulfill({json:{
    ...detail,run:{...summary,revision:1,candidate_filename:'UNTRUSTED.xlsx'},
  }}));
  await page.goto('http://127.0.0.1:4174/tickets/imports');
  await page.getByRole('button',{name:'Inspect run '+run}).click();
  const selected=page.getByRole('complementary',{name:'Selected import run'});
  await expect(selected.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(selected.getByText('UNTRUSTED.xlsx')).toHaveCount(0);
});
