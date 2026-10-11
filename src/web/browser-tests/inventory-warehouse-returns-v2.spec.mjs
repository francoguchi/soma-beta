import {test,expect} from '@playwright/test';

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const queueRow=(n,state='submitted_awaiting_receipt')=>({
  fault_tag_membership_id:id(n),fault_tag_id:id(9001),rma_id:id(9002),
  state,device_part_unit_id:null,spare_part_unit_id:null,revision:1,
});
const openReturn=(n)=>({
  rma_id:id(n),device_part_unit_id:id(9003),spare_part_unit_id:null,
  physical_consequence_id:id(9004),revision:1,current_c10:'C1234567890',
});
async function base(page){
  await page.route('**/api/v1/inventory/stock?*',route=>route.fulfill({json:{
    items:[],continuation:null,exact_total:0,
  }}));
  await page.route('**/api/v1/inventory/attention?*',route=>{
    const at=Number(new URL(route.request().url()).searchParams.get('as_of_utc'));
    return route.fulfill({json:{items:[],continuation:null,exact_total:0,as_of_utc:at}});
  });
}
async function openDesk(page){
  await page.goto('http://127.0.0.1:4174/inventory');
  const desk=page.getByRole('region',{name:'Warehouse Returns Desk'});
  await desk.getByRole('button',{name:'Inspect Warehouse and returns'}).click();
  return desk.getByRole('region',{name:'Return and Warehouse Operations'});
}
test('Warehouse and return eligibility reads stay independently selection-gated',async({page})=>{
  await base(page);const calls=[];
  await page.route('**/api/v1/inventory/warehouse/queue?*',route=>{
    calls.push('warehouse');return route.fulfill({json:{
      items:[queueRow(1)],continuation:null,
    }});
  });
  await page.route('**/api/v1/inventory/fault-tag-memberships/eligible?*',route=>{
    calls.push('eligible');return route.fulfill({json:{
      items:[openReturn(2)],continuation:null,
    }});
  });
  await page.goto('http://127.0.0.1:4174/inventory');
  const root=page.getByRole('region',{name:'Warehouse Returns Desk'});
  expect(calls).toEqual([]);
  await root.getByRole('button',{name:'Inspect Warehouse and returns'}).click();
  expect(calls).toEqual([]);
  const desk=root.getByRole('region',{name:'Return and Warehouse Operations'});
  await desk.getByRole('button',{name:'Inspect warehouse membership queue'}).click();
  const queue=desk.getByRole('region',{name:'Warehouse membership queue'});
  await expect(queue).toContainText(id(1));
  await expect(queue).toContainText('submitted awaiting receipt');
  expect(calls).toEqual(['warehouse']);
  await desk.getByRole('button',{name:'Inspect open return obligations'}).click();
  const returns=desk.getByRole('region',{name:'Open return obligation candidates'});
  await expect(returns).toContainText('C1234567890');
  expect(calls).toEqual(['warehouse','eligible']);
  for(const name of ['Record warehouse receipt','Accept final warehouse decision','Submit Fault Tag']){
    await expect(page.getByRole('button',{name})).toHaveCount(0);
  }
});
test('Warehouse queue paginates strictly by last submitted membership UUID',async({page})=>{
  await base(page);const urls=[];
  await page.route('**/api/v1/inventory/warehouse/queue?*',route=>{
    const u=new URL(route.request().url());urls.push(u);
    return route.fulfill({json:u.searchParams.has('after_membership_id')
      ?{items:[queueRow(26,'warehouse_received')],continuation:null}
      :{items:Array.from({length:25},(_,i)=>queueRow(i+1)),continuation:id(25)}});
  });
  const desk=await openDesk(page);
  await desk.getByRole('button',{name:'Inspect warehouse membership queue'}).click();
  const queue=desk.getByRole('region',{name:'Warehouse membership queue'});
  await expect(queue.getByText('25 owner records on this page; the endpoint does not report a total.')).toBeVisible();
  await queue.getByRole('button',{name:'Next page'}).click();
  await expect(queue).toContainText('warehouse received');
  expect(urls.at(-1).searchParams.get('after_membership_id')).toBe(id(25));
  await queue.getByRole('button',{name:'Previous page'}).click();
  await expect(queue).toContainText(id(1));
  expect(urls.length).toBe(3);
});
test('Open return obligations use their own RMA seek key, not membership continuation',async({page})=>{
  await base(page);const urls=[];
  await page.route('**/api/v1/inventory/fault-tag-memberships/eligible?*',route=>{
    const u=new URL(route.request().url());urls.push(u);
    return route.fulfill({json:u.searchParams.has('after_rma_id')
      ?{items:[openReturn(26)],continuation:null}
      :{items:Array.from({length:25},(_,i)=>openReturn(i+1)),continuation:id(25)}});
  });
  const desk=await openDesk(page);
  await desk.getByRole('button',{name:'Inspect open return obligations'}).click();
  const candidates=desk.getByRole('region',{name:'Open return obligation candidates'});
  await expect(candidates).toContainText(id(1));
  await candidates.getByRole('button',{name:'Next page'}).click();
  await expect(candidates).toContainText(id(26));
  expect(urls.at(-1).searchParams.get('after_rma_id')).toBe(id(25));
  expect(urls.at(-1).searchParams.has('after_membership_id')).toBe(false);
});
test('Invalid warehouse continuation suppresses all untrusted stage evidence',async({page})=>{
  await base(page);
  await page.route('**/api/v1/inventory/warehouse/queue?*',route=>route.fulfill({json:{
    items:[{...queueRow(1),state:'UNTRUSTED-STAGE'}],
    continuation:id(999),
  }}));
  const desk=await openDesk(page);
  await desk.getByRole('button',{name:'Inspect warehouse membership queue'}).click();
  const queue=desk.getByRole('region',{name:'Warehouse membership queue'});
  await expect(queue.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(queue).not.toContainText('UNTRUSTED-STAGE');
});
test('Eligible list rejects foreign physical evidence and never presents a fabricated candidate',async({page})=>{
  await base(page);
  await page.route('**/api/v1/inventory/fault-tag-memberships/eligible?*',route=>route.fulfill({json:{
    items:[{...openReturn(1),physical_consequence_id:'FAKE-UNIT',
      current_c10:'UNTRUSTED-C10'}],continuation:null,
  }}));
  const desk=await openDesk(page);
  await desk.getByRole('button',{name:'Inspect open return obligations'}).click();
  const candidates=desk.getByRole('region',{name:'Open return obligation candidates'});
  await expect(candidates.getByRole('alert')).toContainText('owner projection could not be rendered');
  await expect(candidates).not.toContainText('UNTRUSTED-C10');
});
