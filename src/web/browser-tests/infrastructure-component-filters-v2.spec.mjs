import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
const ne='11111111-1111-4111-8111-111111111111',site='22222222-2222-4222-8222-222222222222';
const componentId=n=>'33333333-3333-4333-8333-'+String(n).padStart(12,'0');
const point={
 network_element_id:ne,revision:1,lifecycle:'active',operational_name:'COMPONENT OWNER NE',
 site:{kind:'site',id:site},customer_org_id:site,
 placement:{rack_id:null,u_start:null,u_span:null,revision:1,explicit_unracked:true},
 model:null,cloud_deployment:null,primary_ip:null,ip_count:0,containment_parent:null,
 containment_child_count:0,device_reference_count:0,installed_component_count:201,warning_codes:[],
};
const comp=(n,state='installed')=>({
 installed_component_id:componentId(n),state,bom_code:'BOM-'+n,
 manufacturer_serial:'SERIAL-'+n,slot_label:null,
 condition:state==='removed'?'removed':'normal',
 device_part_unit_id:null,physical_consequence_id:null,
});
const panel=page=>page.getByRole('region',{name:'Opened Network Element'});
const form=page=>page.getByRole('form',{name:'Installed Component owner filters'});
const table=page=>panel(page).getByRole('table',{name:'Installed Component identities and physical evidence'});
async function fixture(page,resolve,reads){
 await page.route('**/api/v1/infrastructure/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/v1/infrastructure/tree')return route.fulfill({json:{nodes:[
    {kind:'network_element',id:ne,label:'COMPONENT OWNER NE',parent_context_id:null,lifecycle:'active',warning_codes:[]},
  ],next_cursor:null}});
  if(url.pathname==='/api/v1/infrastructure/network-elements/'+ne)
    return route.fulfill({json:point});
  if(url.pathname==='/api/v1/infrastructure/network-elements/'+ne+'/components'){
    reads.push(url);return route.fulfill({json:resolve(url)});
  }
  return route.fulfill({status:404,json:{code:'UNEXPECTED_COMPONENT_OWNER'}});
 });
 await page.goto('http://127.0.0.1:4174/infrastructure');
 await page.getByRole('listitem').first().press('Enter');
 await panel(page).getByRole('tab',{name:'Components'}).click();
}
test('Installed Component exact state and match keys issue only current owner queries',async({page})=>{
 const reads=[];
 await fixture(page,url=>url.searchParams.has('state')
  ?{items:[comp(2,'removed')],next_cursor:null}
  :{items:[comp(1)],next_cursor:null},reads);
 await expect(table(page)).toContainText('SERIAL-1');
 await form(page).getByRole('combobox',{name:'Component state'}).selectOption('removed');
 await form(page).getByRole('textbox',{name:'BOM match key (exact)'}).fill('match-key-1');
 await form(page).getByRole('textbox',{name:'Slot match key (exact)'}).fill('slot/A');
 await form(page).getByRole('button',{name:'Apply component filters'}).click();
 await expect(table(page)).toContainText('SERIAL-2');
 await expect(table(page)).not.toContainText('SERIAL-1');
 expect(reads).toHaveLength(2);
 expect(reads[1].searchParams.get('state')).toBe('removed');
 expect(reads[1].searchParams.get('bom_key')).toBe('match-key-1');
 expect(reads[1].searchParams.get('slot_match_key')).toBe('slot/A');
 expect(reads[1].searchParams.has('cursor')).toBe(false);
 await form(page).getByRole('button',{name:'Clear component filters'}).click();
 await expect(table(page)).toContainText('SERIAL-1');
 expect(reads.at(-1).searchParams.has('state')).toBe(false);
});
test('Oversized UTF-8 match key refuses component owner read rather than truncating',async({page})=>{
 const reads=[];
 await fixture(page,()=>({items:[],next_cursor:null}),reads);
 const controls=form(page);
 await controls.getByRole('textbox',{name:'Slot match key (exact)'}).fill('界'.repeat(129));
 await controls.getByRole('button',{name:'Apply component filters'}).click();
 await expect(controls.getByRole('alert')).toContainText('No owner read was sent');
 expect(reads).toHaveLength(1);
});
test('Filtered Installed Component continuation preserves complete owner query filters',async({page})=>{
 const reads=[];
 const cursor={version:1,query_id:'InstalledComponentQuery',
   sort_registry_id:'InstalledComponentQuery_ORDER_V1',
   last_key_tuple:[null,componentId(200)],
   filter_fingerprint:createHash('sha256').update(JSON.stringify({
     network_element_id:ne,state:'installed',
   })).digest('hex'),null_order:'NULLS_LAST'};
 await fixture(page,url=>url.searchParams.has('cursor')
  ?{items:[comp(201)],next_cursor:null}
  :url.searchParams.get('state')==='installed'
    ?{items:Array.from({length:200},(_,i)=>comp(i+1)),next_cursor:cursor}
    :{items:[],next_cursor:null},reads);
 await form(page).getByRole('combobox',{name:'Component state'}).selectOption('installed');
 await form(page).getByRole('button',{name:'Apply component filters'}).click();
 await expect(table(page)).toContainText('SERIAL-200');
 await panel(page).getByRole('button',{name:'Next page',exact:true}).click();
 await expect(table(page)).toContainText('SERIAL-201');
 const last=reads.at(-1);
 expect(last.searchParams.get('state')).toBe('installed');
 expect(JSON.parse(last.searchParams.get('cursor'))).toEqual(cursor);
 await expect(form(page).getByRole('combobox',{name:'Component state'})).toHaveValue('installed');
 await form(page).getByRole('button',{name:'First component owner page'}).click();
 await expect(table(page)).toContainText('SERIAL-200');
 const restarted=reads.at(-1);
 expect(restarted.searchParams.get('state')).toBe('installed');
 expect(restarted.searchParams.has('cursor')).toBe(false);
});

test('Corrupt Installed Component owner row fails closed without displaying its physical evidence',async({page})=>{
 const reads=[];
 await fixture(page,()=>({items:[{
   ...comp(1),device_part_unit_id:'not-an-owner-uuid',
 }],next_cursor:null}),reads);
 await expect(panel(page).getByRole('alert'))
   .toContainText('owner projection could not be rendered');
 await expect(table(page)).toHaveCount(0);
 await expect(panel(page)).not.toContainText('SERIAL-1');
 expect(reads).toHaveLength(1);
});
