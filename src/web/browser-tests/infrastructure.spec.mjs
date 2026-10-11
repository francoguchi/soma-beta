import {test,expect} from '@playwright/test';
const id='33333333-3333-4333-8333-333333333333';
const site='44444444-4444-4444-8444-444444444444';
const cursor=(query,key,null_order)=>({version:1,query_id:query,sort_registry_id:query+'_ORDER_V1',last_key_tuple:key,filter_fingerprint:'a'.repeat(64),null_order});
test('Infrastructure preserves contextual identity, explicit opening and physical/containment/cloud separation at narrow width',async({page})=>{
  let reads=0;
  await page.route('**/api/v1/infrastructure/**',route=>{
    reads++;const url=new URL(route.request().url());
    if(url.pathname.endsWith('/tree'))return route.fulfill({json:{nodes:[
      {kind:'network_element',id,label:'Synthetic NE Alpha',parent_context_id:null,lifecycle:'active',warning_codes:[]},
      {kind:'containment',id,label:'Synthetic NE Alpha containment context',parent_context_id:site,lifecycle:'active',warning_codes:[]}],next_cursor:cursor('InfrastructureExplorerQuery',[site,site,5,id],'NULLS_LAST')}});
    if(url.pathname.endsWith('/components')){
      expect(url.searchParams.get('limit')).toBe('200');return route.fulfill({json:{items:[{installed_component_id:site,state:'removed',bom_code:'SYNTHETIC-BOM',
        manufacturer_serial:'SYNTHETIC-SERIAL',slot_label:'Synthetic slot 1',condition:'removed',device_part_unit_id:null,physical_consequence_id:null}],next_cursor:cursor('InstalledComponentQuery',[null,site],'NULLS_LAST')}});
    }
    if(url.pathname.endsWith('/history')){
      expect(url.searchParams.get('limit')).toBe('5');
      const text=value=>({kind:'text',text_value:value,integer_value:null,boolean_value:null,entity_ref:null});
      return route.fulfill({json:{events:[{event_id:site,event_kind:'synthetic_description_updated',recorded_at_utc:1000,effective_at_utc:null,command_id:id,
        summary:{changes:[{field:'operational_name',prior:text('Synthetic old name'),new:text('Synthetic new name')}],reason_code:null,warning_codes:[]}}],next_cursor:null}});
    }
    return route.fulfill({json:{network_element_id:id,operational_name:'Synthetic NE Alpha',revision:2,lifecycle:'active',site:{kind:'site',id:site},customer_org_id:site,
      placement:{rack_id:null,u_start:null,u_span:null,revision:1,explicit_unracked:true},model:null,cloud_deployment:{kind:'cloud_deployment',id:site},primary_ip:null,
      ip_count:0,containment_parent:{kind:'network_element',id:site},containment_child_count:0,device_reference_count:1,installed_component_count:1,
      warning_codes:['SYNTHETIC_WARNING']}});
  });
  await page.setViewportSize({width:480,height:900});await page.goto('http://127.0.0.1:4174/infrastructure');
  const rows=page.getByRole('listitem');await expect(rows).toHaveCount(2);await rows.first().click();
  await expect(page.getByRole('region',{name:'Opened Network Element'})).toHaveCount(0);
  await rows.first().press('Enter');await expect(page.getByRole('heading',{name:'Synthetic NE Alpha',exact:true})).toBeVisible();
  await expect(page.getByRole('tab')).toHaveText(['Summary','Placement','Components','IP Addresses','Relationships','History','Workbook Activity']);
  await page.getByRole('tab',{name:'Placement',exact:true}).click();await expect(page.getByText('Explicitly Unracked', {exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Relationships',exact:true}).click();await expect(page.getByRole('heading',{name:'Containment',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Cloud assignment',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'IP Addresses',exact:true}).click();await expect(page.getByRole('heading',{name:'Descriptive IP inventory'})).toBeVisible();
  await expect(page.getByText('No automatic primary promotion is implied.',{exact:false})).toBeVisible();
  await page.getByRole('tab',{name:'Components',exact:true}).click();await expect(page.locator('tbody tr').filter({hasText:'SYNTHETIC-SERIAL'})).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Next page'})).toBeVisible();expect(reads).toBe(3);
  await page.getByRole('tab',{name:'History',exact:true}).click();await expect(page.getByText('operational_name: Synthetic old name → Synthetic new name')).toBeVisible();
  expect(reads).toBe(4); // History read occurs only after opening its tab.
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('Infrastructure oversized owner explorer is rejected with bounded error',async({page})=>{
  await page.route('**/api/v1/infrastructure/tree?**',route=>route.fulfill({json:{nodes:Array.from({length:201},()=>({kind:'network_element',id,label:'Synthetic row',parent_context_id:null,lifecycle:'active',warning_codes:[]})),next_cursor:null}}));
  await page.goto('http://127.0.0.1:4174/infrastructure');await expect(page.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(page.getByRole('listitem')).toHaveCount(0);
});

test('Malformed Network Element history changes fail closed rather than showing a plausible event',async({page})=>{
 const ne='11111111-1111-4111-8111-111111111111';
 const site='22222222-2222-4222-8222-222222222222';
 await page.route('**/api/v1/infrastructure/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/tree'))return route.fulfill({json:{nodes:[
   {kind:'network_element',id:ne,label:'NE with corrupt history',parent_context_id:null,
    lifecycle:'active',warning_codes:[]}],next_cursor:null}});
  if(url.pathname.endsWith('/history'))return route.fulfill({json:{events:[{
   event_id:site,event_kind:'corrupt_record',recorded_at_utc:1700000000,
   effective_at_utc:null,command_id:ne,
   summary:{reason_code:null,warning_codes:[],changes:[{
    field:'rack_id',prior:{kind:'null',text_value:null,integer_value:null,
      boolean_value:null,entity_ref:null},
    new:{kind:'boolean',text_value:'forged-value',integer_value:null,
      boolean_value:true,entity_ref:null},
   }]},
  }],next_cursor:null}});
  if(url.pathname.endsWith('/'+ne))return route.fulfill({json:{
   network_element_id:ne,operational_name:'NE with corrupt history',revision:1,lifecycle:'active',
   site:{kind:'site',id:site},customer_org_id:site,
   placement:{rack_id:null,u_start:null,u_span:null,revision:1,explicit_unracked:true},
   model:null,cloud_deployment:null,primary_ip:null,ip_count:0,
   containment_parent:null,containment_child_count:0,device_reference_count:0,
   installed_component_count:0,warning_codes:[],
  }});
  return route.fulfill({status:404,json:{code:'UNEXPECTED_OWNER_READ'}});
 });
 await page.goto('http://127.0.0.1:4174/infrastructure');
 await page.getByRole('listitem').first().press('Enter');
 await page.getByRole('tab',{name:'History',exact:true}).click();
 const tab=page.getByRole('tabpanel',{name:'History'});
 await expect(tab.getByRole('alert')).toContainText('owner projection could not be rendered');
 await expect(tab).not.toContainText('corrupt_record');
});
