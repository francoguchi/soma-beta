import {useRef, useEffect, type ReactNode} from 'react';
import {unsupportedCapabilities, useContainerWidth} from '../layout/responsive';
import {installScrollOwnership} from '../interactions/scroll-owner';
import {resolveRoute} from '../app/router';
import {navigationForSurface, primaryWorkspaces} from '../state/workspace-navigation';

// Keep the established export available to existing callers: five primary workspaces.
export const workspaces = primaryWorkspaces.map(({label, href}) => [label, href] as const);

type DockIcon = 'overview' | 'tickets' | 'objectives' | 'inventory' | 'infrastructure';
function Icon({name}: {name: DockIcon}) {
  const common = {fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
    strokeLinecap: 'square' as const, strokeLinejoin: 'miter' as const};
  const paths: Record<DockIcon, ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
    tickets: <><path d="M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4V5Z"/><path d="M12 5v14" strokeDasharray="2 2"/></>,
    objectives: <><rect x="4" y="5" width="16" height="16"/><path d="M8 3v4m8-4v4M4 10h16m-12 5 3 3 5-5"/></>,
    inventory: <><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm-9 5 9 5 9-5m-9 5v10"/></>,
    infrastructure: <><rect x="9" y="2" width="6" height="5"/><rect x="2" y="17" width="6" height="5"/><rect x="16" y="17" width="6" height="5"/><path d="M12 7v6M5 17v-4h14v4"/></>,
  };
  return <svg className="soma-v2-icon" width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[name]}</svg>;
}

function Link({href, label, active, navigate, className, icon}: {
  href: string; label: string; active: boolean; navigate: (path: string) => void; className: string; icon?: ReactNode;
}) {
  return <a className={className} href={href} aria-label={icon ? label : undefined} aria-current={active ? 'page' : undefined}
    onClick={event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); navigate(href);
    }}>{icon ?? label}</a>;
}

export function SomaShell({path, navigate, children, warnings = [], dirty = false, settingsOpen = false}: {
  path: string; navigate: (path: string) => void; children: ReactNode; warnings?: readonly string[]; dirty?: boolean; settingsOpen?: boolean;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  const width = useContainerWidth(shell);
  const route = resolveRoute(path);
  const navigation = navigationForSurface(route?.surface);
  const missing = unsupportedCapabilities();
  const compact = width > 0 && width < 1360;
  useEffect(() => {
    const node = shell.current;
    if (!node) return;
    return installScrollOwnership(node, () => main.current,
      () => {window.dispatchEvent(new Event('soma-scroll-gesture'));});
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent): void => {
      if (dirty) {event.preventDefault(); event.returnValue = '';}
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return <div ref={shell} className="soma-shell soma-v2-shell" data-compact={compact ? 'true' : 'false'}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="soma-v2-header">
      <span className="soma-v2-brand"><img src="/static/ui/brand/soma-lockup.svg" alt="SOMA"/></span>
      <span className="soma-v2-header-spacer"/>
      <span className="soma-v2-build">BETA · UI V2</span>
      <Link className="soma-v2-header-action" href="/settings/appearance" label="Appearance"
        active={settingsOpen} navigate={navigate}/>
      <Link className="soma-v2-settings-gear" href="/settings" label="Settings"
        icon={<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="m10 2 1 2h2l1-2 2 1-.3 2 1.5 1.5L19 6l2 2-1.5 1.5.5 2.5-.5 2.5L21 16l-2 2-1.8-.5L15.7 19l.3 2-2 1-1-2h-2l-1 2-2-1 .3-2-1.5-1.5L5 18l-2-2 1.5-1.5L4 12l.5-2.5L3 8l2-2 1.8.5L8.3 5l-.3-2 2-1Z"/></svg>}
        active={settingsOpen} navigate={navigate}/>
    </header>
    <nav className="soma-v2-dock" aria-label="Workspaces">
      {primaryWorkspaces.map(({id, label, href}) => <a key={id} href={href} className="soma-v2-dock-item"
        aria-label={label} title={label} aria-current={navigation.active === id ? 'page' : undefined}
        onClick={event => {
          if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); navigate(href);
        }}><Icon name={id}/><span className="soma-v2-sr-only">{label}</span></a>)}
    </nav>
    <nav className="soma-v2-context" aria-label={navigation.title + ' navigation'}>
      <div className="soma-v2-context-heading"><small>WORKSPACE</small><strong>{navigation.title}</strong></div>
      <div className="soma-v2-context-body">
        <div className="soma-v2-context-group">{navigation.group}</div>
        {navigation.links.map(link => <Link key={link.href} className="soma-v2-context-link"
          href={link.href} label={link.label} active={link.current} navigate={navigate}/>)}
      </div>
      <div className="soma-v2-command"><small>COMMAND AREA · RESERVED</small>
        <span>{navigation.title}</span><span>No command interpreter</span></div>
    </nav>
    <div className="soma-v2-content-frame">
      <nav className="soma-v2-compact-nav" aria-label={navigation.title + ' sections'}>
        {navigation.links.length ? navigation.links.map(link => <Link key={link.href}
          className="soma-v2-context-link" href={link.href} label={link.label}
          active={link.current} navigate={navigate}/>) : <span>{navigation.title}</span>}
      </nav>
      <main ref={main} id="main-content" className="soma-v2-main" tabIndex={-1} data-scroll-owner="y">
        <div className="soma-v2-content-head"><h1>{navigation.title}</h1><span>{navigation.group}</span></div>
        {warnings.map(warning => <p className="warning" role="status" key={warning}>Warning: {warning}</p>)}
        {missing.length ? <p role="alert">UI_BROWSER_CAPABILITY_UNSUPPORTED: {missing.join(', ')}. Required interactions are unavailable.</p>
          : route ? children : <p>The requested page is unavailable. Select a workspace.</p>}
      </main>
    </div>
    <footer className="soma-v2-status"><span>LOCAL BETA · UI V2</span><span>OPERATIONAL DATA VIA EXISTING OWNERS</span></footer>
  </div>;
}
