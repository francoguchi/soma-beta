import {test,expect} from '@playwright/test';

// Testing the application in a non-UTC timezone catches visible ISO/Z regressions.
// Backend responses stay canonical whole UTC epoch seconds.
test.use({timezoneId:'America/Guayaquil'});
const ne='11111111-1111-4111-8111-111111111111';
const site='22222222-2222-4222-8222-222222222222';
const objective='33333333-3333-4333-8333-333333333333';
const at=1704067200; // 2024-01-01 00:00 UTC = 2023-12-31 19:00 in Guayaquil
const local=page=>page.evaluate(seconds=>
  new Date(seconds*1000).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}),at);
test('Objective owner envelope uses the browser timezone without changing the backend instant',async({page})=>{
  const asOfRequests=[];
  await page.route('**/api/v1/objectives?*',route=>{
    const u=new URL(route.request().url());
    const asOf=Number(u.searchParams.get('as_of_utc'));asOfRequests.push(asOf);
    return route.fulfill({json:{items:[{
      objective_id:objective,tracking_handle:'MW-00000001',revision:1,
      derived_envelope:{start_utc:at,end_utc:at+3600},
      aggregate_state:{execution_state:'planned',aggregate_outcome:null,actual_start_utc:null,
        actual_end_utc:null,attention_reason:null,included_task_count:1,excluded_task_count:0},
      read_time_projection:{as_of_utc:asOf,effective_review_state:'unreviewed',
        due_unreviewed:false,reason_codes:[]},archived:false,
    }],exact_total:1,continuation:null,as_of_utc:asOf}});
  });
  await page.goto('http://127.0.0.1:4174/objectives');
  const row=page.getByRole('listitem').filter({hasText:'MW-00000001'});
  await expect(row).toContainText(await local(page));
  await expect(row).toContainText('Membership-pinned Objective envelope');
  await expect(row).not.toContainText(new Date(at*1000).toISOString());
  await expect(page.getByText("Times below use this device's local time.",{exact:false})).toBeVisible();
  expect(asOfRequests).toHaveLength(1);
});
test('Infrastructure chronology and workbook history both render browser-local time',async({page})=>{
  const historyReads=[];
  await page.route('**/api/v1/infrastructure/**',route=>{
    const u=new URL(route.request().url());
    if(u.pathname==='/api/v1/infrastructure/tree')return route.fulfill({json:{nodes:[{
      kind:'network_element',id:ne,label:'Local-time NE',parent_context_id:site,
      lifecycle:'active',warning_codes:[],
    }],next_cursor:null}});
    if(u.pathname==='/api/v1/infrastructure/network-elements/'+ne)return route.fulfill({json:{
      network_element_id:ne,operational_name:'Local-time NE',revision:1,lifecycle:'active',
      site:{kind:'site',id:site},customer_org_id:site,
      placement:{rack_id:null,u_start:null,u_span:null,revision:1,explicit_unracked:true},
      model:null,cloud_deployment:null,primary_ip:null,ip_count:0,
      containment_parent:null,containment_child_count:0,device_reference_count:0,
      installed_component_count:0,warning_codes:[],
    }});
    if(u.pathname==='/api/v1/infrastructure/history'){
      historyReads.push('events');
      const nil={kind:'null',text_value:null,integer_value:null,boolean_value:null,entity_ref:null};
      return route.fulfill({json:{events:[{
        event_id:site,event_kind:'name_confirmed',recorded_at_utc:at,
        effective_at_utc:null,command_id:ne,
        summary:{changes:[{field:'operational_name',prior:nil,new:nil}],
          reason_code:null,warning_codes:[]},
      }],next_cursor:null}});
    }
    if(u.pathname==='/api/v1/infrastructure/workbooks/history'){
      historyReads.push('workbooks');
      return route.fulfill({json:{items:[{
        kind:'export',id:site,timestamp_utc:at,state_or_mode:'discovery',
        filename:'local-time-workbook.xlsx',sha256:'a'.repeat(64),
      }],next_cursor:null}});
    }
    return route.fulfill({status:404,json:{error:'unknown owner query'}});
  });
  await page.goto('http://127.0.0.1:4174/infrastructure');
  await page.getByRole('listitem').first().press('Enter');
  await page.getByRole('tab',{name:'History'}).click();
  const history=page.getByRole('tabpanel',{name:'History'});
  await expect(history).toContainText(await local(page));
  await expect(history).not.toContainText(new Date(at*1000).toISOString());
  await page.getByRole('tab',{name:'Workbook Activity'}).click();
  const workbook=page.getByRole('region',{name:'Infrastructure workbook activity'});
  await expect(workbook).toContainText(await local(page));
  await expect(workbook).not.toContainText(new Date(at*1000).toISOString());
  expect(historyReads).toEqual(['events','workbooks']);
});

test('Inventory attention renders its authoritative as-of instant as browser-local time',async({page})=>{
  let asOf=null;
  await page.route('**/api/v1/inventory/stock?*',route=>route.fulfill({json:{
    items:[],continuation:null,exact_total:0,
  }}));
  await page.route('**/api/v1/inventory/attention?*',route=>{
    asOf=Number(new URL(route.request().url()).searchParams.get('as_of_utc'));
    return route.fulfill({json:{items:[],continuation:null,exact_total:0,as_of_utc:asOf}});
  });
  await page.goto('http://127.0.0.1:4174/inventory');
  const attention=page.getByRole('region',{name:'Inventory Needs Attention'});
  await expect(attention).toContainText('Evaluated at');
  expect(asOf).not.toBeNull();
  await expect(attention).toContainText(await page.evaluate(s=>
    new Date(s*1000).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}),asOf));
  await expect(attention).not.toContainText(new Date(asOf*1000).toISOString());
});
test('RFC provider time evidence displays locally without changing source chronology',async({page})=>{
  const ticket='44444444-4444-4444-8444-444444444444';
  await page.route('**/api/v1/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname.endsWith('/lifecycle')) {
      const source={
        status_text:'Synthetic provider status',status_class:'implement_eligible',
        status_authority:'enhanced_rfc',status_evidence_id:'evidence-status',
        revision:2,external_created_at_utc:at,
        external_created_evidence_id:'evidence-created',
        last_update_utc:at,last_update_evidence_id:'evidence-updated',
      };
      for(const [field,proof] of [
        ['summary_text','summary_evidence_id'],['creator_text','creator_evidence_id'],
        ['customer_account_number_text','customer_account_number_evidence_id'],
        ['customer_account_name_text','customer_account_name_evidence_id'],
        ['severity_text','severity_evidence_id'],
        ['owner_external_id_text','owner_external_id_evidence_id'],
        ['owner_name_text','owner_name_evidence_id'],
        ['l1_handler_name_text','l1_handler_name_evidence_id'],
        ['l2_handler_name_text','l2_handler_name_evidence_id'],
      ]){source[field]=null;source[proof]=null;}
      return route.fulfill({json:{
        rfc_id:ticket,accepted_source_state:source,local_archive_state:'active',
        terminal_epoch_id:null,warnings:[],
      }});
    }
    if(pathname==='/api/v1/tickets/rfcs/'+ticket)return route.fulfill({json:{
      rfc_id:ticket,rfc_no:'NC00000000000001',revision:1,hierarchy_role:'standalone',
      customer_org_id:null,local_archive_state:'active',direct_service_request_count:0,
      device_reference_count:0,subordinate_count:0,warnings:[],
    }});
    return route.fulfill({status:503,json:{code:'SYNTHETIC_UNAVAILABLE'}});
  });
  await page.goto('http://127.0.0.1:4174/tickets/rfc/'+ticket);
  const panel=page.getByRole('region',{name:'RFC accepted source and lifecycle'});
  await expect(panel).toContainText(await local(page));
  await expect(panel).toContainText('External creation (local time)');
  await expect(panel).toContainText('Last source update (local time)');
  await expect(panel).not.toContainText(new Date(at*1000).toISOString());
});
