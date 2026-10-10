import {test} from 'node:test';
import assert from 'node:assert/strict';
import {navigationForSurface, primaryWorkspaces} from '../.test-build/state/workspace-navigation.js';

const cases = [
  ['ticket_list', 'tickets', 'Service Requests'],
  ['sr_workbench', 'tickets', 'Service Requests'],
  ['rfc_workbench', 'tickets', null],
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
