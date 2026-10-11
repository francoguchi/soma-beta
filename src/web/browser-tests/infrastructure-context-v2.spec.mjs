import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
const room='11111111-1111-4111-8111-111111111111';
const cloud='22222222-2222-4222-8222-222222222222';
const site='33333333-3333-4333-8333-333333333333';
const cmd='44444444-4444-4444-8444-444444444444';
const id=n=>'55555555-5555-4555-8555-'+String(n).padStart(12,'0');
const row=(kind,n,at)=>({event_id:id(n),event_kind:kind==='room'?'room_moved':'cloud_assigned',
  recorded_at_utc:at,effective_at_utc:null,command_id:cmd,
  summary:{changes:[],reason_code:null,warning_codes:[]}});
const cursor=(kind,n,at)=>({
  version:1,query_id:'InfrastructureHistoryQuery',sort_registry_id:'InfrastructureHistoryQuery_ORDER_V1',
  last_key_tuple:[at,id(n)],
  filter_fingerprint:createHash('sha256').update(JSON.stringify({
    target_id:kind==='room'?room:cloud,target_kind:kind,
  })).digest('hex'),null_order:'NOT_APPLICABLE',
});
async function fixtures(page,resolve,requests){
  await page.route('**/api/v1/infrastructure/**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/v1/infrastructure/tree')return route.fulfill({json:{
      nodes:[
        {kind:'room',id:room,label:'Room R',parent_context_id:site,lifecycle:'active',warning_codes:[]},
        {kind:'cloud_deployment',id:cloud,label:'Cloud C',parent_context_id:site,
          lifecycle:'active',warning_codes:[]},
      ],next_cursor:null}});
    if(url.pathname==='/api/v1/infrastructure/history'){
      requests.push(url);
      return route.fulfill({json:resolve(url)});
    }
    return route.fulfill({status:404,json:{code:'FORBIDDEN_TEST_ROUTE'}});
  });
}
const open=async(page,label)=>{
  await page.goto('http://127.0.0.1:4174/infrastructure');
  await page.getByRole('listitem').filter({hasText:label}).press('Enter');
  return page.getByRole('region',{name:'Opened Infrastructure context'});
};
test('Room and Cloud are separate exact owner history reads without invented detail endpoints',async({page})=>{
  const calls=[];
  await fixtures(page,u=>({events:[row(u.searchParams.get('target_kind'),1,1700000000)],next_cursor:null}),calls);
  await page.goto('http://127.0.0.1:4174/infrastructure');
  const roomItem=page.getByRole('listitem').filter({hasText:'Room R'});
  await roomItem.click();expect(calls).toHaveLength(0);
  await roomItem.press('Enter');
  const panel=page.getByRole('region',{name:'Opened Infrastructure context'});
  await expect(panel).toContainText('Room context');
  await expect(panel.getByRole('table',{name:'Infrastructure context history (local time)'})).toContainText('room_moved');
  expect(calls.at(-1).searchParams.get('target_kind')).toBe('room');
  expect(calls.at(-1).searchParams.get('target_id')).toBe(room);
  await page.getByRole('listitem').filter({hasText:'Cloud C'}).press('Enter');
  await expect(panel).toContainText('Cloud Deployment context');
  await expect(panel.getByRole('table',{name:'Infrastructure context history (local time)'})).toContainText('cloud_assigned');
  expect(calls.at(-1).searchParams.get('target_kind')).toBe('cloud_deployment');
  expect(calls.at(-1).searchParams.get('target_id')).toBe(cloud);
});
test('Room owner history uses strict descending timestamp and exact continuation identity',async({page})=>{
  const calls=[];
  await fixtures(page,u=>u.searchParams.has('cursor')
    ?{events:[row('room',6,1699999994)],next_cursor:null}
    :{events:[1,2,3,4,5].map(n=>row('room',n,1700000000-n)),next_cursor:cursor('room',5,1699999995)},calls);
  const panel=await open(page,'Room R');
  await expect(panel).toContainText('5 historical events');
  await panel.getByRole('button',{name:'Next page'}).click();
  await expect(panel).toContainText('1 historical events');
  expect(JSON.parse(calls.at(-1).searchParams.get('cursor'))).toEqual(cursor('room',5,1699999995));
  await panel.getByRole('button',{name:'Previous page'}).click();
  await expect(panel).toContainText('5 historical events');
});
test('Foreign context continuation or unordered evidence never creates a plausible Room history',async({page})=>{
  const calls=[];
  await fixtures(page,u=>({events:[1,2,3,4,5].map(n=>row('room',n,1700000000-n)),
    next_cursor:{...cursor('cloud_deployment',5,1699999995)}}),calls);
  const panel=await open(page,'Room R');
  await expect(panel.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(panel).not.toContainText('room_moved');
  expect(calls).toHaveLength(1);
});
