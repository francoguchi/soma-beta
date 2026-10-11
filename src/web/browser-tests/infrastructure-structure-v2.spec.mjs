import {test,expect} from '@playwright/test';
const id=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const nodes=[
 {kind:'site',id:id(1),label:'SITE OWNER',parent_context_id:null,lifecycle:'active',warning_codes:[]},
 {kind:'room',id:id(2),label:'ROOM OWNER',parent_context_id:id(1),lifecycle:'active',warning_codes:[]},
 {kind:'rack',id:id(3),label:'RACK OWNER',parent_context_id:id(2),lifecycle:'active',warning_codes:[]},
 {kind:'cloud_deployment',id:id(4),label:'CLOUD OWNER',parent_context_id:id(1),lifecycle:'active',warning_codes:[]},
 {kind:'network_element',id:id(5),label:'NE OWNER',parent_context_id:id(3),lifecycle:'active',warning_codes:[]},
 {kind:'containment',id:id(5),label:'NE CONTAINMENT',parent_context_id:id(6),lifecycle:'active',warning_codes:[]},
];
async function fixture(page,reads){
  await page.route('**/api/v1/infrastructure/**',route=>{
    expect(route.request().method()).toBe('GET');
    const u=new URL(route.request().url());
    if(u.pathname==='/api/v1/infrastructure/tree'){
      reads.push(u.toString());
      return route.fulfill({json:{nodes,next_cursor:null}});
    }
    return route.fulfill({status:404,json:{code:'UNEXPECTED_PROJECTION_OWNER_READ'}});
  });
  await page.goto('http://127.0.0.1:4174/infrastructure');
  await expect(page.getByRole('listitem')).toHaveCount(6);
}
const rowNames=async page=>page.getByRole('listitem').allTextContents();
test('Study29 Structure Apply changes real explorer presentation, never mutates source ownership',async({page})=>{
  const reads=[];await fixture(page,reads);
  const trigger=page.getByRole('button',{name:'Structure',exact:true});
  await trigger.click();
  const modal=page.getByRole('dialog',{name:'Infrastructure / Structure view'});
  await expect(modal).toBeVisible();
  await expect(modal.getByText('Customer',{exact:true})).toBeVisible();
  await expect(modal.getByText('Network Element',{exact:true})).toBeVisible();
  await modal.getByRole('button',{name:'Site → Cloud'}).click();
  await expect(modal.getByRole('region',{name:'Structure example path'}))
    .toContainText('Customer → Site → Cloud → Room → Rack → Network Element');
  await modal.getByRole('button',{name:'Apply view'}).click();
  await expect(modal).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator('[aria-label="Applied Structure view"]'))
    .toContainText('Customer → Site → Cloud → Room → Rack → Network Element');
  const order=await rowNames(page);
  expect(order.join('|').indexOf('SITE OWNER')).toBeLessThan(order.join('|').indexOf('CLOUD OWNER'));
  // Every record still preserves original LLD-08 owner parentage in its row.
  await expect(page.getByRole('listitem').filter({hasText:'RACK OWNER'}))
    .toContainText('Physical/context parent: '+id(2));
  await expect(page.getByRole('listitem').filter({hasText:'NE CONTAINMENT'}))
    .toContainText('Containment parent: '+id(6));
  expect(reads).toHaveLength(1);
});
test('Direct projection hides only intermediary rows while NE and containment contexts remain; Full reveals them',async({page})=>{
  await fixture(page,[]);
  const button=page.getByRole('button',{name:'Structure',exact:true});
  await button.click();
  await page.getByRole('dialog').getByRole('button',{name:'Direct to Network Element'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Apply view'}).click();
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('listitem').filter({hasText:'NE OWNER'})).toHaveCount(1);
  await expect(page.getByRole('listitem').filter({hasText:'NE CONTAINMENT'})).toHaveCount(1);
  await expect(page.getByRole('status').filter({hasText:'Hidden display levels have not been deleted.'})).toBeVisible();
  await button.click();
  await page.getByRole('dialog').getByRole('button',{name:'Full structure'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Apply view'}).click();
  await expect(page.getByRole('listitem')).toHaveCount(6);
});
test('Intermediate levels can be hidden, reordered and revealed using keyboard-accessible controls',async({page})=>{
  await fixture(page,[]);
  const trigger=page.getByRole('button',{name:'Structure',exact:true});
  await trigger.click();
  let dialog=page.getByRole('dialog');
  await dialog.getByRole('checkbox',{name:'Show Room'}).uncheck();
  await dialog.getByRole('button',{name:'Move Site up'}).click();
  await dialog.getByRole('button',{name:'Move Rack up'}).click();
  await expect(dialog.getByRole('region',{name:'Structure example path'}))
    .toContainText('Customer → Site → Cloud → Rack → Network Element');
  await dialog.getByRole('button',{name:'Apply view'}).click();
  await expect(page.getByRole('listitem').filter({hasText:'ROOM OWNER'})).toHaveCount(0);
  await trigger.click();dialog=page.getByRole('dialog');
  await dialog.getByRole('checkbox',{name:'Show Room'}).check();
  await dialog.getByRole('button',{name:'Apply view'}).click();
  await expect(page.getByRole('listitem').filter({hasText:'ROOM OWNER'})).toHaveCount(1);
});
test('Cancel and Escape discard edits, restore focus to Structure and leave displayed records unchanged',async({page})=>{
  await fixture(page,[]);
  const trigger=page.getByRole('button',{name:'Structure',exact:true});
  await trigger.click();
  await page.getByRole('dialog').getByRole('button',{name:'Direct to Network Element'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Cancel'}).click();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('listitem')).toHaveCount(6);
  await trigger.click();
  await page.getByRole('dialog').getByRole('checkbox',{name:'Show Room'}).uncheck();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('listitem')).toHaveCount(6);
});
test('At 200% zoom the Structure footer remains reachable and keyboard focus returns after Apply',async({page})=>{
  await fixture(page,[]);
  await page.setViewportSize({width:840,height:690});
  await page.evaluate(()=>{document.documentElement.style.zoom='200%';});
  const trigger=page.getByRole('button',{name:'Structure',exact:true});
  await trigger.click();
  const dialog=page.getByRole('dialog',{name:'Infrastructure / Structure view'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Close Structure view'})).toBeFocused();
  for(let press=0;press<15;press++){
    await page.keyboard.press('Tab');
    const inside=await page.evaluate(()=>Boolean(document.activeElement?.closest('dialog.soma-structure-dialog')));
    expect(inside).toBe(true);
  }
  const visibility=await dialog.evaluate(element=>{
    const modal=element.getBoundingClientRect();
    const footer=element.querySelector('.soma-structure-dialog-footer')?.getBoundingClientRect();
    const apply=element.querySelector('.soma-structure-dialog-actions .primary')?.getBoundingClientRect();
    return !!footer&&!!apply&&modal.top>=-1&&modal.bottom<=innerHeight+1
      &&apply.bottom<=innerHeight+1&&apply.top>=-1&&apply.width>0
      &&footer.top>=modal.top&&footer.bottom<=modal.bottom+1;
  });
  expect(visibility).toBe(true);
  await dialog.getByRole('button',{name:'Direct to Network Element'}).click();
  await dialog.getByRole('button',{name:'Apply view'}).click();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('listitem')).toHaveCount(2);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
  expect(overflow).toBe(false);
});

test('Applied Structure survives browser Back and still refetches owner page without copied records',async({page})=>{
 const reads=[];
 await fixture(page,reads);
 await page.route('**/api/v1/objectives?*',route=>{
   const asOf=Number(new URL(route.request().url()).searchParams.get('as_of_utc'));
   return route.fulfill({json:{items:[],continuation:null,exact_total:0,as_of_utc:asOf}});
 });
 await page.getByRole('button',{name:'Structure',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Direct to Network Element'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Apply view'}).click();
 await expect(page.getByRole('listitem')).toHaveCount(2);
 await page.getByRole('link',{name:'Objectives',exact:true}).click();
 await page.goBack();
 await expect(page.locator('[aria-label="Applied Structure view"]'))
   .toContainText('Customer → Network Element');
 await expect(page.getByRole('listitem')).toHaveCount(2);
 expect(reads.length).toBeGreaterThanOrEqual(2);
 await expect(page.getByRole('button',{name:'Structure',exact:true})).toBeFocused();
});

test('Study29 pointer drag reorders only intermediate display levels with unchanged owner source',async({page})=>{
 const reads=[];await fixture(page,reads);
 await page.getByRole('button',{name:'Structure',exact:true}).click();
 const dialog=page.getByRole('dialog');
 const levels=dialog.getByRole('list',{name:'Reorder intermediate levels'});
 await levels.getByRole('listitem').filter({hasText:'Show Rack'})
   .dragTo(levels.getByRole('listitem').filter({hasText:'Show Site'}));
 await expect(dialog.getByRole('region',{name:'Structure example path'}))
   .toContainText('Customer → Cloud → Rack → Site → Room → Network Element');
 await dialog.getByRole('button',{name:'Apply view'}).click();
 const order=await rowNames(page);
 expect(order.join('|').indexOf('RACK OWNER')).toBeLessThan(order.join('|').indexOf('SITE OWNER'));
 expect(reads).toHaveLength(1);
});

test('Structure Apply persists within document session on ordinary workspace navigation without copying owner records',async({page})=>{
 const reads=[];await fixture(page,reads);
 await page.route('**/api/v1/objectives?*',route=>{
   const asOf=Number(new URL(route.request().url()).searchParams.get('as_of_utc'));
   return route.fulfill({json:{items:[],continuation:null,exact_total:0,as_of_utc:asOf}});
 });
 await page.getByRole('button',{name:'Structure',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Direct to Network Element'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Apply view'}).click();
 await expect(page.getByRole('listitem')).toHaveCount(2);
 await page.getByRole('link',{name:'Objectives',exact:true}).click();
 await page.getByRole('link',{name:'Infrastructure',exact:true}).click();
 await expect(page.getByRole('listitem')).toHaveCount(2);
 await expect(page.locator('[aria-label="Applied Structure view"]'))
   .toContainText('Customer → Network Element');
 expect(reads.length).toBeGreaterThanOrEqual(2);
});

test('Hidden-only owner page does not suppress authoritative cursor or invent missing NEs',async({page})=>{
 const calls=[];
 const site=nodes[0],ne=nodes[4];
 const next={version:1,query_id:'InfrastructureExplorerQuery',
   sort_registry_id:'InfrastructureExplorerQuery_ORDER_V1',
   null_order:'NULLS_LAST',last_key_tuple:[id(1),id(1),0,id(1)],
   filter_fingerprint:'a'.repeat(64)};
 await page.route('**/api/v1/infrastructure/tree?*',route=>{
   const url=new URL(route.request().url());calls.push(url);
   return route.fulfill({json:url.searchParams.has('cursor')
     ?{nodes:[ne],next_cursor:null}
     :{nodes:[site],next_cursor:next}});
 });
 await page.goto('http://127.0.0.1:4174/infrastructure');
 await expect(page.getByRole('listitem')).toHaveCount(1);
 await page.getByRole('button',{name:'Structure',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Direct to Network Element'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Apply view'}).click();
 await expect(page.getByRole('listitem')).toHaveCount(0);
 await expect(page.getByRole('status').filter({hasText:'Every owner row on this page is hidden'}))
   .toContainText('Continue to the next owner page');
 await page.getByRole('button',{name:'Next explorer page'}).click();
 await expect(page.getByRole('listitem').filter({hasText:'NE OWNER'})).toHaveCount(1);
 expect(calls).toHaveLength(2);
 expect(JSON.parse(calls[1].searchParams.get('cursor'))).toEqual(next);
});
test('Structure footer remains visually reachable when viewport shrinks while 200% modal is open',async({page})=>{
 await fixture(page,[]);
 await page.setViewportSize({width:960,height:820});
 await page.evaluate(()=>{document.documentElement.style.zoom='200%';});
 await page.getByRole('button',{name:'Structure',exact:true}).click();
 const modal=page.getByRole('dialog',{name:'Infrastructure / Structure view'});
 await expect(modal.getByRole('button',{name:'Apply view'})).toBeVisible();
 await page.setViewportSize({width:460,height:550});
 await expect.poll(async()=>modal.evaluate(el=>{
   const bounds=el.getBoundingClientRect();
   const apply=el.querySelector('.soma-structure-dialog-actions .primary').getBoundingClientRect();
   return bounds.top>=-1&&bounds.bottom<=innerHeight+1&&bounds.left>=-1&&bounds.right<=innerWidth+1
     &&apply.top>=-1&&apply.bottom<=innerHeight+1;
 })).toBe(true);
 await modal.getByRole('button',{name:'Apply view'}).click();
 await expect(page.getByRole('button',{name:'Structure',exact:true})).toBeFocused();
});
