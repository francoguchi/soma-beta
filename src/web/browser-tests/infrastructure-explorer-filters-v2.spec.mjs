import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
const id=n=>`${String(n).padStart(8,'0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
const site=id(1),customer=id(2),ne=id(3);
const node=(kind,value,label)=>({kind,id:value,label,parent_context_id:kind==='network_element'?site:null,
  lifecycle:'active',warning_codes:[]});
const tree='/api/v1/infrastructure/tree';
const initial=[node('site',site,'OWNER SITE'),node('network_element',ne,'OWNER NE')];
const filters=page=>page.getByRole('form',{name:'Infrastructure owner filters'});
test('Exact Infrastructure owner filters issue a new owner query and never claim client-side fuzzy matching',async({page})=>{
 const reads=[];
 await page.route('**/api/v1/infrastructure/tree?**',route=>{
   const url=new URL(route.request().url());reads.push(url);
   const matching=url.searchParams.get('node_kind')==='network_element'
     &&url.searchParams.get('site_id')===site&&url.searchParams.get('lifecycle')==='active';
   return route.fulfill({json:{nodes:matching?[initial[1]]:initial,next_cursor:null}});
 });
 await page.goto('http://127.0.0.1:4174/infrastructure');
 await expect(page.getByRole('listitem')).toHaveCount(2);
 const form=filters(page);
 await form.getByRole('textbox',{name:'Site UUID'}).fill(site);
 await form.getByRole('combobox',{name:'Node kind'}).selectOption('network_element');
 await form.getByRole('combobox',{name:'Lifecycle'}).selectOption('active');
 await form.getByRole('button',{name:'Apply owner filters'}).click();
 await expect(page.getByRole('listitem')).toHaveCount(1);
 await expect(page.getByRole('listitem').first()).toContainText('OWNER NE');
 await expect(form.getByRole('status')).toContainText('Filtered owner collection');
 expect(reads).toHaveLength(2);
 expect(reads[1].pathname).toBe(tree);
 expect(reads[1].searchParams.get('site_id')).toBe(site);
 expect(reads[1].searchParams.get('node_kind')).toBe('network_element');
 expect(reads[1].searchParams.get('lifecycle')).toBe('active');
 expect(reads[1].searchParams.has('cursor')).toBe(false);
 await expect(page.getByRole('region',{name:'Opened Network Element'})).toHaveCount(0);
});
test('Malformed UUID scope is rejected locally with zero new owner reads; Clear returns to the owner collection',async({page})=>{
 const reads=[];
 await page.route('**/api/v1/infrastructure/tree?**',route=>{
   reads.push(new URL(route.request().url()));
   return route.fulfill({json:{nodes:initial,next_cursor:null}});
 });
 await page.goto('http://127.0.0.1:4174/infrastructure');
 await expect(page.getByRole('listitem')).toHaveCount(2);
 const form=filters(page);
 await form.getByRole('textbox',{name:'Customer Organization UUID'}).fill('invalid');
 await form.getByRole('button',{name:'Apply owner filters'}).click();
 await expect(form.getByRole('alert')).toContainText('No owner request was sent');
 expect(reads).toHaveLength(1);
 await form.getByRole('textbox',{name:'Customer Organization UUID'}).fill(customer);
 await form.getByRole('button',{name:'Apply owner filters'}).click();
 await expect.poll(()=>reads.length).toBe(2);
 expect(reads[1].searchParams.get('customer_org_id')).toBe(customer);
 await form.getByRole('button',{name:'Clear filters'}).click();
 await expect.poll(()=>reads.length).toBe(3);
 expect(reads[2].searchParams.has('customer_org_id')).toBe(false);
 await expect(form.getByRole('status')).toContainText('All owner collection scopes');
});
test('Filtered owner pagination preserves query scope; Back reloads exact owner page, not cached DTOs',async({page})=>{
 const reads=[];
 let modified=false;
 const firstPage=Array.from({length:200},(_,i)=>node('network_element',id(i+10),'FIRST '+(i+10)));
 const cursor={version:1,query_id:'InfrastructureExplorerQuery',
   sort_registry_id:'InfrastructureExplorerQuery_ORDER_V1',
   last_key_tuple:[customer,site,4,id(209)],
   filter_fingerprint:createHash('sha256').update(JSON.stringify({
     customer_org_id:customer,node_kind:'network_element',site_id:site,
   })).digest('hex'),null_order:'NULLS_LAST'};
 await page.route('**/api/v1/objectives?**',route=>{
   const asOf=Number(new URL(route.request().url()).searchParams.get('as_of_utc'));
   return route.fulfill({json:{items:[],exact_total:0,continuation:null,as_of_utc:asOf}});
 });
 await page.route('**/api/v1/infrastructure/tree?**',route=>{
   const url=new URL(route.request().url());reads.push(url);
   if(!url.searchParams.has('node_kind'))return route.fulfill({json:{nodes:initial,next_cursor:null}});
   return route.fulfill({json:url.searchParams.has('cursor')
     ?{nodes:[node('network_element',id(210),modified?'CURRENT PAGE TWO':'PAGE TWO')],next_cursor:null}
     :{nodes:firstPage,next_cursor:cursor}});
 });
 await page.goto('http://127.0.0.1:4174/infrastructure');
 const form=filters(page);
 await form.getByRole('textbox',{name:'Customer Organization UUID'}).fill(customer);
 await form.getByRole('textbox',{name:'Site UUID'}).fill(site);
 await form.getByRole('combobox',{name:'Node kind'}).selectOption('network_element');
 await form.getByRole('button',{name:'Apply owner filters'}).click();
 await expect(page.getByRole('listitem')).toHaveCount(200);
 await page.getByRole('button',{name:'Next explorer page'}).click();
 await expect(page.getByRole('listitem')).toHaveCount(1);
 await expect(page.getByRole('listitem')).toContainText('PAGE TWO');
 const last=reads.at(-1);
 expect(last.searchParams.get('customer_org_id')).toBe(customer);
 expect(last.searchParams.get('site_id')).toBe(site);
 expect(last.searchParams.get('node_kind')).toBe('network_element');
 expect(JSON.parse(last.searchParams.get('cursor'))).toEqual(cursor);
 await page.getByRole('link',{name:'Objectives',exact:true}).click();modified=true;
 await page.goBack();
 await expect(page.getByRole('listitem')).toContainText('CURRENT PAGE TWO');
 expect(reads.at(-1).search).toBe(last.search);
 await expect(filters(page).getByRole('textbox',{name:'Site UUID'})).toHaveValue(site);
});

test('Filtered explorer never keeps a previously opened Network Element outside the new scope',async({page})=>{
 const requests=[];
 await page.route('**/api/v1/infrastructure/**',route=>{
   const url=new URL(route.request().url());requests.push(url.pathname);
   if(url.pathname===tree)return route.fulfill({json:{
     nodes:url.searchParams.get('node_kind')==='site'?[initial[0]]:initial,next_cursor:null,
   }});
   if(url.pathname==='/api/v1/infrastructure/network-elements/'+ne)
     return route.fulfill({json:{
       network_element_id:ne,revision:1,lifecycle:'active',operational_name:'OWNER NE',
       site:{kind:'site',id:site},customer_org_id:customer,
       placement:{rack_id:null,u_start:null,u_span:null,revision:1,explicit_unracked:true},
       model:null,cloud_deployment:null,primary_ip:null,ip_count:0,
       containment_parent:null,containment_child_count:0,device_reference_count:0,
       installed_component_count:0,warning_codes:[],
     }});
   return route.fulfill({status:404,json:{code:'UNEXPECTED_TEST_OWNER'}});
 });
 await page.goto('http://127.0.0.1:4174/infrastructure');
 await page.getByRole('listitem').filter({hasText:'OWNER NE'}).press('Enter');
 await expect(page.getByRole('region',{name:'Opened Network Element'})).toBeVisible();
 const form=filters(page);
 await form.getByRole('combobox',{name:'Node kind'}).selectOption('site');
 await form.getByRole('button',{name:'Apply owner filters'}).click();
 await expect(page.getByRole('listitem')).toHaveCount(1);
 await expect(page.getByRole('listitem')).toContainText('OWNER SITE');
 await expect(page.getByRole('region',{name:'Opened Network Element'})).toHaveCount(0);
 expect(requests.filter(path=>path==='/api/v1/infrastructure/network-elements/'+ne)).toHaveLength(1);
});

test('Accepted Site detail explicitly scopes owner explorer by exact Site and Customer',async({page})=>{
 const treeReads=[];
 await page.route('**/api/v1/infrastructure/**',route=>{
   const url=new URL(route.request().url());
   if(url.pathname===tree){
     treeReads.push(url);
     return route.fulfill({json:{nodes:url.searchParams.has('site_id')?[initial[0]]:initial,next_cursor:null}});
   }
   if(url.pathname==='/api/v1/infrastructure/sites/'+site){
     return route.fulfill({json:{
       site_id:site,revision:2,customer_org_id:customer,name:'OWNER SITE',
       address_text:'Recorded test address',lifecycle:'active',
       dispatch_location_id:id(4),room_count:1,rack_count:0,
       network_element_count:1,cloud_deployment_count:0,
       archive_blocker_count:0,duplicate_candidate_count:0,
     }});
   }
   return route.fulfill({status:404,json:{code:'UNEXPECTED_TEST_OWNER'}});
 });
 await page.goto('http://127.0.0.1:4174/infrastructure');
 await page.getByRole('listitem').filter({hasText:'OWNER SITE'}).press('Enter');
 const sitePanel=page.getByRole('region',{name:'Opened Site'});
 await expect(sitePanel).toContainText('OWNER SITE');
 await sitePanel.getByRole('button',{name:'Explore this Site in owner collection'}).click();
 await expect(page.getByRole('listitem')).toHaveCount(1);
 await expect(sitePanel).toHaveCount(0);
 expect(treeReads).toHaveLength(2);
 expect(treeReads[1].searchParams.get('site_id')).toBe(site);
 expect(treeReads[1].searchParams.get('customer_org_id')).toBe(customer);
 await expect(filters(page).getByRole('textbox',{name:'Site UUID'})).toHaveValue(site);
 await expect(filters(page).getByRole('textbox',{name:'Customer Organization UUID'})).toHaveValue(customer);
});
