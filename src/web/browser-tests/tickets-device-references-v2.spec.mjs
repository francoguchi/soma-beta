import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
const sr='11111111-1111-4111-8111-111111111111';
const rfc='22222222-2222-4222-8222-222222222222';
const a='33333333-3333-4333-8333-333333333333';
const b='44444444-4444-4444-8444-444444444444';
const row=(id,name)=>({device_reference_id:id,operational_name:name,revision:1,
  registered_network_element_id:null});
const cursor=(type,id,last)=>({version:1,query_id:'ListTicketDeviceReferences',
  sort_registry_id:'TICKET_DEVICE_REFERENCE_ID_ASC_V1',last_key_tuple:[last],
  filter_fingerprint:createHash('sha256').update(JSON.stringify({
    schema:'SOMA_TICKET_DEVICE_REFERENCE_FILTER_V1',ticket_type:type,ticket_id:id,
  })).digest('hex'),null_order:'not_applicable'});

test('SR Devices reads bounded direct owner links with selected details and exact paging',async({page})=>{
  const visited=[];
  await page.route('**/api/v1/tickets/service_request/'+sr+'/devices?*',route=>{
    const u=new URL(route.request().url());visited.push(u);
    return route.fulfill({json:u.searchParams.has('cursor')
      ?{items:[row(b,'rtr-B')],continuation:null}
      :{items:[row(a,'rtr-A')],continuation:cursor('service_request',sr,a)}});
  });
  await page.goto('http://127.0.0.1:4174/tickets/sr/'+sr);
  await page.getByRole('tab',{name:'Devices',exact:true}).click();
  const panel=page.getByRole('region',{name:'SR Device References'});
  await expect(panel.getByRole('button',{name:'rtr-A'})).toBeVisible();
  await expect(panel.getByRole('complementary',{name:'Selected Device Reference'})).toHaveCount(0);
  await panel.getByRole('button',{name:'rtr-A'}).click();
  await expect(panel.getByRole('complementary',{name:'Selected Device Reference'})).toBeVisible();
  await expect(panel.getByText('No accepted Network Element resolution supplied')).toBeVisible();
  await panel.getByRole('button',{name:'Next page'}).click();
  await expect(panel.getByRole('button',{name:'rtr-B'})).toBeVisible();
  await expect(panel.getByRole('complementary',{name:'Selected Device Reference'})).toHaveCount(0);
  expect(JSON.parse(visited[1].searchParams.get('cursor'))).toEqual(cursor('service_request',sr,a));
  await panel.getByRole('button',{name:'Previous page'}).click();
  await expect(panel.getByRole('button',{name:'rtr-A'})).toBeVisible();
});

test('RFC direct devices do not claim subordinate or governing-root inheritance',async({page})=>{
  await page.route('**/api/v1/tickets/rfc/'+rfc+'/devices?*',route=>route.fulfill({json:{
    items:[],continuation:null,
  }}));
  await page.goto('http://127.0.0.1:4174/tickets/rfc/'+rfc);
  await page.getByRole('tab',{name:'Service Requests and Devices'}).click();
  const panel=page.getByRole('region',{name:'RFC direct Device References'});
  await expect(panel.getByText('No directly linked active Device References in this page.')).toBeVisible();
  await expect(panel.getByText(/Root\/subordinate inherited context is not implied/)).toBeVisible();
});

test('invalid owner Device Reference pages fail closed without displaying rows',async({page})=>{
  await page.route('**/api/v1/tickets/service_request/'+sr+'/devices?*',route=>route.fulfill({json:{
    items:[{...row(a,'BAD DEVICE'),registered_network_element_id:'not-a-network-element'}],
    continuation:null,
  }}));
  await page.goto('http://127.0.0.1:4174/tickets/sr/'+sr);
  await page.getByRole('tab',{name:'Devices'}).click();
  const panel=page.getByRole('region',{name:'SR Device References'});
  await expect(panel.getByText('The owner projection could not be rendered.',{exact:false})).toBeVisible();
  await expect(panel.getByText('BAD DEVICE')).toHaveCount(0);
});
