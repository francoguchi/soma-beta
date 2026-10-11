import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
const site='11111111-1111-4111-8111-111111111111';
const customer='22222222-2222-4222-8222-222222222222';
const dispatch='33333333-3333-4333-8333-333333333333';
const siteDetail={site_id:site,revision:1,customer_org_id:customer,name:'Site Delta',
  address_text:'Recorded address',lifecycle:'active',dispatch_location_id:dispatch,
  room_count:3,rack_count:1,network_element_count:2,cloud_deployment_count:0,
  archive_blocker_count:26,duplicate_candidate_count:0};
const row=(n)=>({provider_order:0,blocker_kind:'rack',
  blocker_id:'rack-'+String(n).padStart(3,'0'),reason_code:'ACTIVE_RACK'});
const cursor=n=>({version:1,query_id:'SiteArchiveBlockerQuery',
  sort_registry_id:'SiteArchiveBlockerQuery_ORDER_V1',
  last_key_tuple:[0,'rack',row(n).blocker_id],
  filter_fingerprint:createHash('sha256').update(JSON.stringify({site_id:site})).digest('hex'),
  null_order:'NOT_APPLICABLE'});
async function arrange(page,reply,reads){
  await page.route('**/api/v1/infrastructure/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/v1/infrastructure/tree')
      return route.fulfill({json:{nodes:[{kind:'site',id:site,label:'Site Delta',
        parent_context_id:null,lifecycle:'active',warning_codes:[]}],next_cursor:null}});
    if(path==='/api/v1/infrastructure/sites/'+site)
      return route.fulfill({json:siteDetail});
    if(path==='/api/v1/infrastructure/sites/'+site+'/archive-blockers'){
      reads.push(new URL(route.request().url()));
      return route.fulfill({json:typeof reply==='function'?reply(reads.at(-1)):reply});
    }
    return route.fulfill({status:404,json:{code:'UNKNOWN_ROUTE'}});
  });
}
async function openSite(page){
  await page.goto('http://127.0.0.1:4174/infrastructure');
  await page.getByRole('listitem').filter({hasText:'Site Delta'}).press('Enter');
  return page.getByRole('region',{name:'Opened Site'});
}
test('Site dependencies are lazy; indeterminate provider state cannot imply archive clearance',async({page})=>{
  const reads=[];const writes=[];
  await arrange(page,{items:[row(1)],next_cursor:null,exact_count:1,indeterminate:true},reads);
  page.on('request',request=>{if(request.method()!=='GET')writes.push(request.url());});
  const sitePane=await openSite(page);
  await expect(sitePane.getByRole('button',{name:'Inspect Site archive blockers'})).toBeVisible();
  expect(reads).toHaveLength(0);
  await sitePane.getByRole('button',{name:'Inspect Site archive blockers'}).click();
  const evidence=sitePane.getByRole('region',{name:'Site blocker evidence'});
  await expect(evidence).toContainText('ACTIVE_RACK');
  await expect(evidence.getByRole('alert')).toContainText('indeterminate');
  await expect(evidence.getByRole('button',{name:'Next page'})).toBeDisabled();
  expect(reads).toHaveLength(1);
  expect(writes).toEqual([]);
});
test('Site blocker pagination binds exact Site owner filter and preserves ordered rows',async({page})=>{
  const reads=[];
  await arrange(page,url=>url.searchParams.has('cursor')
    ?{items:[row(26)],next_cursor:null,exact_count:26,indeterminate:false}
    :{items:Array.from({length:25},(_,i)=>row(i+1)),
      next_cursor:cursor(25),exact_count:26,indeterminate:false},reads);
  const sitePane=await openSite(page);
  await sitePane.getByRole('button',{name:'Inspect Site archive blockers'}).click();
  const evidence=sitePane.getByRole('region',{name:'Site blocker evidence'});
  await expect(evidence).toContainText('rack-025');
  await evidence.getByRole('button',{name:'Next page'}).click();
  await expect(evidence).toContainText('rack-026');
  expect(JSON.parse(reads.at(-1).searchParams.get('cursor'))).toEqual(cursor(25));
  await evidence.getByRole('button',{name:'Previous page'}).click();
  await expect(evidence).toContainText('rack-001');
});
test('Foreign Site blocker cursor prevents displaying any apparently reliable row',async({page})=>{
  const reads=[];
  await arrange(page,{items:Array.from({length:25},(_,i)=>row(i+1)),
    next_cursor:{...cursor(25),filter_fingerprint:'f'.repeat(64)},
    exact_count:26,indeterminate:false},reads);
  const sitePane=await openSite(page);
  await sitePane.getByRole('button',{name:'Inspect Site archive blockers'}).click();
  const evidence=sitePane.getByRole('region',{name:'Site blocker evidence'});
  await expect(evidence.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(evidence).not.toContainText('rack-001');
  await expect(evidence.getByRole('table',{name:'Site archive dependency rows'})).toHaveCount(0);
});
