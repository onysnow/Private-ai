'use client';
// The style controls beside the slide preview: the deck's theme and font
// pairing, and -- when the slide has a visual -- that visual's layout preset
// and options. Everything here is presentation only; the catalogue (GET
// /api/presentation-styles) offers no control that could change a value or
// start a bar above zero, so there is nothing misleading to pick.
import type {ReactElement} from 'react';
import {RotateCcw} from 'lucide-react';

import type {DeckStyle, PresentationStyleCatalog, PresentationVisual, VisualOptionSpec, VisualOptionValue, VisualStyle, StyledVisual} from '../../lib/api-types';
import {Button} from '@/components/ui/button';
import {resolveVisualStyle, isStyledVisual} from './slide-canvas';

const CHOICE_LABEL: Record<string, string> = {
  as_given: 'As drafted', desc: 'Largest first', asc: 'Smallest first',
  thin: 'Thin', regular: 'Regular', thick: 'Thick',
  ring: 'Ring', dot: 'Dot',
  alert: 'Alert colour', accent: 'Accent colour', text: 'Text colour',
};
const KIND_LABEL: Record<StyledVisual['type'], string> = {bar: 'Bar chart', timeline: 'Timeline', figures: 'Headline figures'};

const selectClass = 'h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground';

function OptionControl({name, spec, value, labels, onChange}: {name: string, spec: VisualOptionSpec, value: VisualOptionValue | undefined, labels: string[], onChange: (value: VisualOptionValue) => void}): ReactElement {
  if (spec.type === 'bool') {
    return <label className="flex items-center justify-between gap-3 text-sm text-foreground">
      <span>{spec.label}</span>
      <input type="checkbox" aria-label={spec.label} className="h-4 w-4 accent-[hsl(var(--primary))]" checked={value === true} onChange={e => onChange(e.target.checked)}/>
    </label>;
  }
  if (spec.type === 'choice') {
    return <label className="grid gap-1 text-sm text-foreground">
      <span className="text-xs text-muted-foreground">{spec.label}</span>
      <select aria-label={spec.label} className={selectClass} value={String(value ?? '')} onChange={e => onChange(e.target.value)}>
        {(spec.values || []).map(v => <option key={v} value={v}>{CHOICE_LABEL[v] || v}</option>)}
      </select>
    </label>;
  }
  const picked = new Set(Array.isArray(value) ? value : []);
  return <div className="grid gap-1.5" role="group" aria-label={spec.label} data-option={name}>
    <span className="text-xs text-muted-foreground">{spec.label}</span>
    <div className="flex flex-wrap gap-1.5">
      {labels.map(label => {
        const on = picked.has(label);
        return <button key={label} type="button" aria-pressed={on} onClick={() => onChange(on ? Array.from(picked).filter(l => l !== label) : [...Array.from(picked), label])}
          className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${on ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>{label}</button>;
      })}
    </div>
  </div>;
}

export type StylePanelProps = {
  catalog: PresentationStyleCatalog,
  deckStyle: DeckStyle,
  onDeckStyle: (style: DeckStyle) => void,
  /** The active slide's visual; only the three styled visuals take presets
   * and options (a chart's look comes from the deck theme). */
  visual: PresentationVisual | null,
  onVisualStyle: (style: VisualStyle) => void,
  sectionLabel?: string,
};

export function StylePanel({catalog, deckStyle, onDeckStyle, visual: active, onVisualStyle, sectionLabel}: StylePanelProps): ReactElement {
  const visual = isStyledVisual(active) ? active : null;
  const resolved = visual ? resolveVisualStyle(visual, catalog.visual_presets) : null;
  const presets = visual ? catalog.visual_presets[visual.type] : [];
  const specs = visual ? catalog.visual_options[visual.type] : {};
  const labels = visual ? visual.items.map(i => i.label) : [];
  const setOption = (name: string, value: VisualOptionValue) => onVisualStyle({preset: resolved?.preset, options: {...(visual?.style?.options || {}), [name]: value}});

  return <aside className="grid content-start gap-4 rounded-lg border border-border bg-card/60 p-4" data-testid="style-panel" aria-label="Style">
    <div className="grid gap-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deck</div>
      <label className="grid gap-1 text-sm text-foreground">
        <span className="text-xs text-muted-foreground">Theme</span>
        <select aria-label="Theme" className={selectClass} value={deckStyle.theme} onChange={e => onDeckStyle({...deckStyle, theme: e.target.value})}>
          {catalog.themes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      <div className="flex gap-1" aria-hidden>
        {(() => { const t = catalog.themes.find(x => x.id === deckStyle.theme); return t ? [t.cover_bg, t.page, t.accent, t.alert, t.text].map((c, i) => <span key={i} className="h-4 flex-1 rounded-sm border border-border" style={{background: `#${c}`}}/>) : null; })()}
      </div>
      <label className="grid gap-1 text-sm text-foreground">
        <span className="text-xs text-muted-foreground">Fonts</span>
        <select aria-label="Font pairing" className={selectClass} value={deckStyle.fonts} onChange={e => onDeckStyle({...deckStyle, fonts: e.target.value})}>
          {catalog.font_pairs.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </label>
    </div>

    {visual && resolved ? <div className="grid gap-3 border-t border-border pt-4" data-testid="visual-style">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{KIND_LABEL[visual.type]}{sectionLabel ? ` · ${sectionLabel}` : ''}</div>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onVisualStyle({})} aria-label="Reset chart style"><RotateCcw className="mr-1 h-3.5 w-3.5"/>Reset</Button>
      </div>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Layout preset">
        {presets.map(p => <button key={p.id} type="button" role="radio" aria-checked={resolved.preset === p.id} title={p.description}
          onClick={() => onVisualStyle({preset: p.id, options: {}})}
          className={`rounded-md border px-2 py-1.5 text-left text-xs leading-tight transition-colors ${resolved.preset === p.id ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>{p.label}</button>)}
      </div>
      {Object.entries(specs).map(([name, spec]) => <OptionControl key={name} name={name} spec={spec} value={resolved.options[name]} labels={labels} onChange={value => setOption(name, value)}/>)}
      <p className="text-xs leading-snug text-muted-foreground">Style changes how a chart looks, never its numbers. Bars always start at zero.</p>
    </div> : <p className="border-t border-border pt-4 text-xs text-muted-foreground">This slide has no chart. Pick a slide with a chart to style it.</p>}
  </aside>;
}
