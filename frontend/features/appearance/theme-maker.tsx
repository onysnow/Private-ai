'use client';
// "+ Make your own" (mockup HOME_2; research §04.2): start from any theme, change its colours, and each pair they
// meet in is checked for contrast as you go (lib/contrast). Save stays refused, naming the failing pair, until every
// pair passes. While you edit, the before/after on the right shows the draft on your real case.
import type {ReactElement} from 'react';
import {useId, useMemo, useState} from 'react';

import {checkPalette, COLOUR_TOKENS, isHex, ratioText, type ColourToken, type Palette} from '../../lib/contrast';
import {BASE_PALETTES, MAX_NAME, saveCustomTheme, type CustomTheme} from '../../lib/custom-theme';
import {THEMES, type ThemeId} from '../../lib/theme';

export type ThemeDraft = {id?: string; name: string; base: ThemeId; colours: Palette};

export const draftFrom = (base: ThemeId, name = ''): ThemeDraft => ({name, base, colours: {...BASE_PALETTES[base]}});
export const draftOf = (t: CustomTheme): ThemeDraft => ({id: t.id, name: t.name, base: t.base, colours: {...t.colours}});

const GROUPS = Array.from(new Set(COLOUR_TOKENS.map(t => t.group)));

/** One colour: the picker and the same colour written out, which takes a pasted #rrggbb. */
function ColourRow({token, name, value, failing, onChange}: {token: ColourToken; name: string; value: string; failing: boolean; onChange: (v: string) => void}): ReactElement {
  // What is being typed, until it is a whole colour or the field is left; the colour itself otherwise.
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? value;
  return <label className={`ap-mk-row${failing ? ' bad' : ''}`} data-token={token}>
    <input type="color" value={value.toLowerCase()} aria-label={`${name} colour`} onChange={e => { setTyped(null); onChange(e.target.value.toUpperCase()); }}/>
    <span>{name}{failing && <em> ✕ fails</em>}</span>
    <input type="text" className="ap-mk-hex" value={shown} spellCheck={false} maxLength={7} aria-label={`${name}, written #rrggbb`} aria-invalid={!isHex(shown)}
      onChange={e => {
        const v = e.target.value.trim();
        setTyped(v);
        if (isHex(v)) onChange(v.toUpperCase());
      }}
      onBlur={() => setTyped(null)}/>
  </label>;
}

export function ThemeMaker({draft, onDraft, onSaved, onCancel}: {
  draft: ThemeDraft; onDraft: (d: ThemeDraft) => void; onSaved: (t: CustomTheme) => void; onCancel: () => void;
}): ReactElement {
  const nameId = useId();
  const [problem, setProblem] = useState<string | null>(null);
  const [allPairs, setAllPairs] = useState(false);
  const check = useMemo(() => checkPalette(draft.colours), [draft.colours]);
  const failingTokens = new Set(check.failing.flatMap(p => [p.fg, p.bg]));
  const set = (patch: Partial<ThemeDraft>) => { setProblem(null); onDraft({...draft, ...patch}); };
  const save = () => {
    const result = saveCustomTheme(draft);
    if (result.ok) onSaved(result.theme);
    else setProblem(result.reason);
  };
  const blocked = check.failing.length > 0 || !draft.name.trim();
  const shownPairs = allPairs ? check.pairs : check.failing;
  return <section className="ap-maker" aria-label={draft.id ? `Edit ${draft.name}` : 'Make your own theme'}>
    <header className="ap-pane-head"><h2>{draft.id ? `Edit ${draft.name || 'your theme'}` : 'Make your own'}</h2>
      <span>colours only; fonts, effects and calm zones come from the theme you start from</span></header>
    <div className="ap-mk-top">
      <label className="ap-mk-field"><span>Start from</span>
        <select value={draft.base} onChange={e => set({base: e.target.value as ThemeId, colours: {...BASE_PALETTES[e.target.value as ThemeId]}})}>
          {THEMES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select></label>
      <label className="ap-mk-field" htmlFor={nameId}><span>Name</span>
        <input id={nameId} type="text" value={draft.name} maxLength={MAX_NAME} placeholder="e.g. Night desk" onChange={e => set({name: e.target.value})}/></label>
    </div>
    <div className="ap-mk-groups">
      {GROUPS.map(g => <fieldset key={g} className="ap-mk-group"><legend>{g}</legend>
        {COLOUR_TOKENS.filter(t => t.group === g).map(t => <ColourRow key={`${draft.base}-${t.token}`} token={t.token} name={t.name} value={draft.colours[t.token]}
          failing={failingTokens.has(t.token)} onChange={v => set({colours: {...draft.colours, [t.token]: v}})}/>)}
      </fieldset>)}
    </div>
    <div className={`ap-mk-check${check.failing.length ? ' bad' : ''}`} role="status" aria-live="polite">
      {check.failing.length
        ? <b>✕ {check.failing.length} of {check.pairs.length} pairs fail · cannot be saved yet</b>
        : <b>✓ Passes all {check.pairs.length} checks · lowest pair {ratioText(check.lowest.ratio)} · {check.lowest.ratio >= 7 ? 'AAA' : 'AA'}</b>}
      <button type="button" className="ap-mk-link" aria-expanded={allPairs} onClick={() => setAllPairs(!allPairs)}>{allPairs ? 'Show only failing pairs' : `Show all ${check.pairs.length} pairs`}</button>
    </div>
    {shownPairs.length > 0 && <ul className="ap-mk-pairs" aria-label={allPairs ? 'Every pair' : 'Failing pairs'}>
      {shownPairs.map(p => <li key={p.what} className={p.ok ? 'ok' : 'bad'}>
        <i aria-hidden="true" style={{color: p.fg.startsWith('#') ? p.fg : draft.colours[p.fg as ColourToken], background: draft.colours[p.bg]}}>Aa</i>
        <span>{p.ok ? '✓' : '✕'} {p.what}</span>
        <small>{ratioText(p.ratio, !p.ok)} · needs {p.min}:1{p.ok ? '' : ' · fails'}</small>
      </li>)}
    </ul>}
    {problem && <p className="ap-mk-problem" role="alert">{problem}</p>}
    <div className="ap-mk-actions">
      <button type="button" className="ap-btn p" aria-disabled={blocked} onClick={() => {
        if (!draft.name.trim()) { setProblem('Give it a name first.'); return; }
        if (check.failing.length) { const f = check.failing[0]; setProblem(`${f.what} is ${ratioText(f.ratio, true)}; it needs ${f.min}:1.`); return; }
        save();
      }}>{draft.id ? 'Save changes' : 'Save and try it'}</button>
      <button type="button" className="ap-btn" onClick={onCancel}>Cancel</button>
      <small>Kept in this browser only, like the photograph behind the glass.</small>
    </div>
  </section>;
}
