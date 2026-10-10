import {createRoot} from 'react-dom/client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {SomaShell} from '../components/SomaShell';
import {resolveRoute, RouteNavigation, type ReturnState} from './router';
import {TicketWorkbench} from './TicketWorkbench';
import {Modal} from '../components/Modal';
import {AppearanceSettings} from '../components/AppearanceSettings';
import {ObjectiveWorkspace, ObjectiveDetail} from './ObjectiveWorkspace';
import {InfrastructureWorkspace} from './InfrastructureWorkspace';
import {InventoryWorkspace} from './InventoryWorkspace';
import {ReferenceSettings} from './ReferenceSettings';
import {SlaCatalogSettings} from './SlaCatalogSettings';
import {CommunicationSettings} from './CommunicationSettings';
import {ObjectiveSettings} from './ObjectiveSettings';
import {SettingsWorkspace} from './SettingsWorkspace';
import {SettingsDialog} from '../components/SettingsDialog';
import '../styles/soma.css';

const settingsPath = (value: string) => ['/settings','/settings/appearance','/settings/communications'].includes(value);

function Application() {
  const [path, setPath] = useState(location.pathname);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const previousWorkspace = useRef(settingsPath(location.pathname) ? '/overview' : location.pathname);
  const [dirty, setDirty] = useState(false); const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [restored, setRestored] = useState<ReturnState | null>(null); const dirtyRef = useRef(false);
  const workReturn = useRef<(() => ReturnState | null) | null>(null);
  const settingsReturn = useRef<(() => ReturnState | null) | null>(null);
  const currentPath = useRef(location.pathname);
  const navigation = useRef<RouteNavigation | null>(null);
  const updateDirty = useCallback((value: boolean) => {dirtyRef.current = value; setDirty(value);}, []);
  const captureReturnState = useCallback((capture: () => ReturnState | null) => {workReturn.current = capture;}, []);
  const captureSettingsReturnState = useCallback((capture: () => ReturnState | null) => {settingsReturn.current = capture;}, []);
  const application = useRef<HTMLDivElement>(null); const fallback = useCallback(() => document.getElementById('main-content'), []);
  useEffect(() => {
    const controller = new RouteNavigation(location.pathname, {replace: (state, next) => history.replaceState(state, '', next),
      push: (state, next) => history.pushState(state, '', next), go: delta => history.go(delta)}, () => dirtyRef.current,
      () => (settingsPath(currentPath.current) ? settingsReturn.current?.() : workReturn.current?.()) ?? null,
      (next, state) => {
        const previous = currentPath.current;
        currentPath.current = next;
        if (!settingsPath(previous) && !settingsPath(next)) workReturn.current = null;
        settingsReturn.current = null;
        setRestored(state); setPath(next);
      }, setPendingPath,
      (from, to) => {
        const original = previousWorkspace.current;
        // The React workbench stays mounted beneath Settings. Opening, switching
        // its tabs and returning to the *same* workbench do not discard drafts.
        // Any destination that replaces that workbench retains the dirty guard.
        return (settingsPath(from) && (settingsPath(to) || to === original))
          || (!settingsPath(from) && from === original && settingsPath(to));
      });
    navigation.current = controller; setPath(location.pathname);
    const change = (event: PopStateEvent) => controller.pop(location.pathname, event.state);
    window.addEventListener('popstate', change); return () => {navigation.current = null; window.removeEventListener('popstate', change);};
  }, []);
  const route = resolveRoute(path);
  const settingsOpen = settingsPath(path);
  if (!settingsOpen) previousWorkspace.current = path;
  const visiblePath = settingsOpen ? previousWorkspace.current : path;
  const visibleRoute = resolveRoute(visiblePath);
  const navigate = (next: string): void => {
    if (!settingsOpen && settingsPath(next)) setReferenceOpen(false);
    navigation.current?.navigate(next);
  };
  return <><div ref={application}><SomaShell path={visiblePath} settingsOpen={settingsOpen} dirty={dirty} navigate={navigate}>
    {visibleRoute?.surface === 'sr_workbench' && visibleRoute.recordId ? <TicketWorkbench key={visiblePath} id={visibleRoute.recordId} type="service_request" onDirtyChange={updateDirty} restored={restored} onReturnState={captureReturnState}/> :
      visibleRoute?.surface === 'rfc_workbench' && visibleRoute.recordId ? <TicketWorkbench key={visiblePath} id={visibleRoute.recordId} type="rfc" onDirtyChange={updateDirty} restored={restored} onReturnState={captureReturnState}/> :
      visibleRoute?.surface === 'objectives' ? <ObjectiveWorkspace navigate={navigate} restored={restored} onReturnState={captureReturnState}/> :
      visibleRoute?.surface === 'infrastructure' ? <InfrastructureWorkspace restored={restored} onReturnState={captureReturnState}/> :
      visibleRoute?.surface === 'inventory' ? <InventoryWorkspace restored={restored} onReturnState={captureReturnState}/> :
      visibleRoute?.surface === 'objective_detail' && visibleRoute.recordId ? <ObjectiveDetail key={visiblePath} id={visibleRoute.recordId}/> :
      <p role="status">{visibleRoute ? 'This workspace binding is under implementation.' : 'Page not found.'}</p>}
  </SomaShell></div>{settingsOpen && <SettingsDialog application={application}
    expanded={referenceOpen && route?.surface === 'settings'}
    onClose={() => navigate(previousWorkspace.current)}>
    <nav className="soma-v2-settings-tabs" aria-label="Settings sections">
      {([['General','/settings'],['Appearance','/settings/appearance'],['Communications','/settings/communications']] as const).map(([label,href]) =>
        <a key={href} href={href} aria-current={path === href ? 'page' : undefined}
          onClick={event => {if(event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
            event.preventDefault();setReferenceOpen(false);navigate(href);}}>{label}</a>)}
    </nav>
    <div className="soma-v2-settings-body" data-scroll-owner="y" tabIndex={-1}>
      <SettingsWorkspace key={path} path={path} restored={restored} onReturnState={captureSettingsReturnState}>
        {route?.surface === 'appearance_settings' ? <AppearanceSettings/> :
         route?.surface === 'communication_settings' ? <CommunicationSettings/> :
         referenceOpen ? <><div className="soma-v2-settings-inlinehead">
           <h3>Reference Manager</h3>
           <button type="button" onClick={() => setReferenceOpen(false)}>Back to General</button>
         </div><p>Reference identities remain governed by their owning services.</p>
         <ReferenceSettings/><SlaCatalogSettings/></> :
         <><h3>General</h3>
           <p>Adjust local operational preferences. Changes are accepted only by their owning services.</p>
           <button type="button" onClick={() => setReferenceOpen(true)}>Open Reference Manager ↗</button>
           <ObjectiveSettings/><SlaCatalogSettings/></>}
      </SettingsWorkspace>
    </div>
  </SettingsDialog>}{pendingPath && <Modal title="Leave unsaved changes?" application={application} fallback={fallback} close={() => navigation.current?.cancel()}>
    <p>This edit flow has unsaved UI values. A recovery checkpoint does not save accepted operational state.</p>
    <button type="button" onClick={() => {updateDirty(false); navigation.current?.confirm();}}>Leave this edit flow</button>
  </Modal>}</>;
}
const root = document.getElementById('root');
if (!root) throw new Error('SOMA root is missing');
createRoot(root).render(<Application/>);
