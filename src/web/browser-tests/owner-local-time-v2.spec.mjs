import {test,expect} from '@playwright/test';

// Testing the application in a non-UTC timezone catches visible ISO/Z regressions.
// Backend responses stay canonical whole UTC epoch seconds.
test.use({timezoneId:'America/Guayaquil'});
const ne='11111111-1111-4111-8111-111111111111';
const site='22222222-2222-4222-8222-222222222222';
const objective='33333333-3333-4333-8333-333333333333';
const at=1704067200; // 2024-01-01 00:00 UTC = 2023-12-31 19:00 in Guayaquil
const local=()=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Guayaquil',
  dateStyle:'medium',timeStyle:'short'}).format(new Date(at*1000));
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
  await expect(row).toContainText(local());
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
  await expect(history).toContainText(local());
  await expect(history).not.toContainText(new Date(at*1000).toISOString());
  await page.getByRole('tab',{name:'Workbook Activity'}).click();
  const workbook=page.getByRole('region',{name:'Infrastructure workbook activity'});
  await expect(workbook).toContainText(local());
  await expect(workbook).not.toContainText(new Date(at*1000).toISOString());
  expect(historyReads).toEqual(['events','workbooks']);
});
