'use client';
// One deck slide drawn in HTML, mirroring backend/app/services/decks.py's
// .pptx layout (same 13.333in x 7.5in canvas, same positions, palette and
// fit rules), so the in-app preview shows what the export will look like
// before anything is promoted or downloaded.
//
// Sizing is container-relative: the canvas sets `container-type: inline-size`
// and every length below is in `cqw`, so one component renders a full-width
// slide and a 120px filmstrip thumbnail identically.
import type {CSSProperties, ReactElement} from 'react';

import type {AiCitationRef, CitationDetail, DeckSlide, PresentationVisual} from '../../lib/api-types';

export const DECK = {
  night: '#141B1F', nightLine: '#2B3439', parchment: '#ECE3D2', parchmentMuted: '#B5A88F',
  brass: '#B98D34', brassDeep: '#8A6420', oxblood: '#672C1A', paper: '#F7F2E8', panel: '#EDE4D3',
  rule: '#D9CDB6', ink: '#1F1B16', taupe: '#7A6950',
};
const SERIF = "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif";
const SANS = "Calibri, Inter, ui-sans-serif, system-ui, sans-serif";
const W = 13.333;
const H = 7.5;

const pt = (n: number) => `${((n * 100) / (W * 72)).toFixed(3)}cqw`;
const box = (x: number, y: number, w: number, h: number): CSSProperties => ({position: 'absolute', left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, width: `${(w / W) * 100}%`, height: `${(h / H) * 100}%`});

/** Port of decks.py _fit_size: largest pt size at which the paragraphs fit the box. */
export function fitSize(texts: string[], widthIn: number, heightIn: number, sizes: number[], {charW = 0.5, lineSpacing = 1.2, gapPt = 8} = {}): number {
  const list = texts.filter(Boolean);
  const items = list.length ? list : [''];
  for (const size of sizes) {
    const perLine = Math.max(8, Math.floor((widthIn * 72) / (size * charW)));
    const lines = items.reduce((n, t) => n + Math.max(1, Math.ceil(t.length / perLine)), 0);
    if (lines * size * lineSpacing + gapPt * (items.length - 1) <= heightIn * 72) return size;
  }
  return sizes[sizes.length - 1];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Port of decks.py display_date: '2023-11-14' -> '14 Nov 2023'; never adds precision. */
export function displayDate(value: string): string {
  const parts = (value || '').trim().split('-');
  const month = Number(parts[1]);
  if (parts.length === 3 && parts[0].length === 4 && month >= 1 && month <= 12 && Number(parts[2])) return `${Number(parts[2])} ${MONTHS[month - 1]} ${parts[0]}`;
  if (parts.length === 2 && parts[0].length === 4 && month >= 1 && month <= 12) return `${MONTHS[month - 1]} ${parts[0]}`;
  return value;
}

export function formatValue(value: number, unit?: string): string {
  const prefix = ({USD: '$', 'US$': '$', $: '$', EUR: '€', '€': '€', GBP: '£', '£': '£'} as Record<string, string>)[(unit || '').toUpperCase()] || '';
  const suffix = prefix || !unit ? '' : ` ${unit}`;
  const abs = Math.abs(value);
  const text = abs >= 1_000_000 ? `${(value / 1_000_000).toLocaleString('en-US', {maximumFractionDigits: 1})}M` : abs >= 1_000 ? `${Math.round(value / 1_000).toLocaleString('en-US')}K` : value.toLocaleString('en-US', {maximumFractionDigits: 2});
  return `${prefix}${text}${suffix}`;
}

export type CitationLookup = {numbers: Map<string, number>, details: Map<string, CitationDetail>};
export const refKey = (r: AiCitationRef): string => `${r.record_type}:${r.record_id}`;

/** Number every ref in first-appearance order, the same order the export's sources slide uses. */
export function buildCitationLookup(slides: DeckSlide[], details: CitationDetail[] = []): CitationLookup {
  const numbers = new Map<string, number>();
  for (const slide of slides) {
    const refs = [...(slide.evidence || []), ...((slide.visual?.items || []) as {evidence?: AiCitationRef[]}[]).flatMap(i => i.evidence || [])];
    for (const r of refs) if (r.record_type && r.record_id && !numbers.has(refKey(r))) numbers.set(refKey(r), numbers.size + 1);
  }
  return {numbers, details: new Map(details.map(d => [refKey(d), d]))};
}

const markers = (refs: AiCitationRef[] | undefined, lookup: CitationLookup) => {
  const nums = Array.from(new Set((refs || []).map(r => lookup.numbers.get(refKey(r))).filter((n): n is number => typeof n === 'number'))).sort((a, b) => a - b);
  return nums.map(n => `[${n}]`).join(' ');
};

function Kicker({x, y, text, color}: {x: number, y: number, text: string, color: string}): ReactElement {
  return <div style={{...box(x, y, 8, 0.3), fontFamily: SANS, fontWeight: 700, fontSize: pt(11), letterSpacing: '0.22em', textTransform: 'uppercase', color}}>{text}</div>;
}

function Footer({refs, lookup, title, page, dark}: {refs: AiCitationRef[], lookup: CitationLookup, title: string, page: number, dark: boolean}): ReactElement {
  const muted = dark ? DECK.parchmentMuted : DECK.taupe;
  const sources = markers(refs, lookup);
  return <>
    <div style={{...box(0.75, 6.88, W - 1.5, 0.012), background: dark ? DECK.nightLine : DECK.rule}}/>
    {sources && <div style={{...box(0.75, 6.98, 8, 0.3), fontFamily: SANS, fontSize: pt(10), color: muted}}>Sources {sources}</div>}
    <div style={{...box(W - 6.75, 6.98, 6, 0.3), fontFamily: SANS, fontSize: pt(10), color: muted, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{title} · {page}</div>
  </>;
}

function Bullets({x, y, w, h, items, sizes = [28, 26, 24, 22, 20, 18, 16, 15, 14]}: {x: number, y: number, w: number, h: number, items: string[], sizes?: number[]}): ReactElement {
  const size = fitSize(items, w - 0.35, h, sizes, {gapPt: 16});
  return <ul style={{...box(x, y, w, h), margin: 0, padding: 0, listStyle: 'none', fontFamily: SANS, fontSize: pt(size), lineHeight: 1.12, color: DECK.ink}}>
    {items.map((item, i) => <li key={i} style={{display: 'flex', gap: pt(10), marginBottom: pt(size >= 22 ? 16 : 10)}}>
      <span aria-hidden style={{color: DECK.brass, fontSize: '0.62em', lineHeight: 1.12 / 0.62, flex: 'none'}}>■</span><span>{item}</span>
    </li>)}
  </ul>;
}

function EvidencePanel({refs, lookup}: {refs: AiCitationRef[], lookup: CitationLookup}): ReactElement {
  const details = refs.map(r => lookup.details.get(refKey(r))).filter((d): d is CitationDetail => Boolean(d));
  const quoted = details.filter(d => d.quote).slice(0, 2);
  const rest = details.filter(d => !quoted.includes(d)).slice(0, quoted.length ? 3 : 5);
  return <div style={{...box(8.15, 2.05, 4.45, 4.6), background: DECK.panel, borderRadius: pt(10), padding: `${pt(20)} ${pt(22)}`, boxSizing: 'border-box', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: pt(12)}}>
    <div style={{fontFamily: SANS, fontWeight: 700, fontSize: pt(11), letterSpacing: '0.22em', color: DECK.oxblood}}>FROM THE RECORD</div>
    {quoted.map(d => <figure key={refKey(d)} style={{margin: 0}}>
      <blockquote style={{margin: 0, fontFamily: SERIF, fontStyle: 'italic', fontSize: pt(quoted.length > 1 ? 14 : 17), lineHeight: 1.3, color: DECK.ink, display: '-webkit-box', WebkitLineClamp: quoted.length > 1 ? 5 : 8, WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>
        <span style={{color: DECK.brass, fontSize: '1.6em', lineHeight: 0, verticalAlign: '-0.3em', marginRight: '0.1em'}}>“</span>{d.quote}
      </blockquote>
      <figcaption style={{marginTop: pt(6), fontFamily: SANS, fontSize: pt(11), color: DECK.taupe}}>[{lookup.numbers.get(refKey(d))}] {d.locator || d.label}{d.locator && d.source_title ? ` — ${d.source_title}` : ''}</figcaption>
    </figure>)}
    {rest.map(d => <div key={refKey(d)}>
      <div style={{fontFamily: SANS, fontWeight: 700, fontSize: pt(9), letterSpacing: '0.12em', color: DECK.taupe}}>[{lookup.numbers.get(refKey(d))}] {d.type_label.toUpperCase()}</div>
      <div style={{fontFamily: SANS, fontSize: pt(13), color: DECK.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{d.label}</div>
    </div>)}
    {!details.length && <div style={{fontFamily: SANS, fontStyle: 'italic', fontSize: pt(13), color: DECK.taupe}}>No cited records on this slide.</div>}
  </div>;
}

function Visual({visual, lookup, region}: {visual: PresentationVisual, lookup: CitationLookup, region: [number, number, number, number]}): ReactElement {
  const [x, y, w, h] = region;
  if (visual.type === 'figures') {
    const gap = 0.2;
    const per = (h - gap * (visual.items.length - 1)) / visual.items.length;
    return <>{visual.items.map((item, i) => {
      const valueSize = fitSize([item.value], w - 0.6, Math.min(per * 0.5, 1.0), [54, 48, 44, 40, 36, 32, 28], {charW: 0.55, lineSpacing: 1.0});
      return <div key={i} style={{...box(x, y + i * (per + gap), w, per), background: DECK.panel, borderRadius: pt(10), borderLeft: `${pt(4)} solid ${DECK.oxblood}`, padding: `${pt(12)} ${pt(22)}`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: pt(6)}}>
        <div style={{fontFamily: SERIF, fontSize: pt(valueSize), lineHeight: 1, color: DECK.oxblood}}>{item.value}</div>
        <div style={{fontFamily: SANS, fontSize: pt(per > 1.6 ? 15 : per > 1.1 ? 13 : 11), color: DECK.ink, lineHeight: 1.1}}>{item.label} <span style={{color: DECK.taupe}}>{markers(item.evidence, lookup)}</span></div>
      </div>;
    })}</>;
  }
  if (visual.type === 'timeline') {
    const n = visual.items.length;
    const step = w / n;
    const labelSize = n <= 3 ? 16 : n <= 5 ? 14 : 12;
    return <div style={box(x, y, w, h)} data-testid="slide-timeline">
      <div style={{position: 'absolute', left: 0, right: 0, top: `${(0.75 / h) * 100}%`, height: pt(2), background: DECK.rule}}/>
      {visual.items.map((item, i) => <div key={i} style={{position: 'absolute', left: `${(i * step / w) * 100}%`, width: `${(step / w) * 100}%`, top: 0, bottom: 0, textAlign: 'center', fontFamily: SANS}}>
        <div style={{fontSize: pt(labelSize + 2), fontWeight: 700, color: DECK.brassDeep, height: `${(0.55 / h) * 100}%`}}>{displayDate(item.date)}</div>
        <div style={{width: pt(16), height: pt(16), borderRadius: '50%', border: `${pt(2.5)} solid ${DECK.brass}`, background: DECK.paper, margin: '0 auto', position: 'relative', top: `calc(${(0.2 / h) * 100}% - ${pt(8)})`, boxShadow: `inset 0 0 0 ${pt(3)} ${DECK.paper}, inset 0 0 0 ${pt(8)} ${DECK.brass}`}}/>
        <div style={{marginTop: pt(22), padding: `0 ${pt(6)}`, fontSize: pt(labelSize), lineHeight: 1.1, color: DECK.ink}}>{item.label} <span style={{color: DECK.taupe}}>{markers(item.evidence, lookup)}</span></div>
      </div>)}
    </div>;
  }
  const top = Math.max(...visual.items.map(i => Math.abs(i.value)), 1);
  return <div style={{...box(x, y, w, h), display: 'flex', flexDirection: 'column', fontFamily: SANS}} data-testid="slide-bar-chart">
    {visual.title && <div style={{fontSize: pt(13), fontWeight: 700, color: DECK.taupe, marginBottom: pt(10)}}>{visual.title}</div>}
    <div style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around'}}>
      {visual.items.map((item, i) => <div key={i} style={{display: 'grid', gridTemplateColumns: '32% 1fr', alignItems: 'center', gap: pt(10)}}>
        <div style={{fontSize: pt(12), color: DECK.ink, textAlign: 'right', lineHeight: 1.1}}>{item.label}</div>
        <div style={{display: 'flex', alignItems: 'center', gap: pt(8)}}>
          <div style={{height: pt(26), width: `${Math.max(1.5, (Math.abs(item.value) / top) * 78)}%`, background: DECK.brass}}/>
          <span style={{fontSize: pt(12), fontWeight: 700, color: DECK.ink, whiteSpace: 'nowrap'}}>{formatValue(item.value, visual.unit)}</span>
        </div>
      </div>)}
    </div>
  </div>;
}

export type SlideCanvasProps = {slide: DeckSlide, page: number, contentIndex: number, contentTotal: number, deckTitle: string, lookup: CitationLookup, sourceCount: number};

export function SlideCanvas({slide, page, contentIndex, contentTotal, deckTitle, lookup, sourceCount}: SlideCanvasProps): ReactElement {
  const kind = slide.kind || 'content';
  const dark = kind === 'title' || kind === 'statement';
  const frame: CSSProperties = {position: 'relative', width: '100%', aspectRatio: `${W} / ${H}`, containerType: 'inline-size', overflow: 'hidden', background: dark ? DECK.night : DECK.paper, borderRadius: 6, boxShadow: '0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.25)'};
  const label = `Slide ${page}: ${slide.heading}`;

  if (kind === 'title') {
    const subtitle = slide.bullets.join(' ');
    const size = fitSize([slide.heading], 11.2, 2.5, [44, 40, 36, 32, 28], {charW: 0.58, lineSpacing: 1.12});
    return <div style={frame} role="img" aria-label={label} data-slide-kind="title">
      <div style={{...box(0, 0, 0.18, H), background: DECK.brass}}/>
      <Kicker x={0.95} y={1.35} text="Investigation brief" color={DECK.brass}/>
      <div style={{...box(0.95, 1.8, 11.2, 2.6), fontFamily: SERIF, fontSize: pt(size), lineHeight: 1.08, color: DECK.parchment}}>{slide.heading}</div>
      <div style={{...box(0.95, 4.55, 1.1, 0.045), background: DECK.brass}}/>
      {subtitle && <div style={{...box(0.95, 4.8, 10.6, 1.4), fontFamily: SANS, fontSize: pt(fitSize([subtitle], 10.6, 1.3, [18, 16, 15, 14])), lineHeight: 1.25, color: DECK.parchmentMuted}}>{subtitle}</div>}
      <div style={{...box(0.95, 6.75, 10, 0.3), fontFamily: SANS, fontSize: pt(11), color: DECK.parchmentMuted}}>Prepared from {sourceCount} cited record{sourceCount === 1 ? '' : 's'}</div>
    </div>;
  }

  if (kind === 'statement') {
    const text = slide.bullets.join(' ') || slide.heading;
    const size = fitSize([text], 10.9, 4.6, [40, 36, 32, 30, 28, 26, 24, 22], {charW: 0.58, lineSpacing: 1.3});
    return <div style={frame} role="img" aria-label={label} data-slide-kind="statement">
      <Kicker x={0.95} y={1.2} text={slide.heading || 'The takeaway'} color={DECK.brass}/>
      <div style={box(0.95, 1.65, 11.4, 5.0)}>
        <div style={{borderLeft: `${pt(4.5)} solid ${DECK.brass}`, paddingLeft: '3%', fontFamily: SERIF, fontSize: pt(size), lineHeight: 1.15, color: DECK.parchment}}>{text}</div>
      </div>
      <Footer refs={slide.evidence} lookup={lookup} title={deckTitle} page={page} dark/>
    </div>;
  }

  if (kind === 'questions') {
    const questions = slide.bullets.slice(0, 6);
    const per = Math.min(1.15, (4.8 - 0.12 * (questions.length - 1)) / Math.max(1, questions.length));
    const longest = questions.reduce((a, b) => (b.length > a.length ? b : a), '');
    const size = fitSize([longest], 10.6, per - 0.1, [24, 22, 20, 18, 16, 15, 14], {gapPt: 0});
    return <div style={frame} role="img" aria-label={label} data-slide-kind="questions">
      <Kicker x={0.75} y={0.42} text="Open questions" color={DECK.oxblood}/>
      <div style={{...box(0.75, 0.72, 11.8, 0.95), display: 'flex', alignItems: 'center', fontFamily: SERIF, fontSize: pt(32), color: DECK.ink}}>{slide.heading}</div>
      <div style={{...box(0.75, 1.78, 0.9, 0.045), background: DECK.oxblood}}/>
      {questions.map((q, i) => <div key={i} style={{...box(0.75, 2.1 + i * (per + 0.12), 11.8, per), display: 'flex', gap: '3%'}}>
        <span style={{fontFamily: SERIF, fontSize: pt(26), color: DECK.brass, width: '7%', flex: 'none'}}>{String(i + 1).padStart(2, '0')}</span>
        <span style={{fontFamily: SANS, fontSize: pt(size), lineHeight: 1.1, color: DECK.ink, paddingTop: pt(5)}}>{q}</span>
      </div>)}
      <Footer refs={slide.evidence} lookup={lookup} title={deckTitle} page={page} dark={false}/>
    </div>;
  }

  const visual = slide.visual || null;
  const bullets = slide.bullets;
  const refs = [...slide.evidence, ...((visual?.items || []) as {evidence?: AiCitationRef[]}[]).flatMap(i => i.evidence || [])];
  const headingSize = fitSize([slide.heading], 11.8, 0.9, [34, 30, 28, 26, 24], {charW: 0.58, lineSpacing: 1.1});
  return <div style={frame} role="img" aria-label={label} data-slide-kind="content">
    <Kicker x={0.75} y={0.42} text={`${String(contentIndex).padStart(2, '0')} / ${String(contentTotal).padStart(2, '0')}`} color={DECK.brassDeep}/>
    <div style={{...box(0.75, 0.72, 11.8, 0.95), display: 'flex', alignItems: 'center', fontFamily: SERIF, fontSize: pt(headingSize), lineHeight: 1.05, color: DECK.ink}}>{slide.heading}</div>
    <div style={{...box(0.75, 1.78, 0.9, 0.045), background: DECK.brass}}/>
    {visual?.type === 'timeline' ? <>
      {bullets.length > 0 && <Bullets x={0.75} y={2.05} w={11.8} h={1.95} items={bullets} sizes={[20, 18, 16, 15, 14]}/>}
      <Visual visual={visual} lookup={lookup} region={bullets.length ? [0.85, 4.25, 11.6, 2.45] : [0.85, 2.6, 11.6, 3.6]}/>
    </> : visual?.type === 'bar' ? <>
      {bullets.length > 0 && <Bullets x={0.75} y={2.1} w={5.3} h={4.55} items={bullets} sizes={[22, 20, 18, 16, 15, 14]}/>}
      <Visual visual={visual} lookup={lookup} region={bullets.length ? [6.45, 2.0, 6.1, 4.7] : [0.75, 2.0, 11.8, 4.7]}/>
    </> : visual?.type === 'figures' ? <>
      {bullets.length > 0 && <Bullets x={0.75} y={2.1} w={6.9} h={4.55} items={bullets}/>}
      <Visual visual={visual} lookup={lookup} region={bullets.length ? [8.15, 2.05, 4.45, 4.6] : [0.75, 2.05, 11.8, 4.6]}/>
    </> : <>
      {bullets.length > 0 && <Bullets x={0.75} y={2.1} w={6.9} h={4.55} items={bullets}/>}
      <EvidencePanel refs={slide.evidence} lookup={lookup}/>
    </>}
    <Footer refs={refs} lookup={lookup} title={deckTitle} page={page} dark={false}/>
  </div>;
}

/** The sources slide(s) the export appends, rendered for the preview's last frame. */
export function SourcesCanvas({lookup, page, deckTitle}: {lookup: CitationLookup, page: number, deckTitle: string}): ReactElement {
  const entries = Array.from(lookup.numbers.entries()).slice(0, 10);
  return <div style={{position: 'relative', width: '100%', aspectRatio: `${W} / ${H}`, containerType: 'inline-size', overflow: 'hidden', background: DECK.paper, borderRadius: 6, boxShadow: '0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.25)'}} role="img" aria-label={`Slide ${page}: Sources`} data-slide-kind="sources">
    <Kicker x={0.75} y={0.42} text="Sources" color={DECK.brassDeep}/>
    <div style={{...box(0.75, 0.72, 11.8, 0.95), display: 'flex', alignItems: 'center', fontFamily: SERIF, fontSize: pt(30), color: DECK.ink}}>Where every statement comes from</div>
    <div style={{...box(0.75, 1.78, 0.9, 0.045), background: DECK.brass}}/>
    {entries.map(([key, n], i) => {
      const d = lookup.details.get(key);
      const col = Math.floor(i / 5);
      const row = i % 5;
      const second = d?.source_title && d.source_title !== d.label ? d.source_title : d?.detail || '';
      return <div key={key} style={{...box(0.75 + col * 6.05, 2.05 + row * 0.9, 5.75, 0.85), display: 'grid', gridTemplateColumns: '10% 1fr', fontFamily: SANS}}>
        <span style={{fontSize: pt(13), fontWeight: 700, color: DECK.brassDeep}}>[{n}]</span>
        <span style={{minWidth: 0}}>
          <span style={{display: 'block', fontSize: pt(9), fontWeight: 700, letterSpacing: '0.12em', color: DECK.taupe}}>{(d?.type_label || key.split(':')[0]).toUpperCase()}{d?.missing ? ' · NO LONGER AVAILABLE' : ''}</span>
          <span style={{display: 'block', fontSize: pt(13), fontWeight: 700, color: DECK.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{d?.label || key}</span>
          {second && <span style={{display: 'block', fontSize: pt(11), fontStyle: 'italic', color: DECK.taupe, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{second}</span>}
        </span>
      </div>;
    })}
    <Footer refs={[]} lookup={lookup} title={deckTitle} page={page} dark={false}/>
  </div>;
}
