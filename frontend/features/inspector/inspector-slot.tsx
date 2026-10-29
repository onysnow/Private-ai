'use client';
// The inspector slot (DECISIONS_LOG 12, calls 11-12, and 16; research §7.5 idea M): one thing open at a time, at the
// right, beside the work rather than over it. Anything opened from the page (a party's dossier, a record's Chain of
// Custody) lands here and replaces what was there; a link followed inside the slot moves along a trail (Kestrel SA ›
// Custody: the 2019 minutes), which names the way back. Back or Esc goes one step back; from the first step, Esc
// closes. The page keeps its place: the slot takes room from the page, it never covers the row it came from.
import {useQuery} from '@tanstack/react-query';
import {useEffect} from 'react';
import type {ReactElement} from 'react';

import {PanelErrorBoundary} from '../../components/panel-error-boundary';
import {getEntityDossierOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {markSlotInteraction, useWorkbenchStore} from '../../lib/workbench-store';
import type {InspectorItem} from '../../lib/workbench-store';
import {DossierPanel} from '../dossier/dossier-panel';
import {ProvenancePanel} from '../provenance/provenance-panel';

function StepName({item}: {item: InspectorItem}): ReactElement {
  const dossier = useQuery({...getEntityDossierOptions({path: {entity_id: item.kind === 'dossier' ? item.entityId : ''}}), enabled: item.kind === 'dossier'});
  return <>{item.kind === 'dossier' ? dossier.data?.entity.caption ?? 'Party' : `Custody: ${item.request.title}`}</>;
}

export function InspectorSlot({investigationId}: {investigationId: string}): ReactElement {
  const trail = useWorkbenchStore(state => state.inspector);
  const back = useWorkbenchStore(state => state.inspectorBack);
  const close = useWorkbenchStore(state => state.closeInspector);
  const item = trail[trail.length - 1];

  // Esc steps back (a dialog or a menu that took the key first keeps it).
  useEffect(() => {
    if (!item) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) back(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, back]);

  return <aside className="wb-slot" hidden={!item} aria-label="Inspector"
    onClickCapture={markSlotInteraction} onKeyDownCapture={e => { if (e.key === 'Enter' || e.key === ' ') markSlotInteraction(); }}>
    <header className="wb-slot-head">
      {trail.length > 1 && <button type="button" className="wb-slot-back" onClick={back}>‹ Back</button>}
      <nav aria-label="Trail"><ol>{trail.map((step, i) => <li key={step.serial} aria-current={i === trail.length - 1 ? 'step' : undefined}><StepName item={step}/></li>)}</ol></nav>
      <button type="button" className="wb-drawer-close" onClick={close} aria-label="Close the inspector">×</button>
    </header>
    {item?.kind === 'dossier' && <PanelErrorBoundary name="Dossier"><DossierPanel key={item.serial} investigationId={investigationId} entityId={item.entityId}/></PanelErrorBoundary>}
    {item?.kind === 'custody' && <PanelErrorBoundary name="Chain of Custody"><ProvenancePanel investigationId={investigationId}/></PanelErrorBoundary>}
  </aside>;
}
