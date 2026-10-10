/** UI V2 workspace ownership: one route-derived model, no independent sidebar state. */
export const primaryWorkspaces = [
  {id: 'overview', label: 'Overview', href: '/overview'},
  {id: 'tickets', label: 'Tickets', href: '/tickets'},
  {id: 'objectives', label: 'Objectives', href: '/objectives'},
  {id: 'inventory', label: 'Inventory', href: '/inventory'},
  {id: 'infrastructure', label: 'Infrastructure', href: '/infrastructure'},
] as const;

export type WorkspaceId = typeof primaryWorkspaces[number]['id'];
export type WorkspaceNav = Readonly<{
  active: WorkspaceId | 'settings' | null;
  title: string;
  group: string;
  links: readonly Readonly<{label: string; href: string; current: boolean}>[];
}>;

const surfaceWorkspace: Readonly<Record<string, WorkspaceId | 'settings'>> = {
  overview: 'overview',
  ticket_list: 'tickets', rfc_list: 'tickets', ticket_history: 'tickets',
  sr_workbench: 'tickets', rfc_workbench: 'tickets',
  objectives: 'objectives', objective_detail: 'objectives',
  inventory: 'inventory', infrastructure: 'infrastructure',
  settings: 'settings', appearance_settings: 'settings', communication_settings: 'settings',
};

const contexts: Readonly<Record<WorkspaceId | 'settings', Readonly<{
  title: string;
  group: string;
  links: readonly Readonly<{label: string; href: string; surfaces: readonly string[]} >[];
}>>> = {
  overview: {title: 'Overview', group: 'OPERATIONS', links: [
    {label: 'Overview', href: '/overview', surfaces: ['overview']},
  ]},
  tickets: {title: 'Tickets', group: 'RECORDS', links: [
    {label: 'Service Requests', href: '/tickets', surfaces: ['ticket_list', 'sr_workbench']},
    {label: 'Ticket History', href: '/tickets/history', surfaces: ['ticket_history']},
    {label: 'RFCs', href: '/tickets/rfcs', surfaces: ['rfc_list', 'rfc_workbench']},
  ]},
  objectives: {title: 'Objectives', group: 'MAINTENANCE', links: [
    {label: 'Maintenance Windows & Tasks', href: '/objectives', surfaces: ['objectives', 'objective_detail']},
  ]},
  inventory: {title: 'Inventory', group: 'WAREHOUSE', links: [
    {label: 'Inventory Workbench', href: '/inventory', surfaces: ['inventory']},
  ]},
  infrastructure: {title: 'Infrastructure', group: 'LOCATIONS & EQUIPMENT', links: [
    {label: 'Infrastructure Workbench', href: '/infrastructure', surfaces: ['infrastructure']},
  ]},
  settings: {title: 'Settings', group: 'PREFERENCES', links: [
    {label: 'Settings', href: '/settings', surfaces: ['settings']},
    {label: 'Appearance', href: '/settings/appearance', surfaces: ['appearance_settings']},
    {label: 'Communications', href: '/settings/communications', surfaces: ['communication_settings']},
  ]},
};

export function navigationForSurface(surface: string | null | undefined): WorkspaceNav {
  const active = surface === null || surface === undefined ? null : surfaceWorkspace[surface] ?? null;
  if (active === null) return {active: null, title: 'Unavailable page', group: 'NAVIGATION', links: []};
  const context = contexts[active];
  return {
    active,
    title: context.title,
    group: context.group,
    links: context.links.map(({label, href, surfaces}) => ({label, href, current: surfaces.includes(surface!)})),
  };
}
