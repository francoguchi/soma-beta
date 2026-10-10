import {test} from 'node:test';
import assert from 'node:assert/strict';
import {navigationForSurface, primaryWorkspaces} from '../.test-build/state/workspace-navigation.js';
import {RouteNavigation,resolveRoute} from '../.test-build/app/router.js';
import {isExactSrIdentity} from '../.test-build/state/sr-identity.js';

const cases = [
  ['ticket_list', 'tickets', 'Service Requests'],
  ['sr_workbench', 'tickets', 'Service Requests'],
  ['rfc_list', 'tickets', 'RFCs'],
  ['rfc_workbench', 'tickets', 'RFCs'],
  ['ticket_history', 'tickets', 'Ticket History'],
  ['overview', 'overview', 'Overview'],
  ['objectives', 'objectives', 'Maintenance Windows & Tasks'],
  ['objective_detail', 'objectives', 'Maintenance Windows & Tasks'],
  ['inventory', 'inventory', 'Inventory Workbench'],
  ['infrastructure', 'infrastructure', 'Infrastructure Workbench'],
  ['settings', 'settings', 'Settings'],
  ['appearance_settings', 'settings', 'Appearance'],
  ['communication_settings', 'settings', 'Communications'],
];

test('UI V2 has exactly five workspace dock destinations (Settings is separate)', () => {
  assert.deepEqual(primaryWorkspaces.map(x=>x.id), ['overview', 'tickets', 'objectives', 'inventory', 'infrastructure']);
  assert.equal(new Set(primaryWorkspaces.map(x=>x.href)).size, 5);
});

test('every supported route surface selects one central workspace/context model', () => {
  for (const [surface, owner, current] of cases) {
    const nav = navigationForSurface(surface);
    assert.equal(nav.active, owner, surface);
    assert.deepEqual(nav.links.filter(link=>link.current).map(link=>link.label), current ? [current] : [], surface);
  }
});

test('Tickets -> Overview -> Tickets never retains Overview contextual navigation', () => {
  const ticket = navigationForSurface('sr_workbench');
  const overview = navigationForSurface('overview');
  const restored = navigationForSurface('sr_workbench');
  assert.equal(ticket.active, 'tickets');
  assert.equal(overview.active, 'overview');
  assert.deepEqual(restored, ticket);
  assert.ok(restored.links.every(link => !overview.links.some(prev => prev.href === link.href)));
});

test('invalid/unknown surfaces do not mislabel the selected workspace', () => {
  for (const surface of [null, undefined, '', 'not_a_route', 'tickets_from_stale_state']) {
    const model = navigationForSurface(surface);
    assert.equal(model.active, null);
    assert.deepEqual(model.links, []);
  }
});

test('Settings overlays preserve dirty workbench drafts, but replacing the workbench still requires review', () => {
  const original='/tickets/sr/33333333-3333-4333-8333-333333333333';
  let shown=original, pending=null, dirty=true;
  const stack=[];
  const settingsPath=value=>['/settings','/settings/appearance','/settings/communications'].includes(value);
  const nav=new RouteNavigation(original,
    {replace:(state,path)=>{stack[0]={state,path};},
      push:(state,path)=>stack.push({state,path}),go:()=>{}},
    ()=>dirty,()=>null,path=>{shown=path;},path=>{pending=path;},
    (from,to)=>(settingsPath(from)&&(settingsPath(to)||to===original))||
      (!settingsPath(from)&&from===original&&settingsPath(to)));
  nav.navigate('/settings');
  assert.equal(shown,'/settings');
  assert.equal(pending,null);
  nav.navigate('/settings/appearance');
  assert.equal(shown,'/settings/appearance');
  assert.equal(pending,null);
  nav.navigate(original);
  assert.equal(shown,original);
  assert.equal(pending,null);
  nav.navigate('/inventory');
  assert.equal(shown,original);
  assert.equal(pending,'/inventory');
  nav.cancel();
  assert.equal(pending,null);
  dirty=false;
  nav.navigate('/inventory');
  assert.equal(shown,'/inventory');
});

test('dirty overlay never authorizes navigation to a different underlying workspace',()=>{
  const original='/tickets/sr/33333333-3333-4333-8333-333333333333';
  let shown=original,pending=null;
  const settingsPath=value=>['/settings','/settings/appearance','/settings/communications'].includes(value);
  const nav=new RouteNavigation(original,
    {replace:()=>{},push:()=>{},go:()=>{}},
    ()=>true,()=>null,path=>{shown=path;},path=>{pending=path;},
    (from,to)=>(settingsPath(from)&&(settingsPath(to)||to===original))||
      (!settingsPath(from)&&from===original&&settingsPath(to)));
  nav.navigate('/settings');
  nav.navigate('/overview');
  assert.equal(shown,'/settings');
  assert.equal(pending,'/overview');
});

test('Tickets identity lookup cannot imply partial, fuzzy or ungoverned matching',()=>{
  for(const exact of ['12345678','00000000','LSR-00000001','LSR-99999999'])
    assert.equal(isExactSrIdentity(exact),true,exact);
  for(const wrong of ['','1234567','123456789','LSR-1234567','LSR-123456789',
    'lsr-12345678',' 12345678','12345678 ','SR-12345678','1234.678','1234*678','１２３４５６７８'])
    assert.equal(isExactSrIdentity(wrong),false,wrong);
});

test('RFC collection routes preserve Tickets context without misclassifying deep links',()=>{
  assert.equal(resolveRoute('/tickets/rfcs')?.surface,'rfc_list');
  assert.equal(resolveRoute('/tickets/rfc/33333333-3333-4333-8333-333333333333')?.surface,'rfc_workbench');
  assert.equal(navigationForSurface('rfc_list').links.find(x=>x.label==='RFCs')?.current,true);
  assert.equal(navigationForSurface('ticket_list').links.find(x=>x.label==='RFCs')?.current,false);
  assert.equal(resolveRoute('/tickets/rfcs/unknown'),null);
});
