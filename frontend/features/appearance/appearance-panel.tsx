'use client';
// Settings › Appearance, as mockup HOME_2 draws it: on the left the five themes as small
// specimen cards (each drawn in its own theme) and the effects; on the right the open
// case's real Case home, split between the theme you use and the one you point at, its
// four facts, and the formats. Pointing at a card previews it there; choosing a card tries
// it on the whole app for this session, and the bar at the top keeps it or goes back. "+ Make your own" opens the
// theme maker (theme-maker.tsx); your own themes then sit among the cards and are tried and kept the same way.
import type {CSSProperties, ReactElement} from 'react';
import {useEffect, useState} from 'react';

import {STATUS_WORDS, LEVEL_WORDS} from '../../components/status';
import {clearHeroPhoto, loadHeroPhoto, onHeroPhotoChange, saveHeroPhoto, type HeroPhoto} from '../../lib/hero-photo';
import {webglAvailable} from '../effects/webgl';
import {ThemeCompare, type Look} from './theme-compare';
import {draftFrom, draftOf, ThemeMaker, type ThemeDraft} from './theme-maker';
import {checkPalette, ratioText} from '../../lib/contrast';
import {customTheme, customThemes, deleteCustomTheme, MAX_CUSTOM_THEMES, onCustomThemesChange, paletteVars, type CustomTheme} from '../../lib/custom-theme';
import {
  currentAppearance, DEFAULT_APPEARANCE, FORMATS, keepAppearance, keptAppearance, onAppearanceChange, THEMES, tryingCustom, tryingTheme, tryTheme,
  type Appearance, type Effects, type Format, type NamedEffect, type ThemeId,
} from '../../lib/theme';

type AppearanceState = {now: Appearance; kept: Appearance; trying: ThemeId | null; tryingOwn: string | null};

/** The appearance on screen now, kept up to date when it changes anywhere. */
export function useAppearance(): AppearanceState {
  // The first render matches the server's (stored choices are read after mounting), so hydration never disagrees.
  const [state, setState] = useState<AppearanceState>({now: DEFAULT_APPEARANCE, kept: DEFAULT_APPEARANCE, trying: null, tryingOwn: null});
  useEffect(() => {
    const read = () => setState({now: currentAppearance(), kept: keptAppearance(), trying: tryingTheme(), tryingOwn: tryingCustom()});
    read();
    const offA = onAppearanceChange(read);
    const offC = onCustomThemesChange(read);
    return () => { offA(); offC(); };
  }, []);
  return state;
}

/** Your own themes, kept up to date when one is saved or deleted. */
function useCustomThemes(): CustomTheme[] {
  const [list, setList] = useState<CustomTheme[]>([]);
  useEffect(() => {
    const read = () => setList(customThemes());
    read();
    return onCustomThemesChange(read);
  }, []);
  return list;
}

const themeName = (id: ThemeId): string => THEMES.find(t => t.id === id)?.name ?? id;
/** A theme's name, or the name of your own theme when there is one. */
export const lookName = (theme: ThemeId, own: string | null): string => customTheme(own)?.name ?? themeName(theme);

/** The bar at the top of every screen while a theme is on trial: Keep it, or go back (Esc). */
export function TryingBar(): ReactElement | null {
  const {trying, tryingOwn, kept} = useAppearance();
  useEffect(() => {
    if (!trying) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      tryTheme(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [trying]);
  if (!trying) return null;
  const name = lookName(trying, tryingOwn);
  return <div className="ap-trying" role="status">
    <i className="ap-trying-dot" aria-hidden="true"/>
    <span>Trying <b>{name}</b> · nothing is saved until you keep it</span>
    <button type="button" className="ap-btn p" onClick={() => keepAppearance({theme: trying, custom: tryingOwn})}>Keep {name}</button>
    <button type="button" className="ap-btn" onClick={() => tryTheme(null)}>Go back to {lookName(kept.theme, kept.custom)} <kbd>Esc</kbd></button>
  </div>;
}

const EFFECTS: {id: Effects; name: string}[] = [{id: 'full', name: 'Full'}, {id: 'light', name: 'Light'}, {id: 'off', name: 'Off'}];

/** The named effects, from the OnySnow Studios effect system (vendor/onysnow-effects, ADR-0009). */
const NAMED: {id: NamedEffect | null; name: string; line: string; themes: ThemeId[]}[] = [
  {id: 'bokeh', name: 'Bokeh lights on the board', line: 'CSS only · drifts 23–34 s', themes: ['rain-noir']},
  {id: 'rain', name: 'Rain on the case-home pane', line: 'WaterDrops · one pane only · a still “after the rain” frame if calm', themes: ['rain-noir']},
  {id: 'grain', name: 'Film grain', line: 'Never on documents', themes: ['rain-noir', 'archive']},
  {id: 'iris', name: 'Iris when a feature opens', line: '8-blade shutter · fades if calm', themes: ['rain-noir']},
  {id: 'shutter', name: 'Shutter corners on save', line: 'Brackets only, no flash', themes: ['rain-noir']},
  {id: 'neon', name: 'Neon title on Textbook flags', line: 'Steady only, never flicker', themes: ['rain-noir']},
  {id: 'bloom', name: 'Bloom on the AI run’s lights', line: 'WebGL · Watch the run only · stops if calm', themes: ['rain-noir']},
];

/** A format drawn small: where its panels sit. */
function FormatThumb({id}: {id: Format}): ReactElement {
  const box = (x: number, y: number, w: number, h: number, k = 0) => <rect key={`${x}${y}${k}`} x={x} y={y} width={w} height={h} rx={2}/>;
  const parts: Record<Format, ReactElement[]> = {
    board: [box(4, 6, 16, 26), box(23, 6, 26, 26, 1), box(52, 6, 16, 26, 2), box(4, 36, 64, 6, 3)],
    editorial: [box(6, 7, 44, 6), box(6, 17, 54, 6, 1), box(6, 27, 38, 6, 2), box(6, 37, 48, 4, 3)],
    desk: [box(5, 8, 14, 12), box(23, 5, 16, 14, 1), box(44, 10, 13, 12, 2), box(9, 26, 15, 13, 3), box(30, 24, 22, 17, 4)],
    story: [box(4, 6, 64, 4), box(4, 14, 20, 28, 1), box(27, 14, 20, 28, 2), box(50, 14, 18, 28, 3)],
  };
  return <svg className="ap-format" viewBox="0 0 72 46" aria-hidden="true">{parts[id]}</svg>;
}

/** WCAG grade of a contrast ratio written "4.66:1". */
export function contrastGrade(ratio: string): string {
  const n = Number.parseFloat(ratio);
  return n >= 7 ? 'AAA' : n >= 4.5 ? 'AA' : 'below AA';
}

function Switch({on, label, line, disabled, onChange}: {on: boolean; label: string; line: string; disabled?: boolean; onChange: (on: boolean) => void}): ReactElement {
  return <label className={`ap-switch${disabled ? ' off' : ''}`}>
    <span><b>{label}</b><small>{line}</small></span>
    <input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={e => onChange(e.target.checked)}/>
    <i aria-hidden="true"/>
  </label>;
}

/** The photograph behind Rain Noir's glass: the reporter's own, kept in this browser, decoration only. */
function RainPhoto(): ReactElement {
  const [photo, setPhoto] = useState<HeroPhoto | null>(null);
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    let live = true;
    const read = () => void loadHeroPhoto().then(p => { if (live) setPhoto(p); });
    read();
    const off = onHeroPhotoChange(read);
    return () => { live = false; off(); };
  }, []);
  return <div className="ap-photo">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {photo ? <img src={photo.url} alt=""/> : <span className="ap-photo-none" aria-hidden="true">no photograph</span>}
    <span><b>Photograph behind the glass</b>
      <small>{refused ? 'That file is not a picture.' : photo ? `${photo.name} · kept in this browser only, never with the case`
        : 'The rain needs a picture behind it: one of your own night shots. Kept in this browser only, never with the case.'}</small></span>
    <label className="ap-photo-pick">{photo ? 'Change…' : 'Choose…'}
      <input type="file" accept="image/*" onChange={e => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) void saveHeroPhoto(file).then(ok => setRefused(!ok));
      }}/></label>
    {photo && <button type="button" onClick={() => void clearHeroPhoto()}>Remove</button>}
  </div>;
}

/** A card in the gallery: one of the five themes, or one of your own drawn as its base theme in its own colours. */
type ThemeOption = {key: string; theme: ThemeId; own: CustomTheme | null; name: string; mood: string; swatches: string[]; lowest: string};

function optionsOf(own: CustomTheme[]): ThemeOption[] {
  return [
    ...THEMES.map(t => ({key: t.id, theme: t.id, own: null, name: t.name, mood: t.mood, swatches: t.swatches.slice(1), lowest: t.lowestContrast})),
    ...own.map(o => ({key: `own:${o.id}`, theme: o.base, own: o, name: o.name, mood: `Your own, from ${themeName(o.base)}. Kept in this browser.`,
      swatches: (['surface-1', 'surface-2', 'surface-3', 'text', 'accent-1', 'accent-2'] as const).map(k => o.colours[k]),
      lowest: ratioText(checkPalette(o.colours).lowest.ratio)})),
  ];
}

const ownStyle = (o: CustomTheme | null): CSSProperties | undefined => (o ? paletteVars(o.colours) as CSSProperties : undefined);

export function AppearancePanel(): ReactElement {
  const {now, kept, trying, tryingOwn} = useAppearance();
  const own = useCustomThemes();
  const options = optionsOf(own);
  const keyOf = (theme: ThemeId, custom: string | null) => (custom ? `own:${custom}` : theme);
  const [pointed, setPointed] = useState<string | null>(null);
  const [draft, setDraft] = useState<ThemeDraft | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const nowKey = keyOf(now.theme, now.custom);
  const keptKey = keyOf(kept.theme, kept.custom);
  const tryingKey = trying ? keyOf(trying, tryingOwn) : null;
  const lookingKey = pointed ?? tryingKey ?? keptKey;
  const looking = options.find(o => o.key === lookingKey) ?? options.find(o => o.key === keptKey) ?? options[0];
  const keptOption = options.find(o => o.key === keptKey) ?? options[0];
  const lookingWord = draft ? 'making' : tryingKey === looking.key ? 'trying' : looking.key === keptKey ? 'now' : 'pointed at';
  const lookOf = (o: ThemeOption): Look => ({theme: o.theme, colours: o.own?.colours ?? null, name: o.name});
  const after: Look = draft ? {theme: draft.base, colours: draft.colours, name: draft.name.trim() || 'Your theme'} : lookOf(looking);
  const afterCheck = draft ? checkPalette(draft.colours) : looking.own ? checkPalette(looking.own.colours) : null;
  const lowest = afterCheck ? ratioText(afterCheck.lowest.ratio) : looking.lowest;
  const passes = afterCheck ? afterCheck.failing.length === 0 : Number.parseFloat(looking.lowest) >= 4.5;
  const info = THEMES.find(t => t.id === after.theme)!;
  const remove = (o: CustomTheme) => {
    deleteCustomTheme(o.id);
    setDeleting(null);
    // Kept or on trial: back to the theme it started from (the kept choice falls back by itself once it is gone).
    if (tryingOwn === o.id) tryTheme(null);
    else keepAppearance({});
  };
  // Read after mounting, so the first render matches the server's.
  const [webgl, setWebgl] = useState(true);
  useEffect(() => setWebgl(webglAvailable()), []);
  return <section className="ap" aria-label="Appearance">
    <div className="ap-two">
      <div className="ap-pane">
        <header className="ap-pane-head"><h2>Theme</h2><span>colours, fonts, shadows, motion speed</span><em>Point at a card to preview ›</em></header>
        <div className="ap-cards" role="radiogroup" aria-label="Themes: arrows preview, Enter tries, K keeps" onMouseLeave={() => setPointed(null)}
          onKeyDown={e => {
            const cards = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=radio]'));
            const at = cards.indexOf(document.activeElement as HTMLButtonElement);
            if (at < 0) return;
            const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
            if (step) { e.preventDefault(); cards[(at + step + cards.length) % cards.length].focus(); return; }
            if ((e.key === 'k' || e.key === 'K') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); keepAppearance({theme: options[at].theme, custom: options[at].own?.id ?? null}); }
          }}>
          {options.map(t => {
            const current = keptKey === t.key;
            const card = <button key={t.key} type="button" data-theme={t.theme} role="radio" aria-checked={nowKey === t.key} style={ownStyle(t.own)}
              tabIndex={nowKey === t.key ? 0 : -1}
              className={`ap-card${nowKey === t.key ? ' on' : ''}${tryingKey === t.key ? ' trying' : ''}`}
              aria-label={`${t.name} theme${t.own ? ' (your own)' : ''}${current ? ', in use' : ''}${tryingKey === t.key ? ', trying' : ''}`}
              onMouseEnter={() => setPointed(t.key)} onFocus={() => setPointed(t.key)} onBlur={() => setPointed(null)}
              onClick={() => tryTheme(current ? null : t.theme, current ? null : t.own?.id ?? null)}>
              <span className="ap-card-head"><b>{t.name}</b>{current && <span className="ap-tag">Current</span>}{tryingKey === t.key && <span className="ap-tag try">Trying</span>}</span>
              <span className="ap-mood">{t.mood}</span>
              <span className="ap-sw" aria-hidden="true">{t.swatches.map((c, i) => <i key={`${c}${i}`} style={{background: c}}/>)}</span>
              <span className="ap-type" aria-hidden="true"><span className="ap-type-h">Header</span><span className="ap-type-b">Body copy</span><span className="ap-type-m">€29,400</span></span>
              <span className="ap-marks" aria-hidden="true">
                {(['supported', 'disputed', 'unshown', 'ruled_out'] as const).map(s => <i key={s} className={`st-${s}`} title={STATUS_WORDS[s].word}>{STATUS_WORDS[s].mark}</i>)}
                {(['faint', 'strong', 'textbook'] as const).map(l => <i key={l} className={`lv-${l}`} title={LEVEL_WORDS[l].word}>{LEVEL_WORDS[l].bars}</i>)}
              </span>
              <span className="ap-meta">Lowest pair {t.lowest} · {contrastGrade(t.lowest)}</span>
            </button>;
            if (!t.own) return card;
            const o = t.own;
            return <div key={t.key} className="ap-own-cell">
              {card}
              <span className="ap-own-acts">
                {deleting === o.id
                  ? <><span>Delete {o.name}?</span><button type="button" onClick={() => remove(o)}>Delete</button><button type="button" onClick={() => setDeleting(null)}>Keep it</button></>
                  : <><button type="button" onClick={() => { setDeleting(null); setDraft(draftOf(o)); }}>Edit</button><button type="button" onClick={() => setDeleting(o.id)}>Delete…</button></>}
              </span>
            </div>;
          })}
          <button type="button" className="ap-card ap-own" aria-expanded={draft !== null && !draft.id} disabled={own.length >= MAX_CUSTOM_THEMES && !draft}
            onClick={() => setDraft(draft && !draft.id ? null : draftFrom(keptOption.theme))}>
            <b>+ Make your own</b>
            <span className="ap-mood">Start from any theme and change colours. Each colour is checked for contrast before it can be saved.</span>
            {own.length >= MAX_CUSTOM_THEMES && <span className="ap-meta">This browser keeps {MAX_CUSTOM_THEMES}; delete one first</span>}
          </button>
        </div>
        {draft && <ThemeMaker draft={draft} onDraft={setDraft} onCancel={() => setDraft(null)}
          onSaved={t => {
            const editing = Boolean(draft.id);
            setDraft(null);
            // A new one goes on trial at once; an edited one already in use is drawn again in its new colours.
            if (!editing) tryTheme(t.base, t.id);
            else keepAppearance({});
          }}/>}

        <header className="ap-pane-head"><h2>Effects</h2><span>only on the board behind panels, never over text</span></header>
        <div className="ap-seg" role="radiogroup" aria-label="Effects">
          {EFFECTS.map(e => <button key={e.id} type="button" role="radio" aria-checked={now.effects === e.id} className={now.effects === e.id ? 'on' : ''}
            onClick={() => keepAppearance({effects: e.id})}>{e.name}</button>)}
          <span>{now.effects === 'light' ? 'Light: the same effects, standing still.' : now.effects === 'off' ? 'Off: a plain board.' : 'Full: the theme’s board effects, moving.'}</span>
        </div>
        <div className="ap-switches">
          {NAMED.map(n => {
            if (n.id === 'rain' && !webgl) return <Switch key={n.name} label={n.name} disabled line="Not available on this computer (no WebGL)" on={false} onChange={() => {}}/>;
            const usable = n.id !== null && now.effects !== 'off';
            const forTheme = n.id === null || n.themes.includes(now.theme);
            return <Switch key={n.name} label={n.name} disabled={!usable}
              line={n.id === null ? n.line : forTheme ? n.line : `${n.line} · only in ${n.themes.map(themeName).join(' and ')}`}
              on={n.id !== null && now.effects !== 'off' && !now.off.includes(n.id)}
              onChange={on => { if (n.id) keepAppearance({off: on ? now.off.filter(x => x !== n.id) : [...now.off, n.id]}); }}/>;
          })}
        </div>
        {webgl && now.theme === 'rain-noir' && now.effects !== 'off' && !now.off.includes('rain') && <RainPhoto/>}
        <Switch on={now.motion === 'calm'} label="Calm motion" line="Slides become fades, moving effects stand still and the rain shows a still “after the rain” frame. Your computer’s reduce-motion setting does the same."
          onChange={on => keepAppearance({motion: on ? 'calm' : 'normal'})}/>
      </div>

      <div className="ap-pane">
        <ThemeCompare before={lookOf(keptOption)} after={after} afterWord={lookingWord}/>
        <p className="ap-note">Drag the divider, or use ← → while it is focused. The preview is your real case, not a sample.</p>
        <dl className="ap-facts" aria-label={`${after.name ?? info.name} in four facts`}>
          <div><dt>{passes ? '✓ Passes every check' : '✕ Fails a contrast check'}</dt><dd>Lowest text pair {lowest} · {contrastGrade(lowest)}</dd></div>
          <div><dt>Calm zones untouched</dt><dd>{info.calm}</dd></div>
          <div><dt>Fonts on this computer</dt><dd>{info.fonts}</dd></div>
          <div><dt>Cost on this laptop</dt><dd>{info.cost}</dd></div>
        </dl>
        <header className="ap-pane-head"><h2>Format</h2><span>how home is laid out · chosen apart from theme</span></header>
        <div className="ap-formats" role="radiogroup" aria-label="Format">
          {FORMATS.map(f => <button key={f.id} type="button" role="radio" aria-checked={now.format === f.id} disabled={!f.ready} title={f.line}
            className={`ap-fmt${now.format === f.id ? ' on' : ''}`} onClick={() => keepAppearance({format: f.id})}>
            <FormatThumb id={f.id}/><b>{f.name}</b><small>{f.ready ? f.line.split(';')[0] : 'Planned'}</small>
          </button>)}
        </div>
      </div>
    </div>
  </section>;
}
