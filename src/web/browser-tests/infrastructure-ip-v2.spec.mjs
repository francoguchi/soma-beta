import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
const ne='11111111-1111-4111-8111-111111111111';
const ipid=n=>'22222222-2222-4222-8222-'+String(n).padStart(12,'0');
const site='33333333-3333-4333-8333-333333333333';
const ip='192.0.2.1';
const detail=(primary=ip)=>({
  network_element_id:ne,revision:3,lifecycle:'active',operational_name:'Router C',
  site:{kind:'site',id:site},customer_org_id:site,
  placement:{rack_id:null,u_start:null,u_span:null,revision:1,explicit_unracked:true},
  model:null,cloud_deployment:null,primary_ip:primary,ip_count:1,containment_parent:null,
  containment_child_count:0,device_reference_count:0,installed_component_count:0,warning_codes:[],
});
const candidate=(n,element=ne)=>({network_element_ip_id:ipid(n),network_element_id:element,site_id:site,is_primary:true});
const cursor=n=>({version:1,query_id:'IpCandidateQuery',
  sort_registry_id:'IpCandidateQuery_ORDER_V1',last_key_tuple:[ne,ipid(n)],
  filter_fingerprint:createHash('sha256').update(JSON.stringify({canonical_address:ip})).digest('hex'),
  null_order:'NOT_APPLICABLE'});
async function base(page,resolve,reads=[],primary=ip){
  await page.route('**/api/v1/infrastructure/**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/v1/infrastructure/tree')return route.fulfill({json:{nodes:[
      {kind:'network_element',id:ne,label:'Router C',parent_context_id:site,lifecycle:'active',warning_codes:[]},
    ],next_cursor:null}});
    if(url.pathname==='/api/v1/infrastructure/network-elements/'+ne)
      return route.fulfill({json:detail(primary)});
    if(url.pathname==='/api/v1/infrastructure/ip-candidates'){
      reads.push(url);return route.fulfill({json:resolve(url)});
    }
    return route.fulfill({status:404,json:{code:'NO_OTHER_OWNER_ROUTE'}});
  });
}
async function open(page){
  await page.goto('http://127.0.0.1:4174/infrastructure');
  await page.getByRole('listitem').filter({hasText:'Router C'}).press('Enter');
  const panel=page.getByRole('region',{name:'Opened Network Element'});
  await panel.getByRole('tab',{name:'IP Addresses'}).click();
  return panel;
}
test('IP candidates read only after explicit opening beneath a current accepted NE primary IP',async({page})=>{
  const reads=[];await base(page,()=>({items:[candidate(1)],next_cursor:null,exact_count:1}),reads);
  const panel=await open(page);
  await expect(panel.getByRole('button',{name:'Inspect primary IP reuse evidence'})).toBeVisible();
  expect(reads).toHaveLength(0);
  await panel.getByRole('button',{name:'Inspect primary IP reuse evidence'}).click();
  const evidence=panel.getByRole('region',{name:'IP reuse evidence'});
  await expect(evidence.getByRole('table',{name:'IP identity candidates'})).toContainText(ipid(1));
  await expect(evidence).toContainText('Owner-reported active address matches: 1');
  await expect(evidence).toContainText('No IP assignment, primary promotion');
  expect(reads).toHaveLength(1);
  expect(reads[0].searchParams.get('canonical_address')).toBe(ip);
});
test('IP owner candidates paginate by both Network Element and IP identity, with canonical filter digest',async({page})=>{
  const reads=[];
  await base(page,url=>url.searchParams.has('cursor')
    ?{items:[candidate(26)],next_cursor:null,exact_count:26}
    :{items:Array.from({length:25},(_,i)=>candidate(i+1)),next_cursor:cursor(25),exact_count:26},reads);
  const panel=await open(page);
  await panel.getByRole('button',{name:'Inspect primary IP reuse evidence'}).click();
  const evidence=panel.getByRole('region',{name:'IP reuse evidence'});
  await expect(evidence).toContainText(ipid(25));
  await evidence.getByRole('button',{name:'Next page'}).click();
  await expect(evidence).toContainText(ipid(26));
  expect(JSON.parse(reads.at(-1).searchParams.get('cursor'))).toEqual(cursor(25));
  await evidence.getByRole('button',{name:'Previous page'}).click();
  await expect(evidence).toContainText(ipid(1));
});
test('False IP filter digest or duplicated identities invalidate the complete owner page',async({page})=>{
  await base(page,()=>({
    items:Array.from({length:25},(_,i)=>candidate(i+1)),
    next_cursor:{...cursor(25),filter_fingerprint:'f'.repeat(64)},exact_count:26,
  }));
  const panel=await open(page);
  await panel.getByRole('button',{name:'Inspect primary IP reuse evidence'}).click();
  const evidence=panel.getByRole('region',{name:'IP reuse evidence'});
  await expect(evidence.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(evidence).not.toContainText(ipid(1));
});
test('An NE without primary IP never queries candidate reuse or fabricates connectivity evidence',async({page})=>{
  const calls=[];await base(page,()=>({items:[],next_cursor:null,exact_count:0}),calls,null);
  const panel=await open(page);
  await expect(panel).toContainText('No primary selected');
  await expect(panel.getByRole('button',{name:'Inspect primary IP reuse evidence'})).toHaveCount(0);
  expect(calls).toHaveLength(0);
});

test('A repeated IP candidate key across owner pages fails closed instead of reusing stale evidence',async({page})=>{
  await base(page,url=>url.searchParams.has('cursor')
    ?{items:[candidate(25)],next_cursor:null,exact_count:26}
    :{items:Array.from({length:25},(_,i)=>candidate(i+1)),next_cursor:cursor(25),exact_count:26});
  const panel=await open(page);
  await panel.getByRole('button',{name:'Inspect primary IP reuse evidence'}).click();
  const evidence=panel.getByRole('region',{name:'IP reuse evidence'});
  await evidence.getByRole('button',{name:'Next page'}).click();
  await expect(evidence.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(evidence.getByRole('table',{name:'IP identity candidates'})).toHaveCount(0);
});
