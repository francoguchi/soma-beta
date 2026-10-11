import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
const ne='11111111-1111-4111-8111-111111111111',site='22222222-2222-4222-8222-222222222222';
const model='33333333-3333-4333-8333-333333333333';
const candidateId=n=>'44444444-4444-4444-8444-'+String(n).padStart(12,'0');
const point=withModel=>({
  network_element_id:ne,revision:2,lifecycle:'active',operational_name:'NE Candidate Root',
  site:{kind:'site',id:site},customer_org_id:site,
  placement:{rack_id:null,u_start:null,u_span:null,revision:1,explicit_unracked:true},
  model:withModel?{kind:'model',id:model}:null,cloud_deployment:null,primary_ip:null,ip_count:0,
  containment_parent:null,containment_child_count:0,device_reference_count:0,
  installed_component_count:0,warning_codes:[],
});
const row=(n,rank=2)=>({network_element_id:candidateId(n),evidence_rank:rank,
  evidence_codes:rank===2?['MODEL_EXACT','SITE_EXACT']:['SITE_EXACT'],
  site_id:site,lifecycle:'active'});
const cursor=(n,rank=2,hasModel=true)=>({version:1,query_id:'NetworkElementCandidateQuery',
  sort_registry_id:'NetworkElementCandidateQuery_ORDER_V1',last_key_tuple:[rank,candidateId(n)],
  filter_fingerprint:createHash('sha256').update(JSON.stringify(
    hasModel?{model_id:model,site_id:site}:{site_id:site})).digest('hex'),
  null_order:'NOT_APPLICABLE'});
async function fixtures(page,reply,reads,withModel=true){
  await page.route('**/api/v1/infrastructure/**',route=>{
    const url=new URL(route.request().url()),p=url.pathname;
    if(p==='/api/v1/infrastructure/tree')return route.fulfill({json:{nodes:[
      {kind:'network_element',id:ne,label:'NE Candidate Root',parent_context_id:site,
        lifecycle:'active',warning_codes:[]}],next_cursor:null}});
    if(p==='/api/v1/infrastructure/network-elements/'+ne)
      return route.fulfill({json:point(withModel)});
    if(p==='/api/v1/infrastructure/network-elements/candidates'){
      reads.push(url);return route.fulfill({json:typeof reply==='function'?reply(url):reply});
    }
    return route.fulfill({status:404,json:{code:'TEST_UNEXPECTED_ROUTE'}});
  });
}
async function open(page){
  await page.goto('http://127.0.0.1:4174/infrastructure');
  await page.getByRole('listitem').filter({hasText:'NE Candidate Root'}).press('Enter');
  const panel=page.getByRole('region',{name:'Opened Network Element'});
  await panel.getByRole('tab',{name:'Relationships'}).click();
  return panel;
}
test('Candidate evidence opens lazily with separate exact Site/Model filters and no verification claim',async({page})=>{
  const reads=[];
  await fixtures(page,{candidates:[row(1)],next_cursor:null,candidate_count:1},reads);
  const panel=await open(page);
  await expect(panel.getByRole('button',{name:'Inspect related Network Element candidates'})).toBeVisible();
  expect(reads).toHaveLength(0);
  await panel.getByRole('button',{name:'Inspect related Network Element candidates'}).click();
  const evidence=panel.getByRole('region',{name:'Related NE candidate evidence'});
  await expect(evidence.getByRole('table',{name:'Network Element owner candidates'})).toContainText('MODEL_EXACT');
  await expect(evidence).toContainText('not a verified');
  expect(reads).toHaveLength(1);
  expect(reads[0].searchParams.get('model_id')).toBe(model);
  expect(reads[0].searchParams.get('site_id')).toBe(site);
});
test('NE candidates page in descending evidence rank then ascending UUID identity',async({page})=>{
  const reads=[];
  await fixtures(page,url=>url.searchParams.has('cursor')
    ?{candidates:[row(26,1)],next_cursor:null,candidate_count:26}
    :{candidates:Array.from({length:25},(_,i)=>row(i+1)),next_cursor:cursor(25),candidate_count:26},reads);
  const panel=await open(page);
  await panel.getByRole('button',{name:'Inspect related Network Element candidates'}).click();
  const evidence=panel.getByRole('region',{name:'Related NE candidate evidence'});
  await expect(evidence).toContainText(candidateId(25));
  await evidence.getByRole('button',{name:'Next page'}).click();
  await expect(evidence).toContainText(candidateId(26));
  expect(JSON.parse(reads.at(-1).searchParams.get('cursor'))).toEqual(cursor(25));
});
test('A foreign NE candidate filter hash suppresses all apparent exact matching evidence',async({page})=>{
  const calls=[];
  await fixtures(page,{candidates:Array.from({length:25},(_,i)=>row(i+1)),
    next_cursor:{...cursor(25),filter_fingerprint:'f'.repeat(64)},candidate_count:26},calls);
  const panel=await open(page);
  await panel.getByRole('button',{name:'Inspect related Network Element candidates'}).click();
  const evidence=panel.getByRole('region',{name:'Related NE candidate evidence'});
  await expect(evidence.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(evidence).not.toContainText(candidateId(1));
});
test('Unassigned Model searches current Site only without inventing a Model relation',async({page})=>{
  const reads=[];
  await fixtures(page,{candidates:[row(1,1)],next_cursor:null,candidate_count:1},reads,false);
  const panel=await open(page);
  await panel.getByRole('button',{name:'Inspect related Network Element candidates'}).click();
  const evidence=panel.getByRole('region',{name:'Related NE candidate evidence'});
  await expect(evidence).toContainText('SITE_EXACT');
  expect(reads).toHaveLength(1);
  expect(reads[0].searchParams.get('model_id')).toBeNull();
  expect(reads[0].searchParams.get('site_id')).toBe(site);
});
