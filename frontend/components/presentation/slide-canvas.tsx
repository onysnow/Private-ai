'use client';
// One deck slide drawn in HTML, mirroring backend/app/services/decks.py's
// .pptx layout (same 13.333in x 7.5in canvas, same positions, fit rules,
// themes and visual presets), so the in-app preview shows what the export
// will look like before anything is promoted or downloaded.
//
// Sizing is container-relative: the canvas sets `container-type: inline-size`
// and every length below is in `cqw`, so one component renders a full-width
// slide and a 120px filmstrip thumbnail identically.
//
// Look comes from three layers (backend app/services/presentation_style.py):
// the deck theme (colours + fonts), a visual's preset (layout), and its
// options. Style never touches a value, date, label or citation.
import dynamic from 'next/dynamic';
import {createContext, useContext} from 'react';
import type {CSSProperties, ReactElement, ReactNode} from 'react';

import type {AiCitationRef, ChartVisual, CitationDetail, DeckSlide, DeckStyle, DeckTheme, PresentationStyleCatalog, PresentationVisual, StyledVisual, VisualKind, VisualOptionValue, VisualPreset} from '../../lib/api-types';

// ECharts loads only when a slide actually shows a chart.
const ScaledChart = dynamic(() => import('./chart-visual').then(m => m.ScaledChart), {ssr: false, loading: () => null});

/** Dark Academia: the v2 look, used until the catalogue loads (hex without '#', as the API sends it). */
export const DEFAULT_THEME: DeckTheme = {
  id: 'dark_academia', label: 'Dark Academia', description: '',
  cover_bg: '141B1F', cover_line: '2B3439', cover_text: 'ECE3D2', cover_muted: 'B5A88F', cover_accent: 'B98D34',
  accent: 'B98D34', accent_text: '8A6420', alert: '672C1A',
  page: 'F7F2E8', panel: 'EDE4D3', rule: 'D9CDB6', text: '1F1B16', muted: '6B5B44', bar_muted: 'CDBFA6',
  heading_font: 'Georgia', body_font: 'Calibri',
};
/** The brief's palette (backend app/services/writeups.py DOCX_* colours). The Word
 *  export isn't themed yet, so the brief preview keeps this fixed look. */
export const DECK = {
  night: '#141B1F', nightLine: '#2B3439', parchment: '#ECE3D2', parchmentMuted: '#B5A88F',
  brass: '#B98D34', brassDeep: '#8A6420', oxblood: '#672C1A', paper: '#F7F2E8', panel: '#EDE4D3',
  rule: '#D9CDB6', ink: '#1F1B16', taupe: '#7A6950',
};

/** Built-in presets, matching the backend's first presets, for when the catalogue hasn't loaded. */
const FALLBACK_PRESETS: Record<VisualKind, VisualPreset[]> = {
  bar: [{id: 'horizontal', label: 'Horizontal', description: '', layout: {orientation: 'horizontal', axis_line: true}, options: {sort: 'as_given', value_labels: true, gridlines: false, thickness: 'regular', highlight: []}}],
  timeline: [{id: 'track', label: 'Horizontal track', description: '', layout: {direction: 'horizontal', compact: false}, options: {marker: 'ring', show_line: true}}],
  figures: [{id: 'cards', label: 'Cards', description: '', layout: {arrangement: 'stack'}, options: {card_fill: true, accent_edge: true, value_color: 'alert'}}],
};

const hex = (value: string): string => `#${value.replace(/^#/, '')}`;
const SERIF_FALLBACK = "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif";
const SANS_FALLBACK = 'Calibri, Inter, ui-sans-serif, system-ui, sans-serif';
/** CSS stack for a theme font: the self-hosted variable face, the static face, then a fallback. */
export function fontStack(name: string, role: 'heading' | 'body'): string {
  const fallback = role === 'heading' && !/sans/i.test(name) ? SERIF_FALLBACK : SANS_FALLBACK;
  return name ? `'${name} Variable', '${name}', ${fallback}` : fallback;
}

/** The deck theme with its font pairing applied (port of presentation_style.resolved_theme). */
export function resolveTheme(catalog: PresentationStyleCatalog | null | undefined, style: DeckStyle | null | undefined): DeckTheme {
  const base = catalog?.themes.find(t => t.id === style?.theme) || catalog?.themes.find(t => t.id === catalog.defaults.theme) || DEFAULT_THEME;
  const pair = catalog?.font_pairs.find(p => p.id === style?.fonts);
  return pair && pair.heading ? {...base, heading_font: pair.heading, body_font: pair.body} : base;
}

export type ResolvedVisualStyle = {preset: string, layout: Record<string, string | boolean>, options: Record<string, VisualOptionValue>};
/** Preset layout + preset options overlaid with the visual's own (port of resolved_visual_style). */
export function resolveVisualStyle(visual: StyledVisual, presets?: Record<VisualKind, VisualPreset[]>): ResolvedVisualStyle {
  const list = presets?.[visual.type] || FALLBACK_PRESETS[visual.type];
  const chosen = list.find(p => p.id === visual.style?.preset) || list[0];
  return {preset: chosen.id, layout: {...chosen.layout}, options: {...chosen.options, ...(visual.style?.options || {})}};
}

/** Display order for bars; only the order changes (port of decks.sort_bar_items). */
export function sortBarItems<T extends {value: number}>(items: T[], order: VisualOptionValue | undefined): T[] {
  if (order === 'desc') return [...items].sort((a, b) => b.value - a.value);
  if (order === 'asc') return [...items].sort((a, b) => a.value - b.value);
  return [...items];
}

type SlideStyle = {theme: DeckTheme, presets?: Record<VisualKind, VisualPreset[]>};
const SlideStyleContext = createContext<SlideStyle>({theme: DEFAULT_THEME});
/** Wrap slides (and the brief preview) to draw them in a theme and with the catalogue's presets. */
export function SlideStyleProvider({theme, presets, children}: SlideStyle & {children: ReactNode}): ReactElement {
  return <SlideStyleContext.Provider value={{theme, presets}}>{children}</SlideStyleContext.Provider>;
}
export const useSlideStyle = (): SlideStyle => useContext(SlideStyleContext);
const useTheme = () => {
  const {theme} = useContext(SlideStyleContext);
  return {c: (k: keyof DeckTheme) => hex(theme[k]), serif: fontStack(theme.heading_font, 'heading'), sans: fontStack(theme.body_font, 'body')};
};

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

/** Every record a visual cites, in drawing order: a chart's rows carry
 * their records (decks.chart_record_refs); the other visuals cite per item. */
export function visualRefs(visual: PresentationVisual | null | undefined): AiCitationRef[] {
  if (!visual) return [];
  if (visual.type === 'chart') return visual.data.rows.flatMap(row => row.record_refs || []);
  return (visual.items as {evidence?: AiCitationRef[]}[]).flatMap(i => i.evidence || []);
}

/** The style layer drawn here (presets and options) applies to the three
 * drawn visuals; a checked chart is drawn again in its style by the backend,
 * which checks it again (applyVisualStyles in draft-preview.tsx). */
export const isStyledVisual = (visual: PresentationVisual | null | undefined): visual is StyledVisual => Boolean(visual) && visual!.type !== 'chart';

/** Number every ref in first-appearance order, the same order the export's sources slide uses. */
export function buildCitationLookup(slides: DeckSlide[], details: CitationDetail[] = []): CitationLookup {
  const numbers = new Map<string, number>();
  for (const slide of slides) {
    const refs = [...(slide.evidence || []), ...visualRefs(slide.visual)];
    for (const r of refs) if (r.record_type && r.record_id && !numbers.has(refKey(r))) numbers.set(refKey(r), numbers.size + 1);
  }
  return {numbers, details: new Map(details.map(d => [refKey(d), d]))};
}

const markers = (refs: AiCitationRef[] | undefined, lookup: CitationLookup) => {
  const nums = Array.from(new Set((refs || []).map(r => lookup.numbers.get(refKey(r))).filter((n): n is number => typeof n === 'number'))).sort((a, b) => a - b);
  return nums.map(n => `[${n}]`).join(' ');
};

function Kicker({x, y, text, color}: {x: number, y: number, text: string, color: string}): ReactElement {
  const {sans} = useTheme();
  return <div style={{...box(x, y, 8, 0.3), fontFamily: sans, fontWeight: 700, fontSize: pt(11), letterSpacing: '0.22em', textTransform: 'uppercase', color}}>{text}</div>;
}

function Footer({refs, lookup, title, page, dark}: {refs: AiCitationRef[], lookup: CitationLookup, title: string, page: number, dark: boolean}): ReactElement {
  const {c, sans} = useTheme();
  const muted = dark ? c('cover_muted') : c('muted');
  const sources = markers(refs, lookup);
  return <>
    <div style={{...box(0.75, 6.88, W - 1.5, 0.012), background: dark ? c('cover_line') : c('rule')}}/>
    {sources && <div style={{...box(0.75, 6.98, 8, 0.3), fontFamily: sans, fontSize: pt(10), color: muted}}>Sources {sources}</div>}
    <div style={{...box(W - 6.75, 6.98, 6, 0.3), fontFamily: sans, fontSize: pt(10), color: muted, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{title} · {page}</div>
  </>;
}

function Bullets({x, y, w, h, items, sizes = [28, 26, 24, 22, 20, 18, 16, 15, 14]}: {x: number, y: number, w: number, h: number, items: string[], sizes?: number[]}): ReactElement {
  const {c, sans} = useTheme();
  const size = fitSize(items, w - 0.35, h, sizes, {gapPt: 16});
  return <ul style={{...box(x, y, w, h), margin: 0, padding: 0, listStyle: 'none', fontFamily: sans, fontSize: pt(size), lineHeight: 1.12, color: c('text')}}>
    {items.map((item, i) => <li key={i} style={{display: 'flex', gap: pt(10), marginBottom: pt(size >= 22 ? 16 : 10)}}>
      <span aria-hidden style={{color: c('accent'), fontSize: '0.62em', lineHeight: 1.12 / 0.62, flex: 'none'}}>■</span><span>{item}</span>
    </li>)}
  </ul>;
}

function EvidencePanel({refs, lookup}: {refs: AiCitationRef[], lookup: CitationLookup}): ReactElement {
  const {c, serif, sans} = useTheme();
  const details = refs.map(r => lookup.details.get(refKey(r))).filter((d): d is CitationDetail => Boolean(d));
  const quoted = details.filter(d => d.quote).slice(0, 2);
  const rest = details.filter(d => !quoted.includes(d)).slice(0, quoted.length ? 3 : 5);
  return <div style={{...box(8.15, 2.05, 4.45, 4.6), background: c('panel'), borderRadius: pt(10), padding: `${pt(20)} ${pt(22)}`, boxSizing: 'border-box', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: pt(12)}}>
    <div style={{fontFamily: sans, fontWeight: 700, fontSize: pt(11), letterSpacing: '0.22em', color: c('alert')}}>FROM THE RECORD</div>
    {quoted.map(d => <figure key={refKey(d)} style={{margin: 0}}>
      <blockquote style={{margin: 0, fontFamily: serif, fontStyle: 'italic', fontSize: pt(quoted.length > 1 ? 14 : 17), lineHeight: 1.3, color: c('text'), display: '-webkit-box', WebkitLineClamp: quoted.length > 1 ? 5 : 8, WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>
        <span style={{color: c('accent'), fontSize: '1.6em', lineHeight: 0, verticalAlign: '-0.3em', marginRight: '0.1em'}}>“</span>{d.quote}
      </blockquote>
      <figcaption style={{marginTop: pt(6), fontFamily: sans, fontSize: pt(11), color: c('muted')}}>[{lookup.numbers.get(refKey(d))}] {d.locator || d.label}{d.locator && d.source_title ? ` — ${d.source_title}` : ''}</figcaption>
    </figure>)}
    {rest.map(d => <div key={refKey(d)}>
      <div style={{fontFamily: sans, fontWeight: 700, fontSize: pt(9), letterSpacing: '0.12em', color: c('muted')}}>[{lookup.numbers.get(refKey(d))}] {d.type_label.toUpperCase()}</div>
      <div style={{fontFamily: sans, fontSize: pt(13), color: c('text'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{d.label}</div>
    </div>)}
    {!details.length && <div style={{fontFamily: sans, fontStyle: 'italic', fontSize: pt(13), color: c('muted')}}>No cited records on this slide.</div>}
  </div>;
}

type Region = [number, number, number, number];

function Figures({visual, style, lookup, region}: {visual: Extract<PresentationVisual, {type: 'figures'}>, style: ResolvedVisualStyle, lookup: CitationLookup, region: Region}): ReactElement {
  const {c, serif, sans} = useTheme();
  const [x, y, w, h] = region;
  const {options} = style;
  const row = style.layout.arrangement === 'row';
  const filled = options.card_fill !== false;
  const edge = options.accent_edge !== false;
  const valueColor = options.value_color === 'accent' ? c('accent_text') : options.value_color === 'text' ? c('text') : c('alert');
  const gap = row ? 0.25 : 0.2;
  const n = visual.items.length;
  return <div data-testid="slide-figures" data-preset={style.preset}>{visual.items.map((item, i) => {
    const cellW = row ? (w - gap * (n - 1)) / n : w;
    const cellH = row ? h : (h - gap * (n - 1)) / n;
    const left = row ? x + i * (cellW + gap) : x;
    const top = row ? y : y + i * (cellH + gap);
    const pad = filled || edge ? 0.35 : 0.05;
    const valueSize = fitSize([item.value], cellW - pad - 0.25, Math.min(cellH * 0.5, 1.0), [54, 48, 44, 40, 36, 32, 28, 24], {charW: 0.55, lineSpacing: 1.0});
    const divider = !filled && i > 0 ? (row ? {borderLeft: `1px solid ${c('rule')}`} : {borderTop: `1px solid ${c('rule')}`}) : {};
    return <div key={i} style={{...box(left, top, cellW, cellH), ...divider, background: filled ? c('panel') : 'transparent', borderRadius: filled ? pt(10) : 0, padding: `${pt(12)} ${pt(Math.max(4, pad * 72 - 8))}`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: pt(6)}}>
      {edge && <div style={{position: 'absolute', left: 0, top: '8%', bottom: '8%', width: pt(4), background: c('alert')}}/>}
      <div style={{fontFamily: serif, fontSize: pt(valueSize), lineHeight: 1, color: valueColor}}>{item.value}</div>
      <div style={{fontFamily: sans, fontSize: pt(cellH > 1.6 && cellW > 3 ? 15 : cellH > 1.1 ? 13 : 11), color: c('text'), lineHeight: 1.1}}>{item.label} <span style={{color: c('muted')}}>{markers(item.evidence, lookup)}</span></div>
    </div>;
  })}</div>;
}

function Timeline({visual, style, lookup, region}: {visual: Extract<PresentationVisual, {type: 'timeline'}>, style: ResolvedVisualStyle, lookup: CitationLookup, region: Region}): ReactElement {
  const {c, sans} = useTheme();
  const [x, y, w, h] = region;
  const n = visual.items.length;
  const ring = style.options.marker !== 'dot';
  const line = style.options.show_line !== false;
  const marker = (size: number) => <div style={{width: pt(size), height: pt(size), borderRadius: '50%', flex: 'none', ...(ring ? {border: `${pt(2.5)} solid ${c('accent')}`, background: c('page'), boxShadow: `inset 0 0 0 ${pt(size * 0.18)} ${c('page')}, inset 0 0 0 ${pt(size / 2)} ${c('accent')}`} : {background: c('accent')}), boxSizing: 'border-box'}}/>;
  if (style.layout.direction === 'vertical') {
    const rowH = Math.min(0.7, h / n);
    const size = rowH >= 0.6 ? 16 : rowH >= 0.5 ? 14 : 12;
    return <div style={box(x, y, w, h)} data-testid="slide-timeline" data-preset={style.preset}>
      {line && <div style={{position: 'absolute', left: `${(2.25 / w) * 100}%`, top: `${(rowH / 2 / h) * 100}%`, height: `${((rowH * (n - 1)) / h) * 100}%`, width: pt(2), background: c('rule')}}/>}
      {visual.items.map((item, i) => <div key={i} style={{position: 'absolute', left: 0, right: 0, top: `${((i * rowH) / h) * 100}%`, height: `${(rowH / h) * 100}%`, display: 'grid', gridTemplateColumns: `${(2.0 / w) * 100}% ${(0.5 / w) * 100}% 1fr`, alignItems: 'center', fontFamily: sans}}>
        <div style={{fontSize: pt(size), fontWeight: 700, color: c('accent_text'), textAlign: 'right'}}>{displayDate(item.date)}</div>
        <div style={{display: 'flex', justifyContent: 'center'}}>{marker(ring ? 16 : 12)}</div>
        <div style={{fontSize: pt(size), lineHeight: 1.1, color: c('text')}}>{item.label} <span style={{color: c('muted')}}>{markers(item.evidence, lookup)}</span></div>
      </div>)}
    </div>;
  }
  const compact = Boolean(style.layout.compact);
  const step = w / n;
  const lineY = compact ? 0.55 : 0.75;
  const labelSize = compact ? (n <= 3 ? 14 : n <= 5 ? 12 : 11) : (n <= 3 ? 16 : n <= 5 ? 14 : 12);
  const markerSize = compact ? (ring ? 12 : 9) : (ring ? 16 : 12);
  return <div style={box(x, y, w, h)} data-testid="slide-timeline" data-preset={style.preset}>
    {line && <div style={{position: 'absolute', left: 0, right: 0, top: `${(lineY / h) * 100}%`, height: pt(2), background: c('rule')}}/>}
    {visual.items.map((item, i) => <div key={i} style={{position: 'absolute', left: `${((i * step) / w) * 100}%`, width: `${(step / w) * 100}%`, top: 0, bottom: 0, textAlign: 'center', fontFamily: sans}}>
      <div style={{fontSize: pt(labelSize + 2), fontWeight: 700, color: c('accent_text'), height: `${((lineY - 0.2) / h) * 100}%`}}>{displayDate(item.date)}</div>
      <div style={{display: 'flex', justifyContent: 'center', position: 'relative', top: `calc(${(0.2 / h) * 100}% - ${pt(markerSize / 2)})`}}>{marker(markerSize)}</div>
      <div style={{marginTop: pt(compact ? 14 : 22), padding: `0 ${pt(6)}`, fontSize: pt(labelSize), lineHeight: 1.1, color: c('text')}}>{item.label} <span style={{color: c('muted')}}>{markers(item.evidence, lookup)}</span></div>
    </div>)}
  </div>;
}

/** A checked chart placed in a slide region, scaled to fit it. A kind
 * PowerPoint cannot hold natively (the treemap, the sankey, the timeline)
 * shows what the deck stored for this slide -- the drawing at the slide's
 * own scale, or, with the reason, its parts as bars (a timeline: its events
 * listed, as the export's table lists them) -- so the preview is what the
 * export will be. */
export function SlideChart({visual, region}: {visual: ChartVisual, region: Region}): ReactElement {
  const {c, sans} = useTheme();
  const [x, y, w, h] = region;
  const drawing = visual.slide_drawing;
  const shown: ChartVisual | null = !drawing ? visual
    : drawing.option ? {...visual, option: drawing.option, width: drawing.width, height: drawing.height} : null;
  const listed = drawing?.note && !shown && visual.spec.kind === 'timeline';
  return <div style={{...box(x, y, w, h), background: '#fff0', display: 'flex', flexDirection: 'column'}} data-testid="slide-chart"
    data-drawing={drawing ? (drawing.note ? (listed ? 'events' : 'bars') : 'slide') : 'design'}>
    {drawing?.note && <div style={{fontFamily: sans, fontSize: pt(11), fontStyle: 'italic', color: c('alert')}}>{drawing.note}</div>}
    {shown ? <div style={{flex: 1, minHeight: 0}}><ScaledChart visual={shown} fill/></div> : null}
    {listed && <table style={{fontFamily: sans, fontSize: pt(11), color: c('text'), borderCollapse: 'collapse', marginTop: pt(6)}}>
      <thead><tr>{['Event', 'When', 'Status'].map(h => <th key={h} scope="col" style={{textAlign: 'left', paddingRight: pt(10)}}>{h}</th>)}</tr></thead>
      <tbody>{visual.text.data_table.rows.map(r => <tr key={r.label}>
        <td style={{paddingRight: pt(10)}}>{r.label}</td><td style={{paddingRight: pt(10)}}>{r.formatted}</td><td style={{color: c('muted')}}>{r.status ?? ''}</td>
      </tr>)}</tbody>
    </table>}
  </div>;
}

function BarChart({visual, style, region}: {visual: Extract<PresentationVisual, {type: 'bar'}>, style: ResolvedVisualStyle, region: Region}): ReactElement {
  const {c, sans} = useTheme();
  const [x, y, w, h] = region;
  const {options, layout} = style;
  const vertical = layout.orientation === 'vertical';
  const items = sortBarItems(visual.items, options.sort);
  const highlight = new Set(Array.isArray(options.highlight) ? options.highlight : []);
  const labels = options.value_labels !== false;
  const showAxis = options.gridlines === true || !labels;  // without labels the axis is the only way to read a value
  const axisLine = layout.axis_line !== false;
  // Every bar is measured from zero: no option can start the axis anywhere else.
  const top = Math.max(...items.map(i => Math.abs(i.value)), 1);
  const thickness = ({thin: 14, regular: 26, thick: 40} as Record<string, number>)[String(options.thickness || 'regular')] || 26;
  const fill = (label: string) => (highlight.size && !highlight.has(label) ? c('bar_muted') : c('accent'));
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const extent = 78;  // % of the plot the largest bar fills; the rest holds its label
  return <div style={{...box(x, y, w, h), display: 'flex', flexDirection: 'column', fontFamily: sans}} data-testid="slide-bar-chart" data-preset={style.preset}>
    {visual.title && <div style={{fontSize: pt(13), fontWeight: 700, color: c('muted'), marginBottom: pt(10)}}>{visual.title}</div>}
    {vertical ? <div style={{flex: 1, display: 'flex', alignItems: 'stretch', gap: pt(14), position: 'relative', borderBottom: axisLine ? `1px solid ${c('rule')}` : 'none', paddingBottom: pt(2)}}>
      {showAxis && ticks.map(t => <div key={t} aria-hidden style={{position: 'absolute', left: 0, right: 0, bottom: `${t * extent}%`, borderTop: `1px solid ${c('rule')}`}}><span style={{position: 'absolute', left: 0, top: pt(-14), fontSize: pt(10), color: c('muted')}}>{formatValue(top * t, visual.unit)}</span></div>)}
      {items.map(item => <div key={item.label} style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', position: 'relative'}}>
        {labels && <span style={{fontSize: pt(12), fontWeight: 700, color: c('text'), marginBottom: pt(4)}}>{formatValue(item.value, visual.unit)}</span>}
        <div data-bar={item.label} style={{width: pt(thickness * 1.6), height: `${Math.max(1.5, (Math.abs(item.value) / top) * extent)}%`, background: fill(item.label)}}/>
        <span style={{position: 'absolute', bottom: pt(-20), fontSize: pt(12), color: c('text'), whiteSpace: 'nowrap'}}>{item.label}</span>
      </div>)}
    </div> : <div style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', position: 'relative'}}>
      {showAxis && <div aria-hidden style={{position: 'absolute', left: '32%', right: 0, top: 0, bottom: 0, marginLeft: pt(10)}}>{ticks.map(t => <div key={t} style={{position: 'absolute', top: 0, bottom: 0, left: `${t * extent}%`, borderLeft: `1px solid ${c('rule')}`}}><span style={{position: 'absolute', bottom: pt(-16), left: pt(-10), fontSize: pt(10), color: c('muted'), whiteSpace: 'nowrap'}}>{formatValue(top * t, visual.unit)}</span></div>)}</div>}
      {items.map(item => <div key={item.label} style={{display: 'grid', gridTemplateColumns: '32% 1fr', alignItems: 'center', gap: pt(10), position: 'relative'}}>
        <div style={{fontSize: pt(12), color: c('text'), textAlign: 'right', lineHeight: 1.1}}>{item.label}</div>
        <div style={{display: 'flex', alignItems: 'center', gap: pt(8), borderLeft: axisLine ? `1px solid ${c('rule')}` : 'none'}}>
          <div data-bar={item.label} style={{height: pt(thickness), width: `${Math.max(1.5, (Math.abs(item.value) / top) * extent)}%`, background: fill(item.label)}}/>
          {labels && <span style={{fontSize: pt(12), fontWeight: 700, color: c('text'), whiteSpace: 'nowrap'}}>{formatValue(item.value, visual.unit)}</span>}
        </div>
      </div>)}
    </div>}
  </div>;
}

export type SlideCanvasProps = {slide: DeckSlide, page: number, contentIndex: number, contentTotal: number, deckTitle: string, lookup: CitationLookup, sourceCount: number};

export function SlideCanvas({slide, page, contentIndex, contentTotal, deckTitle, lookup, sourceCount}: SlideCanvasProps): ReactElement {
  const {presets, theme} = useSlideStyle();
  const {c, serif, sans} = useTheme();
  const kind = slide.kind || 'content';
  const dark = kind === 'title' || kind === 'statement';
  const frame: CSSProperties = {position: 'relative', width: '100%', aspectRatio: `${W} / ${H}`, containerType: 'inline-size', overflow: 'hidden', background: dark ? c('cover_bg') : c('page'), borderRadius: 6, boxShadow: '0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.25)'};
  const label = `Slide ${page}: ${slide.heading}`;

  if (kind === 'title') {
    const subtitle = slide.bullets.join(' ');
    const size = fitSize([slide.heading], 11.2, 2.5, [44, 40, 36, 32, 28], {charW: 0.58, lineSpacing: 1.12});
    return <div style={frame} role="img" aria-label={label} data-slide-kind="title" data-theme={theme.id}>
      <div style={{...box(0, 0, 0.18, H), background: c('accent')}}/>
      <Kicker x={0.95} y={1.35} text="Investigation brief" color={c('cover_accent')}/>
      <div style={{...box(0.95, 1.8, 11.2, 2.6), fontFamily: serif, fontSize: pt(size), lineHeight: 1.08, color: c('cover_text')}}>{slide.heading}</div>
      <div style={{...box(0.95, 4.55, 1.1, 0.045), background: c('accent')}}/>
      {subtitle && <div style={{...box(0.95, 4.8, 10.6, 1.4), fontFamily: sans, fontSize: pt(fitSize([subtitle], 10.6, 1.3, [18, 16, 15, 14])), lineHeight: 1.25, color: c('cover_muted')}}>{subtitle}</div>}
      <div style={{...box(0.95, 6.75, 10, 0.3), fontFamily: sans, fontSize: pt(11), color: c('cover_muted')}}>Prepared from {sourceCount} cited record{sourceCount === 1 ? '' : 's'}</div>
    </div>;
  }

  if (kind === 'statement') {
    const text = slide.bullets.join(' ') || slide.heading;
    const size = fitSize([text], 10.9, 4.6, [40, 36, 32, 30, 28, 26, 24, 22], {charW: 0.58, lineSpacing: 1.3});
    return <div style={frame} role="img" aria-label={label} data-slide-kind="statement" data-theme={theme.id}>
      <Kicker x={0.95} y={1.2} text={slide.heading || 'The takeaway'} color={c('cover_accent')}/>
      <div style={box(0.95, 1.65, 11.4, 5.0)}>
        <div style={{borderLeft: `${pt(4.5)} solid ${c('accent')}`, paddingLeft: '3%', fontFamily: serif, fontSize: pt(size), lineHeight: 1.15, color: c('cover_text')}}>{text}</div>
      </div>
      <Footer refs={slide.evidence} lookup={lookup} title={deckTitle} page={page} dark/>
    </div>;
  }

  if (kind === 'questions') {
    const questions = slide.bullets.slice(0, 6);
    const per = Math.min(1.15, (4.8 - 0.12 * (questions.length - 1)) / Math.max(1, questions.length));
    const longest = questions.reduce((a, b) => (b.length > a.length ? b : a), '');
    const size = fitSize([longest], 10.6, per - 0.1, [24, 22, 20, 18, 16, 15, 14], {gapPt: 0});
    return <div style={frame} role="img" aria-label={label} data-slide-kind="questions" data-theme={theme.id}>
      <Kicker x={0.75} y={0.42} text="Open questions" color={c('alert')}/>
      <div style={{...box(0.75, 0.72, 11.8, 0.95), display: 'flex', alignItems: 'center', fontFamily: serif, fontSize: pt(32), color: c('text')}}>{slide.heading}</div>
      <div style={{...box(0.75, 1.78, 0.9, 0.045), background: c('alert')}}/>
      {questions.map((q, i) => <div key={i} style={{...box(0.75, 2.1 + i * (per + 0.12), 11.8, per), display: 'flex', gap: '3%'}}>
        <span style={{fontFamily: serif, fontSize: pt(26), color: c('accent_text'), width: '7%', flex: 'none'}}>{String(i + 1).padStart(2, '0')}</span>
        <span style={{fontFamily: sans, fontSize: pt(size), lineHeight: 1.1, color: c('text'), paddingTop: pt(5)}}>{q}</span>
      </div>)}
      <Footer refs={slide.evidence} lookup={lookup} title={deckTitle} page={page} dark={false}/>
    </div>;
  }

  const visual = slide.visual || null;
  const bullets = slide.bullets;
  const has = bullets.length > 0;
  const refs = [...slide.evidence, ...visualRefs(visual)];
  const headingSize = fitSize([slide.heading], 11.8, 0.9, [34, 30, 28, 26, 24], {charW: 0.58, lineSpacing: 1.1});
  const style = isStyledVisual(visual) ? resolveVisualStyle(visual, presets) : null;
  let body: ReactElement;
  if (visual?.type === 'chart') {
    // Same split as the export's native chart (decks.py content_slide).
    body = <>
      {has && <Bullets x={0.75} y={2.1} w={5.3} h={4.55} items={bullets} sizes={[22, 20, 18, 16, 15, 14]}/>}
      <SlideChart visual={visual} region={has ? [6.45, 2.0, 6.1, 4.7] : [0.75, 2.0, 11.8, 4.7]}/>
    </>;
  } else if (visual?.type === 'timeline' && style) {
    if (style.layout.direction === 'vertical') {
      body = <>
        {has && <Bullets x={0.75} y={2.1} w={5.0} h={4.55} items={bullets} sizes={[22, 20, 18, 16, 15, 14]}/>}
        <Timeline visual={visual} style={style} lookup={lookup} region={has ? [6.0, 2.1, 6.55, 4.55] : [0.75, 2.1, 11.8, 4.55]}/>
      </>;
    } else {
      const band = style.layout.compact ? 1.75 : 2.45;
      body = <>
        {has && <Bullets x={0.75} y={2.05} w={11.8} h={4.6 - band} items={bullets} sizes={[22, 20, 18, 16, 15, 14]}/>}
        <Timeline visual={visual} style={style} lookup={lookup} region={has ? [0.85, 6.7 - band, 11.6, band] : [0.85, 2.6, 11.6, 3.6]}/>
      </>;
    }
  } else if (visual?.type === 'bar' && style) {
    body = <>
      {has && <Bullets x={0.75} y={2.1} w={5.3} h={4.55} items={bullets} sizes={[22, 20, 18, 16, 15, 14]}/>}
      <BarChart visual={visual} style={style} region={has ? [6.45, 2.0, 6.1, 4.7] : [0.75, 2.0, 11.8, 4.7]}/>
    </>;
  } else if (visual?.type === 'figures' && style) {
    body = style.layout.arrangement === 'row' ? <>
      {has && <Bullets x={0.75} y={2.05} w={11.8} h={2.3} items={bullets} sizes={[22, 20, 18, 16, 15, 14]}/>}
      <Figures visual={visual} style={style} lookup={lookup} region={has ? [0.75, 4.6, 11.8, 2.0] : [0.75, 2.3, 11.8, 3.0]}/>
    </> : <>
      {has && <Bullets x={0.75} y={2.1} w={6.9} h={4.55} items={bullets}/>}
      <Figures visual={visual} style={style} lookup={lookup} region={has ? [8.15, 2.05, 4.45, 4.6] : [0.75, 2.05, 11.8, 4.6]}/>
    </>;
  } else {
    body = <>
      {has && <Bullets x={0.75} y={2.1} w={6.9} h={4.55} items={bullets}/>}
      <EvidencePanel refs={slide.evidence} lookup={lookup}/>
    </>;
  }
  return <div style={frame} role="img" aria-label={label} data-slide-kind="content" data-theme={theme.id}>
    <Kicker x={0.75} y={0.42} text={`${String(contentIndex).padStart(2, '0')} / ${String(contentTotal).padStart(2, '0')}`} color={c('accent_text')}/>
    <div style={{...box(0.75, 0.72, 11.8, 0.95), display: 'flex', alignItems: 'center', fontFamily: serif, fontSize: pt(headingSize), lineHeight: 1.05, color: c('text')}}>{slide.heading}</div>
    <div style={{...box(0.75, 1.78, 0.9, 0.045), background: c('accent')}}/>
    {body}
    <Footer refs={refs} lookup={lookup} title={deckTitle} page={page} dark={false}/>
  </div>;
}

/** The sources slide(s) the export appends, rendered for the preview's last frame. */
export function SourcesCanvas({lookup, page, deckTitle}: {lookup: CitationLookup, page: number, deckTitle: string}): ReactElement {
  const {c, serif, sans} = useTheme();
  const entries = Array.from(lookup.numbers.entries()).slice(0, 10);
  return <div style={{position: 'relative', width: '100%', aspectRatio: `${W} / ${H}`, containerType: 'inline-size', overflow: 'hidden', background: c('page'), borderRadius: 6, boxShadow: '0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.25)'}} role="img" aria-label={`Slide ${page}: Sources`} data-slide-kind="sources">
    <Kicker x={0.75} y={0.42} text="Sources" color={c('accent_text')}/>
    <div style={{...box(0.75, 0.72, 11.8, 0.95), display: 'flex', alignItems: 'center', fontFamily: serif, fontSize: pt(30), color: c('text')}}>Where every statement comes from</div>
    <div style={{...box(0.75, 1.78, 0.9, 0.045), background: c('accent')}}/>
    {entries.map(([key, n], i) => {
      const d = lookup.details.get(key);
      const col = Math.floor(i / 5);
      const row = i % 5;
      const second = d?.source_title && d.source_title !== d.label ? d.source_title : d?.detail || '';
      return <div key={key} style={{...box(0.75 + col * 6.05, 2.05 + row * 0.9, 5.75, 0.85), display: 'grid', gridTemplateColumns: '10% 1fr', fontFamily: sans}}>
        <span style={{fontSize: pt(13), fontWeight: 700, color: c('accent_text')}}>[{n}]</span>
        <span style={{minWidth: 0}}>
          <span style={{display: 'block', fontSize: pt(9), fontWeight: 700, letterSpacing: '0.12em', color: c('muted')}}>{(d?.type_label || key.split(':')[0]).toUpperCase()}{d?.missing ? ' · NO LONGER AVAILABLE' : ''}</span>
          <span style={{display: 'block', fontSize: pt(13), fontWeight: 700, color: c('text'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{d?.label || key}</span>
          {second && <span style={{display: 'block', fontSize: pt(11), fontStyle: 'italic', color: c('muted'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{second}</span>}
        </span>
      </div>;
    })}
    <Footer refs={[]} lookup={lookup} title={deckTitle} page={page} dark={false}/>
  </div>;
}
