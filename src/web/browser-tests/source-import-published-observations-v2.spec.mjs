import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
const run='11111111-1111-4111-8111-111111111111';
const obsA='22222222-2222-4222-8222-222222222222';
const obsB='33333333-3333-4333-8333-333333333333';
const field='44444444-4444-4444-8444-444444444444';
const summary={import_run_id:run,source_family:'advanced_search_sr',candidate_filename:'archive.xlsx',
  run_state:'waiting_review',revision:2,invocation_kind:'manual',logical_fingerprint:'a'.repeat(64),
  counts:Object.fromEntries(['observed','valid_identity','invalid','warning','proposal','pending',
    'accepted','rejected','deferred'].map(k=>[k,k==='observed'?2:0]))};
const row=(id,ordinal,state='valid')=>({source_observation_id:id,source_family:'advanced_search_sr',
  entity_kind:'service_request',identity_state:state,canonical_primary_id:state==='valid'?'12345678':null,
  canonical_parent_rfc_no:null,row_locator:{sheet_ordinal:1,row_ordinal:ordinal},source_row_chronology_utc:null,
  fields:[{source_observation_field_id:field,field_key:'problem_summary',field_class:'deferred',
    value_state:'unknown',value_kind:'text',display_value:'Publisher did not normalize this value'}]});
const digest=value=>createHash('sha256').update(JSON.stringify(Object.fromEntries(
  Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)))).digest('hex');
const cursor={version:1,query_id:'ListPublishedSourceObservations',
  sort_registry_id:'IMPORT_OBSERVATION_ROW_ASC_V1',last_key_tuple:[1,1,obsA],
  filter_fingerprint:digest({schema:'SOMA_IMPORT_OBSERVATION_LIST_FILTER_V1',
    import_run_id:run,identity_state:null}),null_order:'none'};
async function fixture(page){
  await page.route('**/api/v1/imports/sources/*',route=>route.fulfill({json:{
    source_family:route.request().url().split('/').at(-1),configured:false,profile_ids:{},
    checkpoint:null,latest_run:null,
  }}));
  await page.route('**/api/v1/imports/runs?*',route=>route.fulfill({json:{items:[summary],next_cursor:null}}));
  await page.route('**/api/v1/imports/runs/'+run,route=>route.fulfill({json:{
    run:summary,checkpoint_comparison:null,
    review_state:{pending:0,accepted:0,rejected:0,deferred:0,can_finalize:false,recovery_authorized:false},
  }}));
}
async function openSource(page){
  await page.goto('http://127.0.0.1:4174/tickets/imports');
  await page.getByRole('button',{name:'Inspect run '+run}).click();
  const selected=page.getByRole('complementary',{name:'Selected import run'});
  await expect(selected.getByRole('button',{name:'Inspect published source observations'})).toBeVisible();
  return selected;
}
test('Published observation rows remain unread until explicitly expanded; owner cursor pages are preserved',async({page})=>{
  const urls=[];
  await fixture(page);
  await page.route('**/api/v1/imports/runs/'+run+'/observations?*',route=>{
    const u=new URL(route.request().url());urls.push(u);
    return route.fulfill({json:u.searchParams.has('cursor')
      ?{items:[row(obsB,2,'invalid')],exact_total:2,next_cursor:null}
      :{items:[row(obsA,1)],exact_total:2,next_cursor:cursor}});
  });
  const selected=await openSource(page);
  expect(urls).toHaveLength(0);
  await selected.getByRole('button',{name:'Inspect published source observations'}).click();
  const region=page.getByRole('region',{name:'Published source observations'});
  await expect(region.getByRole('article',{name:'Source row 1:1'})).toContainText('deferred');
  await expect(region.getByRole('article',{name:'Source row 1:1'})).toContainText('unknown');
  await expect(region).toContainText('Publisher did not normalize this value');
  await region.getByRole('button',{name:'Next page'}).click();
  await expect(region.getByRole('article',{name:'Source row 1:2'})).toBeVisible();
  expect(urls[1].searchParams.has('identity_state')).toBe(false);
  expect(JSON.parse(urls[1].searchParams.get('cursor'))).toEqual(cursor);
  await region.getByRole('button',{name:'Previous page'}).click();
  await expect(region.getByRole('article',{name:'Source row 1:1'})).toBeVisible();
});
test('Published observation identity filter sends only owned valid/invalid query',async({page})=>{
  const urls=[];
  await fixture(page);
  await page.route('**/api/v1/imports/runs/'+run+'/observations?*',route=>{
    const u=new URL(route.request().url());urls.push(u);
    return route.fulfill({json:{items:u.searchParams.get('identity_state')==='invalid'?
      [row(obsB,2,'invalid')]:[row(obsA,1)],exact_total:1,next_cursor:null}});
  });
  const selected=await openSource(page);
  await selected.getByRole('button',{name:'Inspect published source observations'}).click();
  const region=page.getByRole('region',{name:'Published source observations'});
  await expect(region.getByRole('article',{name:'Source row 1:1'})).toBeVisible();
  await region.getByRole('combobox',{name:'Identity state'}).selectOption('invalid');
  await expect(region.getByRole('article',{name:'Source row 1:2'})).toBeVisible();
  expect(urls.at(-1).searchParams.get('identity_state')).toBe('invalid');
  expect(urls.at(-1).searchParams.has('cursor')).toBe(false);
});
test('Invalid observation cursor fails closed without publishing untrusted rows',async({page})=>{
  await fixture(page);
  await page.route('**/api/v1/imports/runs/'+run+'/observations?*',route=>route.fulfill({json:{
    items:[{...row(obsA,1),fields:[{source_observation_field_id:field,field_key:'danger',
      field_class:'active',value_state:'usable',value_kind:'text',display_value:'UNTRUSTED-SOURCE'}]}],
    exact_total:1,next_cursor:{...cursor,last_key_tuple:[99,1,obsA]},
  }}));
  const selected=await openSource(page);
  await selected.getByRole('button',{name:'Inspect published source observations'}).click();
  const region=page.getByRole('region',{name:'Published source observations'});
  await expect(region.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(region.getByText('UNTRUSTED-SOURCE')).toHaveCount(0);
});
test('Unpublished run cannot request published observation authority',async({page})=>{
  await fixture(page);
  const calls=[];
  await page.route('**/api/v1/imports/runs/'+run,route=>route.fulfill({json:{
    run:{...summary,run_state:'validating'},checkpoint_comparison:null,
    review_state:{pending:0,accepted:0,rejected:0,deferred:0,can_finalize:false,recovery_authorized:false},
  }}));
  await page.route('**/api/v1/imports/runs/'+run+'/observations?*',route=>{
    calls.push(route.request().url());return route.fulfill({status:503,json:{code:'UNEXPECTED_CALL'}});
  });
  await page.goto('http://127.0.0.1:4174/tickets/imports');
  await page.getByRole('button',{name:'Inspect run '+run}).click();
  const selected=page.getByRole('complementary',{name:'Selected import run'});
  await expect(selected.getByText('Published source observations are unavailable at this run state.')).toBeVisible();
  expect(calls).toHaveLength(0);
});
