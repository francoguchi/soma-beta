import {useEffect,useRef,useState} from 'react';
import {
  FULL_STRUCTURE,LEVEL_NAMES,moveStructureLevel,dropStructureLevel,
  structurePath,structurePreset,toggleStructureLevel,validStructure,
  type StructureLevel,type StructurePreset,type StructureView,
} from '../presentation/infrastructure-structure';

type Props=Readonly<{current:StructureView;onApply:(next:StructureView)=>void;onDismiss:()=>void}>;
const presets:readonly Readonly<{key:StructurePreset;label:string}>[]=[
  {key:'full',label:'Full structure'},
  {key:'site-cloud',label:'Site → Cloud'},
  {key:'direct',label:'Direct to Network Element'},
];
/** Native modal dialog traps focus; scrolling stays inside the body at 200%
 * browser zoom while the footer/Apply controls remain reachable.
 */
export function InfrastructureStructureDialog({current,onApply,onDismiss}:Props){
  const [draft,setDraft]=useState<StructureView>(()=>({
    order:[...(validStructure(current)?current:FULL_STRUCTURE).order],
    visible:[...(validStructure(current)?current:FULL_STRUCTURE).visible],
  }));
  const modal=useRef<HTMLDialogElement>(null);
  const firstButton=useRef<HTMLButtonElement>(null);
  const dragging=useRef<StructureLevel|null>(null);
  useEffect(()=>{
    const dialog=modal.current;
    if(!dialog)return;
    // Study 29 demonstrated that CSS root zoom does NOT reduce 100dvh.
    // Native dialog sits in the top layer but inherits that zoom. Size it in
    // unzoomed layout pixels so its visual footer is always on-screen.
    const sizeToVisibleViewport=()=>{
      const zoom=Number.parseFloat(getComputedStyle(document.documentElement).zoom);
      const scale=Number.isFinite(zoom)&&zoom>0?zoom:1;
      const visualWidth=window.visualViewport?.width??window.innerWidth;
      const visualHeight=window.visualViewport?.height??window.innerHeight;
      const width=Math.max(80,Math.min(760,(visualWidth-16)/scale));
      const height=Math.max(80,Math.min(670,(visualHeight-12)/scale));
      dialog.style.width=width+'px';
      dialog.style.maxWidth=width+'px';
      dialog.style.height=height+'px';
      dialog.style.maxHeight=height+'px';
      dialog.classList.toggle('soma-structure-zoom-compact',visualWidth/scale<520);
    };
    dialog.showModal();
    sizeToVisibleViewport();
    window.addEventListener('resize',sizeToVisibleViewport);
    window.visualViewport?.addEventListener('resize',sizeToVisibleViewport);
    firstButton.current?.focus();
    return()=>{
      window.removeEventListener('resize',sizeToVisibleViewport);
      window.visualViewport?.removeEventListener('resize',sizeToVisibleViewport);
      if(dialog.open)dialog.close();
    };
  },[]);
  function dismiss(){
    if(modal.current?.open)modal.current.close();
    onDismiss();
  }
  function apply(){
    if(!validStructure(draft))return;
    if(modal.current?.open)modal.current.close();
    onApply(draft);
  }
  function move(level:StructureLevel,direction:-1|1){
    setDraft(view=>moveStructureLevel(view,level,direction));
  }
  return <dialog className="soma-structure-dialog" ref={modal}
    aria-labelledby="soma-structure-heading" aria-describedby="soma-structure-desc"
    onCancel={event=>{event.preventDefault();dismiss();}}>
    <header className="soma-structure-dialog-head">
      <div><h2 id="soma-structure-heading">Infrastructure / Structure view</h2>
        <p>Choose the display levels and their order.</p></div>
      <button type="button" aria-label="Close Structure view" ref={firstButton}
        onClick={dismiss}>Close</button>
    </header>
    <div className="soma-structure-dialog-body" data-scroll-owner="y">
      <p id="soma-structure-desc">Reorder or hide intermediary display levels.
        <strong> Customer is always first. Network Element is always last.</strong>
        This changes presentation only—not actual hierarchy, parentage, relationships, or database records.</p>
      <h3>Quick views</h3>
      <div role="group" aria-label="Structure quick views" className="soma-structure-presets">
        {presets.map(preset=><button key={preset.key} type="button"
          aria-pressed={JSON.stringify(draft)===JSON.stringify(structurePreset(preset.key))}
          onClick={()=>setDraft(structurePreset(preset.key))}>{preset.label}</button>)}
      </div>
      <h3>Visible levels · drag or use arrows to reorder</h3>
      <div className="soma-structure-level pinned">
        <strong>Customer</strong><span>Always first · locked</span>
      </div>
      <ol className="soma-structure-levels" aria-label="Reorder intermediate levels">
        {draft.order.map((level,index)=><li className="soma-structure-level" key={level}
          draggable onDragStart={event=>{dragging.current=level;event.dataTransfer.effectAllowed='move';
            event.dataTransfer.setData('text/plain',level);}}
          onDragOver={event=>{if(dragging.current&&dragging.current!==level)event.preventDefault();}}
          onDrop={event=>{event.preventDefault();const source=dragging.current;dragging.current=null;
            if(source)setDraft(view=>dropStructureLevel(view,source,level));}}
          onDragEnd={()=>{dragging.current=null;}}>
          <label><input type="checkbox" checked={draft.visible.includes(level)}
            onChange={()=>setDraft(view=>toggleStructureLevel(view,level))}/>
            <span>Show {LEVEL_NAMES[level]}</span></label>
          <div role="group" aria-label={LEVEL_NAMES[level]+' order'} className="soma-structure-arrows">
            <button type="button" aria-label={'Move '+LEVEL_NAMES[level]+' up'}
              disabled={index===0} onClick={()=>move(level,-1)}>↑</button>
            <button type="button" aria-label={'Move '+LEVEL_NAMES[level]+' down'}
              disabled={index===draft.order.length-1} onClick={()=>move(level,1)}>↓</button>
          </div>
        </li>)}
      </ol>
      <div className="soma-structure-level pinned">
        <strong>Network Element</strong><span>Always last · locked</span>
      </div>
      <section aria-label="Structure example path" className="soma-structure-preview">
        <h3>Display path preview</h3>
        <p>{structurePath(draft)}</p>
        <p>This path illustrates display grouping only. Actual physical and containment links
          remain in the owning Infrastructure records.</p>
      </section>
      <p>Applies to the current bounded explorer page. Other owner pages remain
        available through the unchanged backend cursor.</p>
    </div>
    <footer className="soma-structure-dialog-footer">
      <small>Session view only · No changes to SOMA records.</small>
      <div className="soma-structure-dialog-actions">
        <button type="button" onClick={dismiss}>Cancel</button>
        <button type="button" className="primary" onClick={apply}>Apply view</button>
      </div>
    </footer>
  </dialog>;
}
