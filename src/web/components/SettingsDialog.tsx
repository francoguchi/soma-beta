import {createPortal} from 'react-dom';
import {useId, useLayoutEffect, useRef, type ReactNode, type RefObject} from 'react';

const focusables = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]';

/** Presentation-only dialog: route ownership and Settings data stay in their existing owners. */
export function SettingsDialog({application, onClose, children, expanded = false}: {
  application: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  expanded?: boolean;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const invoker = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const app = application.current;
    const node = dialog.current;
    if (!app || !node || app.inert) return;
    invoker.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prior = document.documentElement.style.overflow;
    app.inert = true;
    document.documentElement.style.overflow = 'hidden';
    const close = node.querySelector<HTMLElement>('[data-settings-close]');
    // Return navigation may restore a descendant's exact focus before this effect runs.
    if (!node.contains(document.activeElement)) (close ?? node).focus({preventScroll: true});
    return () => {
      app.inert = false;
      document.documentElement.style.overflow = prior;
      const previous = invoker.current;
      if (previous?.isConnected && !previous.closest('[inert]') && previous.getClientRects().length) previous.focus({preventScroll: true});
      else document.getElementById('main-content')?.focus({preventScroll: true});
    };
  }, [application]);
  return createPortal(
    <div className="soma-v2-settings-backdrop">
      <section ref={dialog} className="soma-v2-settings-dialog" data-expanded={expanded ? 'true' : 'false'}
        role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        onKeyDown={event => {
          if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); onClose(); return;}
          if (event.key !== 'Tab') return;
          const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>(focusables) ?? [])
            .filter(node => node.getClientRects().length > 0 && !node.closest('[hidden]') && !node.closest('[inert]'));
          const first = nodes[0], last = nodes.at(-1);
          if (!first) {event.preventDefault(); dialog.current?.focus();}
          else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus();
          }
        }}>
        <header className="soma-v2-settings-titlebar">
          <div><span className="soma-v2-settings-eyebrow">LOCAL OPERATIONS / PREFERENCES</span>
            <h2 id={titleId}>Settings</h2></div>
          <button type="button" data-settings-close aria-label="Close settings" onClick={onClose}>×</button>
        </header>
        {children}
        <footer className="soma-v2-settings-footer">SOMA BETA · LOCAL ADMINISTRATOR
          <button type="button" onClick={onClose}>Close</button>
        </footer>
      </section>
    </div>, document.body);
}
