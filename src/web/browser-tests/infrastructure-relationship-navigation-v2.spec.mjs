import {test,expect} from '@playwright/test';

const uuid=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const ne=uuid(1),parent=uuid(2),site=uuid(3),customer=uuid(4),rack=uuid(5),cloud=uuid(6);
const detail=id=>({
  network_element_id:id,revision:2,lifecycle:'active',
  operational_name:id===ne?'SOURCE NETWORK ELEMENT':'ACCEPTED CONTAINMENT PARENT',
  site:{kind:'site',id:site},customer_org_id:customer,
  placement:{rack_id:id===ne?rack:null,u_start:id===ne?1:null,u_span:id===ne?1:null,
    revision:2,explicit_unracked:id!==ne},
  model:null,cloud_deployment:id===ne?{kind:'cloud_deployment',id:cloud}:null,
  primary_ip:null,ip_count:0,containment_parent:id===ne?{kind:'network_element',id:parent}:null,
  containment_child_count:0,device_reference_count:0,installed_component_count:0,warning_codes:[],
});
const sitePoint={
  site_id:site,revision:1,customer_org_id:customer,name:'SITE OWNER',
  address_text:'Recorded site address',lifecycle:'active',dispatch_location_id:uuid(7),
  room_count:1,rack_count:1,network_element_count:2,
  cloud_deployment_count:1,archive_blocker_count:0,duplicate_candidate_count:0,
};
async function fixture(page,requests){
  await page.route('**/api/v1/infrastructure/**',route=>{
    const url=new URL(route.request().url());requests.push({path:url.pathname,search:url.search,method:route.request().method()});
    if(url.pathname==='/api/v1/infrastructure/tree')
      return route.fulfill({json:{nodes:[{kind:'network_element',id:ne,label:'SOURCE NETWORK ELEMENT',
        parent_context_id:rack,lifecycle:'active',warning_codes:[]}],next_cursor:null}});
    if(url.pathname==='/api/v1/infrastructure/network-elements/'+ne)
      return route.fulfill({json:detail(ne)});
    if(url.pathname==='/api/v1/infrastructure/network-elements/'+parent)
      return route.fulfill({json:detail(parent)});
    if(url.pathname==='/api/v1/infrastructure/racks/'+rack+'/occupancy')
      return route.fulfill({json:{rack_id:rack,height_u:12,row_label:'A',
        column_label:'01',corrupt_overlap_detected:false,
        occupants:[{network_element_id:ne,operational_name:'SOURCE NETWORK ELEMENT',
          u_start:1,u_span:1}],free_ranges:[{u_start:2,u_span:11}]}});
    if(url.pathname==='/api/v1/infrastructure/sites/'+site)
      return route.fulfill({json:sitePoint});
    if(url.pathname==='/api/v1/infrastructure/history')
      return route.fulfill({json:{events:[],next_cursor:null}});
    return route.fulfill({status:404,json:{code:'UNEXPECTED_TEST_OWNER'}});
  });
  await page.goto('http://127.0.0.1:4174/infrastructure');
  await page.getByRole('listitem').first().press('Enter');
}
test('Physical relationship routes from accepted NE to Rack, then Rack occupant to exact current NE point',async({page})=>{
  const requests=[];await fixture(page,requests);
  const opened=page.getByRole('region',{name:'Opened Network Element'});
  await opened.getByRole('tab',{name:'Relationships',exact:true}).click();
  const physical=opened.getByRole('region',{name:'Physical Infrastructure relationship'});
  const logical=opened.getByRole('region',{name:'Logical Infrastructure relationships'});
  await expect(physical).toContainText('Accepted Site: '+site);
  await expect(logical).toContainText('Cloud Deployment: '+cloud);
  expect(requests).toHaveLength(2); // Tree and current NE; no hidden relationship reads.
  await physical.getByRole('button',{name:'Inspect accepted Rack occupancy'}).click();
  const rackPanel=page.getByRole('region',{name:'Opened Rack'});
  await expect(rackPanel.getByRole('table',{name:'Rack occupied U ranges'}))
    .toContainText('SOURCE NETWORK ELEMENT');
  expect(requests.filter(r=>r.path.endsWith('/occupancy'))).toHaveLength(1);
  await rackPanel.getByRole('button',{name:'Inspect Network Element '+ne}).click();
  await expect(opened.getByRole('heading',{name:'SOURCE NETWORK ELEMENT'})).toBeVisible();
  expect(requests.filter(r=>r.path.endsWith('/network-elements/'+ne))).toHaveLength(2);
  expect(requests.every(r=>r.method==='GET')).toBe(true);
});
test('Logical containment and Cloud context remain distinct from physical Site owner reads',async({page})=>{
  const requests=[];await fixture(page,requests);
  let opened=page.getByRole('region',{name:'Opened Network Element'});
  await opened.getByRole('tab',{name:'Relationships',exact:true}).click();
  await opened.getByRole('region',{name:'Logical Infrastructure relationships'})
    .getByRole('button',{name:'Inspect containment parent Network Element'}).click();
  await expect(opened.getByRole('heading',{name:'ACCEPTED CONTAINMENT PARENT'})).toBeVisible();
  expect(requests.filter(r=>r.path.endsWith('/network-elements/'+parent))).toHaveLength(1);
  // Reopening the source through its real owner row has no synthetic navigation relation.
  await page.getByRole('listitem').first().press('Enter');
  await opened.getByRole('tab',{name:'Relationships',exact:true}).click();
  await opened.getByRole('region',{name:'Logical Infrastructure relationships'})
    .getByRole('button',{name:'Inspect Cloud Deployment history'}).click();
  const context=page.getByRole('region',{name:'Opened Infrastructure context'});
  await expect(context).toContainText('Cloud Deployment context');
  await expect(context).toContainText('not a full Room or Cloud Deployment detail response');
  const history=requests.filter(r=>r.path==='/api/v1/infrastructure/history');
  expect(history).toHaveLength(1);
  const query=new URLSearchParams(history[0].search);
  expect(query.get('target_kind')).toBe('cloud_deployment');
  expect(query.get('target_id')).toBe(cloud);
  expect(requests.filter(r=>r.path.endsWith('/sites/'+site))).toHaveLength(0);
  expect(requests.every(r=>r.method==='GET')).toBe(true);
});
test('Accepted NE relation opens exact current Site details without claiming Cloud ancestry',async({page})=>{
  const requests=[];await fixture(page,requests);
  const opened=page.getByRole('region',{name:'Opened Network Element'});
  await opened.getByRole('tab',{name:'Relationships',exact:true}).click();
  await opened.getByRole('region',{name:'Physical Infrastructure relationship'})
    .getByRole('button',{name:'Inspect accepted Site details'}).click();
  const point=page.getByRole('region',{name:'Opened Site'});
  await expect(point).toContainText('SITE OWNER');
  await expect(point).toContainText('Customer Organization identity');
  expect(requests.filter(r=>r.path.endsWith('/sites/'+site))).toHaveLength(1);
  expect(requests.filter(r=>r.path==='/api/v1/infrastructure/history')).toHaveLength(0);
});
