'use client';
// The inspector slot (DECISIONS_LOG 12, calls 11-12, 16 and 32; research §7.5 idea M): one thing open at a time, at the
// right, beside the work rather than over it. Anything opened from the page (a party's dossier, a record's Chain of
// Custody) lands here and replaces what was there; a link followed inside the slot moves along a trail (Kestrel SA ›
// Custody: the 2019 minutes), which names the way back. Back or Esc goes one step back; from the first step, Esc
// closes. The page keeps its place: the slot takes room from the page, it never covers the row it came from.
//
// Opening it moves focus in, and closing it gives focus back to what had it. The address carries the slot: one entry
// is pushed when it opens, so the browser's Back closes it, and ?dossier=<id> names the party shown, so a reload opens
// it again. Its width is dragged from the handle on its left edge (or the arrow keys on it) and kept per device; at
// phone width it is a bottom sheet a swipe down closes. A dossier offers its party in Bring in › Connectors, where the
// party is enriched from outside sources.
import {useQuery} from '@tanstack/react-query';
import {useEffect, useRef, useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactElement} from 'react';

import {PanelErrorBoundary} from '../../components/panel-error-boundary';
import {caseHref} from '../../lib/case-href';
import {getEntityDossierOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {escapeTaken} from '../../lib/on-screen';
import {markSlotInteraction, useWorkbenchStore} from '../../lib/workbench-store';
import type {InspectorItem} from '../../lib/workbench-store';
import {DossierPanel} from '../dossier/dossier-panel';
import {ProvenancePanel} from '../provenance/provenance-panel';

const PARAM = 'dossier';
const WIDTH_KEY = 'wb.slotWidth';
const MIN_WIDTH = 360;
const maxWidth = (): number => Math.max(MIN_WIDTH, Math.round(window.innerWidth * 0.7));
const clampWidth = (w: number): number => Math.min(maxWidth(), Math.max(MIN_WIDTH, Math.round(w)));
/** The width the reporter chose, on :root, which the stylesheet's --slot-w uses above phone and tablet widths. */
function applyWidth(w: number | null): void {
  if (w === null) document.documentElement.style.removeProperty('--slot-w-chosen');
  else document.documentElement.style.setProperty('--slot-w-chosen', `${w}px`);
}

type HistoryState = Record<string, unknown> & {wbSlot?: boolean};
const historyState = (): HistoryState => (window.history.state ?? {}) as HistoryState;
const partyInAddress = (): string | null => new URL(window.location.href).searchParams.get(PARAM);
/** The address with ?dossier= set to the party shown, or taken out. */
function addressWith(party: string | null): string {
  const url = new URL(window.location.href);
  if (party) url.searchParams.set(PARAM, party); else url.searchParams.delete(PARAM);
  return url.href;
}

function StepName({item}: {item: InspectorItem}): ReactElement {
  const dossier = useQuery({...getEntityDossierOptions({path: {entity_id: item.kind === 'dossier' ? item.entityId : ''}}), enabled: item.kind === 'dossier'});
  return <>{item.kind === 'dossier' ? dossier.data?.entity.caption ?? 'Party' : `Custody: ${item.request.title}`}</>;
}

export function InspectorSlot({investigationId, onOpenInConnectors}: {
  investigationId: string;
  /** Takes the reporter to Bring in › Connectors (the case screens' router); without it the link is followed as a link. */
  onOpenInConnectors?: () => void;
}): ReactElement {
  const trail = useWorkbenchStore(state => state.inspector);
  const back = useWorkbenchStore(state => state.inspectorBack);
  const close = useWorkbenchStore(state => state.closeInspector);
  const openDossier = useWorkbenchStore(state => state.openDossier);
  const item = trail[trail.length - 1];
  const open = Boolean(item);
  const party = item?.kind === 'dossier' ? item.entityId : null;

  const slotRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  /** Closes the slot from its own controls; when it pushed the address's entry, by going Back, so history stays as it was. */
  const leave = () => {
    const pushed = Boolean(historyState().wbSlot);
    close();
    if (pushed) window.history.back();
  };
  const stepBack = () => { if (trail.length > 1) back(); else leave(); };

  // Esc steps back (a dialog or a menu that took the key first keeps it). The slot is a layer over the screens: it takes
  // the key (preventDefault), and the screen under it does not act on that Esc (lib/on-screen.ts, DECISIONS_LOG 40).
  const stepBackRef = useRef(stepBack);
  stepBackRef.current = stepBack;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.shiftKey || escapeTaken(e, slotRef.current)) return;
      e.preventDefault();
      stepBackRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Focus moves in when the slot opens and goes back to what had it when it closes.
  useEffect(() => {
    if (!open) return undefined;
    const active = document.activeElement;
    const slot = slotRef.current;
    const returnTo = active instanceof HTMLElement && active !== document.body && !slot?.contains(active) ? active : null;
    closeRef.current?.focus({preventScroll: true});
    return () => {
      // Only when focus was still in the slot (or dropped with it): a reporter who clicked elsewhere keeps that place.
      const now = document.activeElement;
      if (returnTo?.isConnected && (!now || now === document.body || slot?.contains(now))) returnTo.focus({preventScroll: true});
    };
  }, [open]);

  // A party named in the address when the page loaded opens once the case is known (a new case clears the slot).
  const fromAddress = useRef<string | null | undefined>(undefined);
  if (fromAddress.current === undefined) fromAddress.current = typeof window === 'undefined' ? null : partyInAddress();
  useEffect(() => {
    if (!investigationId || !fromAddress.current) return;
    const id = fromAddress.current;
    fromAddress.current = null;
    openDossier(id);
  }, [investigationId, openDossier]);

  // The address follows the slot: opening pushes one entry, a new step replaces the party named, closing takes it out.
  useEffect(() => {
    if (fromAddress.current) return;
    const state = historyState();
    if (open) {
      if (!state.wbSlot) window.history.pushState({...state, wbSlot: true}, '', addressWith(party));
      else if (partyInAddress() !== party) window.history.replaceState(state, '', addressWith(party));
    } else if (state.wbSlot || partyInAddress()) {
      const {wbSlot: _ours, ...rest} = state;
      window.history.replaceState(rest, '', addressWith(null));
    }
  }, [open, party]);

  // The browser's Back closes the slot; Forward opens the party again.
  useEffect(() => {
    const follow = (event: PopStateEvent) => {
      const ours = Boolean((event.state as HistoryState | null)?.wbSlot);
      const shown = useWorkbenchStore.getState().inspector.length > 0;
      if (shown && !ours) close();
      else if (!shown && ours) { const id = partyInAddress(); if (id) openDossier(id); }
    };
    window.addEventListener('popstate', follow);
    return () => window.removeEventListener('popstate', follow);
  }, [close, openDossier]);

  // The width the reporter dragged to, kept per device.
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    let saved: number | null = null;
    try { saved = Number(window.localStorage.getItem(WIDTH_KEY)) || null; } catch { /* a convenience only */ }
    if (saved) { setWidth(clampWidth(saved)); applyWidth(clampWidth(saved)); }
    return () => applyWidth(null);
  }, []);
  const choose = (w: number, keep: boolean) => {
    const next = clampWidth(w);
    setWidth(next);
    applyWidth(next);
    if (keep) try { window.localStorage.setItem(WIDTH_KEY, String(next)); } catch { /* a convenience only */ }
  };
  const drag = useRef<{x: number; w: number} | null>(null);
  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = {x: e.clientX, w: slotRef.current?.getBoundingClientRect().width || width || 520};
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onHandleMove = (e: ReactPointerEvent<HTMLDivElement>) => { if (drag.current) choose(drag.current.w + drag.current.x - e.clientX, false); };
  const onHandleUp = () => { if (drag.current) { drag.current = null; if (width) choose(width, true); } };
  const onHandleKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const by = e.key === 'ArrowLeft' ? 40 : e.key === 'ArrowRight' ? -40 : 0;
    if (!by) return;
    e.preventDefault();
    choose((slotRef.current?.getBoundingClientRect().width || width || 520) + by, true);
  };

  // At phone width the sheet closes on a swipe down from its top.
  const swipe = useRef<number | null>(null);

  return <aside ref={slotRef} className="wb-slot" hidden={!item} aria-label="Inspector" data-layer=""
    onClickCapture={markSlotInteraction} onKeyDownCapture={e => { if (e.key === 'Enter' || e.key === ' ') markSlotInteraction(); }}
    onTouchStart={e => { swipe.current = (slotRef.current?.scrollTop ?? 0) <= 0 ? e.touches[0].clientY : null; }}
    onTouchEnd={e => {
      if (swipe.current !== null && e.changedTouches[0].clientY - swipe.current > 70 && window.matchMedia?.('(max-width: 640px)').matches) leave();
      swipe.current = null;
    }}>
    <div className="wb-slot-handle" role="separator" aria-orientation="vertical" aria-label="Inspector width" tabIndex={0}
      aria-valuenow={width ?? undefined} aria-valuemin={MIN_WIDTH} title="Drag, or ← →, to change the width"
      onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp} onKeyDown={onHandleKey}/>
    <header className="wb-slot-head">
      {trail.length > 1 && <button type="button" className="wb-slot-back" onClick={back}>‹ Back</button>}
      <nav aria-label="Trail"><ol>{trail.map((step, i) => <li key={step.serial} aria-current={i === trail.length - 1 ? 'step' : undefined}><StepName item={step}/></li>)}</ol></nav>
      {party && <a className="wb-slot-full" href={caseHref('/bring-in#connectors', investigationId)} title="Enrich this party from outside sources"
        onClick={e => { if (onOpenInConnectors) { e.preventDefault(); onOpenInConnectors(); } }}>Open in Bring in › Connectors</a>}
      <button ref={closeRef} type="button" className="wb-drawer-close" onClick={leave} aria-label="Close the inspector" title="Close (Esc)">×</button>
    </header>
    {item?.kind === 'dossier' && <PanelErrorBoundary name="Dossier"><DossierPanel key={item.serial} investigationId={investigationId} entityId={item.entityId}/></PanelErrorBoundary>}
    {item?.kind === 'custody' && <PanelErrorBoundary name="Chain of Custody"><ProvenancePanel investigationId={investigationId}/></PanelErrorBoundary>}
  </aside>;
}
