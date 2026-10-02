'use client';
// Preview of a presentation_draft candidate as the two things it can become:
// the slide deck (rendered by SlideCanvas from the backend's own
// deck_slides_from_payload output, so it is the deck a promotion creates) and
// the written brief (mirroring the .docx layout). Every citation is a chip
// with the record's real name -- locator, claim text, entity caption -- that
// opens the provenance trace, never a raw UUID.
import dynamic from 'next/dynamic';
import {useCallback, useEffect, useMemo, useState} from 'react';
import type {KeyboardEvent, ReactElement} from 'react';
import {ChevronLeft, ChevronRight} from 'lucide-react';

import type {AiCitationRef, ChartVisual, CitationDetail, DeckSlide, DeckStyle, JsonObject, JsonValue, PresentationDraftPayload, PresentationSection, PresentationStyleCatalog, PresentationVisual, QuotedRef, VisualStyle} from '../../lib/api-types';
import {Button} from '@/components/ui/button';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {DECK, SlideCanvas, SlideStyleProvider, SourcesCanvas, buildCitationLookup, displayDate, formatValue, isStyledVisual, refKey, resolveTheme} from './slide-canvas';

// ECharts loads only when a brief actually holds a chart.
const ChartFigure = dynamic(() => import('./chart-visual').then(m => m.ChartFigure), {ssr: false, loading: () => <p className="text-xs">Loading chart…</p>});
import {StylePanel} from './style-panel';
import type {CitationLookup} from './slide-canvas';

export type TraceHandler = (detail: CitationDetail) => void;

const isObj = (v: JsonValue | undefined): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: JsonValue | undefined) => (typeof v === 'string' ? v : '');
const refs = (v: JsonValue | undefined): AiCitationRef[] => (Array.isArray(v) ? v.filter(isObj).filter(r => typeof r.record_type === 'string' && typeof r.record_id === 'string').map(r => ({record_type: r.record_type as string, record_id: r.record_id as string})) : []);

const quotedRefs = (v: JsonValue | undefined): QuotedRef[] => (Array.isArray(v) ? v.filter(isObj)
  .filter(r => typeof r.record_type === 'string' && typeof r.record_id === 'string' && typeof r.matched_text === 'string')
  .map(r => ({record_type: r.record_type as string, record_id: r.record_id as string, matched_text: r.matched_text as string,
    locator: typeof r.locator === 'string' ? r.locator : null})) : []);

/** A chart is stored resolved (backend app/ai/chart_check.py): its rows,
 * the checked drawing and its words. Anything less is not drawn. */
function asChart(v: JsonObject): ChartVisual | null {
  const data = v.data, option = v.option, text = v.text, spec = v.spec;
  if (!isObj(data) || !Array.isArray(data.rows) || !isObj(option) || !isObj(text) || !isObj(spec)) return null;
  const table = isObj(text.data_table) ? text.data_table : null;
  if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) return null;
  const rows = data.rows.filter(isObj).filter(r => typeof r.label === 'string' && typeof r.value === 'number')
    .map(r => ({...r, label: r.label as string, value: r.value as number, record_refs: refs(r.record_refs), record_count: typeof r.record_count === 'number' ? r.record_count : 0}));
  const tableRows = table.rows.filter(isObj).filter(r => typeof r.label === 'string' && typeof r.value === 'number')
    .map(r => ({label: r.label as string, value: r.value as number, formatted: str(r.formatted), record_count: typeof r.record_count === 'number' ? r.record_count : 0, record_refs: refs(r.record_refs),
      // Only the kinds that write them: a part's share, a scatter plot's second number.
      ...(typeof r.share === 'number' ? {share: r.share} : {}),
      ...(typeof r.x === 'number' ? {x: r.x} : {}),
      ...(typeof r.x_formatted === 'string' ? {x_formatted: r.x_formatted} : {})}));
  return {
    type: 'chart', spec, option, data: {...data, rows},
    width: typeof v.width === 'number' ? v.width : undefined, height: typeof v.height === 'number' ? v.height : undefined,
    text: {alt_text: str(text.alt_text), description: str(text.description), source_line: str(text.source_line),
      data_table: {columns: table.columns.map(c => str(c)), rows: tableRows}},
  };
}

function asVisual(v: JsonValue | undefined): PresentationVisual | null {
  if (isObj(v) && v.type === 'chart') return asChart(v);
  if (!isObj(v) || !Array.isArray(v.items)) return null;
  const items = v.items.filter(isObj);
  if (v.type === 'figures') return {type: 'figures', items: items.map(i => ({value: str(i.value), label: str(i.label), evidence: refs(i.evidence)}))};
  if (v.type === 'timeline') return {type: 'timeline', items: items.map(i => ({date: str(i.date), label: str(i.label), evidence: refs(i.evidence)}))};
  if (v.type === 'bar') return {type: 'bar', title: str(v.title), unit: str(v.unit), items: items.filter(i => typeof i.value === 'number').map(i => ({value: i.value as number, label: str(i.label), evidence: refs(i.evidence)}))};
  return null;
}

/** Defensive read of a candidate payload (it's stored as untyped JSON). */
export function asDraft(payload: JsonObject | null | undefined): PresentationDraftPayload {
  const p = payload || {};
  const sections: PresentationSection[] = (Array.isArray(p.sections) ? p.sections : []).filter(isObj).map(s => ({
    heading: str(s.heading), body: str(s.body),
    key_points: Array.isArray(s.key_points) ? s.key_points.map(k => str(k)).filter(Boolean) : [],
    key_point_evidence: Array.isArray(s.key_point_evidence) ? s.key_point_evidence.map(quotedRefs) : [],
    evidence: refs(s.evidence), visual: asVisual(s.visual),
  }));
  return {
    title: str(p.title), goal_restated: str(p.goal_restated), executive_takeaway: str(p.executive_takeaway), sections,
    open_questions: Array.isArray(p.open_questions) ? p.open_questions.map(q => str(q)).filter(Boolean) : [],
  };
}

export function EvidenceChip({detail, number, onTrace}: {detail: CitationDetail | undefined, number?: number, onTrace?: TraceHandler}): ReactElement | null {
  if (!detail) return null;
  const tip = [detail.quote ? `“${detail.quote}”` : '', detail.source_title || '', detail.detail || ''].filter(Boolean).join('\n');
  return <button
    type="button"
    onClick={() => onTrace?.(detail)}
    disabled={!onTrace || detail.missing}
    title={tip || detail.label}
    data-testid="evidence-chip"
    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/60 py-0.5 pl-1 pr-2.5 text-left text-xs text-foreground transition-colors hover:border-primary/60 hover:bg-muted disabled:cursor-default disabled:opacity-70"
  >
    {number !== undefined && <span className="rounded-full bg-primary/15 px-1.5 font-semibold tabular-nums text-primary">{number}</span>}
    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{detail.type_label}</span>
    <span className="truncate">{detail.missing ? 'Record no longer available' : detail.label}</span>
  </button>;
}

function Cite({items, lookup, onTrace}: {items: AiCitationRef[], lookup: CitationLookup, onTrace?: TraceHandler}): ReactElement {
  const unique = Array.from(new Map(items.map(r => [refKey(r), r])).values());
  return <>{unique.map(r => {
    const n = lookup.numbers.get(refKey(r));
    const d = lookup.details.get(refKey(r));
    return <button key={refKey(r)} type="button" onClick={() => d && onTrace?.(d)} disabled={!d || !onTrace} title={d ? `${d.type_label}: ${d.label}` : refKey(r)}
      className="ml-0.5 align-super text-[0.68em] font-semibold" style={{color: DECK.brassDeep}}>[{n ?? '?'}]</button>;
  })}</>;
}

function BriefVisual({visual, lookup, onTrace}: {visual: PresentationVisual, lookup: CitationLookup, onTrace?: TraceHandler}): ReactElement {
  if (visual.type === 'chart') {
    return <ChartFigure visual={visual} renderCitations={rowRefs => <Cite items={rowRefs} lookup={lookup} onTrace={onTrace}/>}/>;
  }
  if (visual.type === 'figures') {
    return <div className="my-4 grid gap-3" style={{gridTemplateColumns: `repeat(${visual.items.length}, minmax(0, 1fr))`}}>
      {visual.items.map((item, i) => <div key={i} className="rounded-md px-4 py-3" style={{background: DECK.panel, borderLeft: `3px solid ${DECK.oxblood}`}}>
        <div style={{fontFamily: 'Georgia, serif', fontSize: 30, lineHeight: 1.05, color: DECK.oxblood}}>{item.value}</div>
        <div className="mt-1 text-[13px] leading-snug" style={{color: DECK.ink}}>{item.label}<Cite items={item.evidence} lookup={lookup} onTrace={onTrace}/></div>
      </div>)}
    </div>;
  }
  if (visual.type === 'timeline') {
    return <ol className="my-4 border-l-2 pl-5" style={{borderColor: DECK.rule}}>
      {visual.items.map((item, i) => <li key={i} className="relative mb-3 last:mb-0">
        <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2" style={{borderColor: DECK.brass, background: DECK.paper}}/>
        <div className="text-xs font-bold uppercase tracking-wider" style={{color: DECK.brassDeep}}>{displayDate(item.date)}</div>
        <div className="text-[15px]" style={{color: DECK.ink}}>{item.label}<Cite items={item.evidence} lookup={lookup} onTrace={onTrace}/></div>
      </li>)}
    </ol>;
  }
  const top = Math.max(...visual.items.map(i => Math.abs(i.value)), 1);
  return <figure className="my-4">
    {visual.title && <figcaption className="mb-2 text-xs font-bold" style={{color: DECK.taupe}}>{visual.title}</figcaption>}
    <div className="grid gap-2">
      {visual.items.map((item, i) => <div key={i} className="grid items-center gap-3 text-[13px]" style={{gridTemplateColumns: '34% 1fr 4.5rem', color: DECK.ink}}>
        <span className="truncate">{item.label}<Cite items={item.evidence} lookup={lookup} onTrace={onTrace}/></span>
        <span className="h-3 rounded-sm" style={{width: `${Math.max(2, (Math.abs(item.value) / top) * 100)}%`, background: DECK.brass}}/>
        <span className="text-right font-bold tabular-nums">{formatValue(item.value, visual.unit)}</span>
      </div>)}
    </div>
  </figure>;
}

/** Each key point with the words the quote check found in its cited record. */
function CheckedQuotes({section, lookup}: {section: PresentationSection, lookup: CitationLookup}): ReactElement | null {
  const rows = section.key_points.map((point, i) => ({point, quotes: section.key_point_evidence?.[i] || []})).filter(r => r.quotes.length);
  if (!rows.length) return null;
  return <details data-testid="checked-quotes" className="mt-3 text-[13px]" style={{fontFamily: 'Inter, sans-serif', color: DECK.taupe}}>
    <summary className="cursor-pointer">Quotes found in the records ({rows.length} key point{rows.length === 1 ? '' : 's'})</summary>
    <ul className="mt-2 space-y-2">{rows.map((row, i) => <li key={i}>
      <div style={{color: DECK.ink}}>{row.point}</div>
      {row.quotes.map((q, j) => <div key={j} className="pl-3">
        <mark style={{background: DECK.panel, color: DECK.ink}}>“{q.matched_text}”</mark>
        {' '}— {lookup.details.get(refKey(q))?.label || `${q.record_type}:${q.record_id}`}{q.locator ? `, ${q.locator}` : ''}
      </div>)}
    </li>)}</ul>
  </details>;
}

function BriefView({draft, lookup, onTrace}: {draft: PresentationDraftPayload, lookup: CitationLookup, onTrace?: TraceHandler}): ReactElement {
  return <article data-testid="brief-preview" className="mx-auto max-w-[46rem] rounded-md px-8 py-9 shadow-lg sm:px-12" style={{background: DECK.paper, color: DECK.ink, fontFamily: 'Georgia, serif'}}>
    <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{color: DECK.brassDeep, fontFamily: 'Inter, sans-serif'}}>Investigation brief</div>
    <h2 className="mt-1 text-[28px] leading-tight" style={{color: DECK.ink}}>{draft.title}</h2>
    <div className="mt-3 h-[2px] w-full" style={{background: DECK.brass}}/>
    {draft.goal_restated && <p className="mt-4 italic leading-relaxed" style={{color: DECK.taupe}}>{draft.goal_restated}</p>}
    {draft.executive_takeaway && <aside className="my-5 rounded-sm px-5 py-4" style={{background: DECK.panel, borderLeft: `4px solid ${DECK.brass}`}}>
      <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{color: DECK.brassDeep, fontFamily: 'Inter, sans-serif'}}>The takeaway</div>
      <p className="mt-1.5 text-[17px] leading-relaxed">{draft.executive_takeaway}</p>
    </aside>}
    {draft.sections.map((s, i) => <section key={i} className="mt-6">
      <h3 className="text-[20px]" style={{color: DECK.ink}}>{s.heading}</h3>
      {s.body.split(/\n\n+/).map((para, j, all) => <p key={j} className="mt-2 text-[15px] leading-[1.7]">{para}{j === all.length - 1 && <Cite items={s.evidence} lookup={lookup} onTrace={onTrace}/>}</p>)}
      {s.visual && <BriefVisual visual={s.visual} lookup={lookup} onTrace={onTrace}/>}
      <CheckedQuotes section={s} lookup={lookup}/>
    </section>)}
    {draft.open_questions.length > 0 && <aside className="mt-7 rounded-sm px-5 py-4" style={{background: DECK.panel, borderLeft: `4px solid ${DECK.oxblood}`}}>
      <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{color: DECK.oxblood, fontFamily: 'Inter, sans-serif'}}>Open questions</div>
      <ol className="mt-2 space-y-1.5">{draft.open_questions.map((q, i) => <li key={i} className="flex gap-3 text-[15px]"><span style={{color: DECK.oxblood}}>{String(i + 1).padStart(2, '0')}</span><span>{q}</span></li>)}</ol>
    </aside>}
  </article>;
}

type Frame = {kind: 'slide', slide: DeckSlide, contentIndex: number} | {kind: 'sources'};

/** Attach each section's chosen style to its content slide's visual (the Nth
 *  content slide is section N-1, as in backend deck_slides_from_payload). */
export function applyVisualStyles(slides: DeckSlide[], visualStyles: Record<string, VisualStyle>): DeckSlide[] {
  let section = -1;
  return slides.map(slide => {
    if ((slide.kind || 'content') !== 'content') return slide;
    section += 1;
    const style = visualStyles[String(section)];
    return isStyledVisual(slide.visual) && style ? {...slide, visual: {...slide.visual, style}} : slide;
  });
}

export type DraftPreviewProps = {
  payload: JsonObject, slides: DeckSlide[], citationDetails: CitationDetail[], onTrace?: TraceHandler,
  // Style (optional): with a catalogue and change handlers, the Slides tab shows the style panel.
  catalog?: PresentationStyleCatalog | null,
  deckStyle?: DeckStyle,
  onDeckStyleChange?: (style: DeckStyle) => void,
  visualStyles?: Record<string, VisualStyle>,
  onVisualStyleChange?: (section: string, style: VisualStyle) => void,
};

export function DraftPreview({payload, slides: baseSlides, citationDetails, onTrace, catalog, deckStyle, onDeckStyleChange, visualStyles, onVisualStyleChange}: DraftPreviewProps): ReactElement {
  const draft = useMemo(() => asDraft(payload), [payload]);
  const slides = useMemo(() => applyVisualStyles(baseSlides, visualStyles || {}), [baseSlides, visualStyles]);
  const theme = useMemo(() => resolveTheme(catalog, deckStyle), [catalog, deckStyle]);
  const lookup = useMemo(() => buildCitationLookup(slides, citationDetails), [slides, citationDetails]);
  const frames = useMemo<Frame[]>(() => {
    let n = 0;
    const list: Frame[] = slides.map(slide => ({kind: 'slide', slide, contentIndex: (slide.kind || 'content') === 'content' ? ++n : 0}));
    if (lookup.numbers.size) list.push({kind: 'sources'});
    return list;
  }, [slides, lookup]);
  const contentTotal = slides.filter(s => (s.kind || 'content') === 'content').length;
  const [current, setCurrent] = useState(0);
  useEffect(() => setCurrent(0), [baseSlides]);
  const go = useCallback((delta: number) => setCurrent(c => Math.min(frames.length - 1, Math.max(0, c + delta))), [frames.length]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  };
  const renderFrame = (frame: Frame, page: number) => frame.kind === 'sources'
    ? <SourcesCanvas lookup={lookup} page={page} deckTitle={draft.title}/>
    : <SlideCanvas slide={frame.slide} page={page} contentIndex={frame.contentIndex} contentTotal={contentTotal} deckTitle={draft.title} lookup={lookup} sourceCount={lookup.numbers.size}/>;
  const active = frames[current];
  const notes = active?.kind === 'slide' ? active.slide.notes : '';
  const orderedDetails = Array.from(lookup.numbers.entries()).map(([key, n]) => ({n, d: lookup.details.get(key)}));
  const styling = Boolean(catalog && deckStyle && onDeckStyleChange && onVisualStyleChange);
  const activeSection = active?.kind === 'slide' && active.contentIndex > 0 ? String(active.contentIndex - 1) : null;
  const activeVisual = active?.kind === 'slide' ? active.slide.visual || null : null;

  return <SlideStyleProvider theme={theme} presets={catalog?.visual_presets}><Tabs defaultValue="slides" className="w-full" data-testid="draft-preview">
    <TabsList>
      <TabsTrigger value="slides">Slides · {frames.length}</TabsTrigger>
      <TabsTrigger value="brief">Brief</TabsTrigger>
      <TabsTrigger value="sources">Sources · {lookup.numbers.size}</TabsTrigger>
    </TabsList>

    <TabsContent value="slides">
      <div className={styling ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]' : ''}>
      <div className="min-w-0">
      <div tabIndex={0} onKeyDown={onKey} aria-label="Slide preview, use the left and right arrow keys to move between slides" className="rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-ring">
        {active && renderFrame(active, current + 1)}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => go(-1)} disabled={current === 0} aria-label="Previous slide"><ChevronLeft className="h-4 w-4"/></Button>
        <span className="text-xs tabular-nums text-muted-foreground" data-testid="slide-position">{current + 1} / {frames.length}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => go(1)} disabled={current >= frames.length - 1} aria-label="Next slide"><ChevronRight className="h-4 w-4"/></Button>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Slides">
        {frames.map((frame, i) => <button key={i} type="button" role="tab" aria-selected={i === current} aria-label={`Go to slide ${i + 1}`} onClick={() => setCurrent(i)}
          className={`w-28 shrink-0 rounded-md p-0.5 transition ${i === current ? 'ring-2 ring-primary' : 'opacity-70 hover:opacity-100'}`}>
          <div className="pointer-events-none" aria-hidden>{renderFrame(frame, i + 1)}</div>
        </button>)}
      </div>
      {notes && <details className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm" open>
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground">Speaker notes</summary>
        <p className="mt-1.5 leading-relaxed text-foreground/90">{notes}</p>
      </details>}
      </div>
      {styling && catalog && deckStyle && onDeckStyleChange && onVisualStyleChange && <StylePanel
        catalog={catalog} deckStyle={deckStyle} onDeckStyle={onDeckStyleChange}
        visual={activeVisual} sectionLabel={active?.kind === 'slide' ? active.slide.heading : undefined}
        onVisualStyle={style => { if (activeSection !== null) onVisualStyleChange(activeSection, style); }}
      />}
      </div>
    </TabsContent>

    <TabsContent value="brief"><BriefView draft={draft} lookup={lookup} onTrace={onTrace}/></TabsContent>

    <TabsContent value="sources">
      {orderedDetails.length === 0 ? <p className="text-sm text-muted-foreground">This draft cites no records.</p> : <ol className="space-y-2" data-testid="sources-list">
        {orderedDetails.map(({n, d}) => <li key={n} className="rounded-md border border-border bg-card/60 p-3">
          <EvidenceChip detail={d} number={n} onTrace={onTrace}/>
          {d?.quote && <blockquote className="mt-2 border-l-2 border-primary/50 pl-3 text-sm italic text-foreground/90" style={{fontFamily: 'Georgia, serif'}}>“{d.quote}”</blockquote>}
          {d?.source_title && d.source_title !== d.label && <div className="mt-1 text-xs text-muted-foreground">{d.source_title}</div>}
        </li>)}
      </ol>}
    </TabsContent>
  </Tabs></SlideStyleProvider>;
}
