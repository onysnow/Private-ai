'use client';
// Settings › Appearance (Workbench-redesign-2026.pdf, chapter 03 and "The case home, navigation and settings" §11):
// theme, effects and motion chosen separately. A theme can be tried on the real app for this session before it is
// kept ("Try, then keep"); the bar at the top of every screen offers Keep or Go back while one is on trial.
// Formats other than Board are listed as planned.
import type {ReactElement} from 'react';
import {useEffect, useState} from 'react';

import {StatusChip, LevelChip} from '../../components/status';
import {setSingleKeys, singleKeysOn} from '../../lib/shortcuts';
import {
  currentAppearance, FORMATS, keepAppearance, keptAppearance, onAppearanceChange, THEMES, tryingTheme, tryTheme,
  type Appearance, type Effects, type ThemeId,
} from '../../lib/theme';

/** The appearance on screen now, kept up to date when it changes anywhere. */
export function useAppearance(): {now: Appearance; kept: Appearance; trying: ThemeId | null} {
  const [state, setState] = useState(() => ({now: currentAppearance(), kept: keptAppearance(), trying: tryingTheme()}));
  useEffect(() => {
    const read = () => setState({now: currentAppearance(), kept: keptAppearance(), trying: tryingTheme()});
    read();
    return onAppearanceChange(read);
  }, []);
  return state;
}

/** The slim bar while a theme is on trial: Keep or Go back. Shown on every screen. */
export function TryingBar(): ReactElement | null {
  const {trying} = useAppearance();
  if (!trying) return null;
  const name = THEMES.find(t => t.id === trying)?.name ?? trying;
  return <div className="ap-trying" role="status">
    <span>Trying <b>{name}</b>. Nothing is saved until you keep it.</span>
    <button type="button" className="ap-btn p" onClick={() => keepAppearance({theme: trying})}>Keep {name}</button>
    <button type="button" className="ap-btn" onClick={() => tryTheme(null)}>Go back</button>
  </div>;
}

const EFFECTS: {id: Effects; name: string; line: string}[] = [
  {id: 'full', name: 'Full', line: 'The theme\'s board effects, moving.'},
  {id: 'light', name: 'Light', line: 'The same effects, still.'},
  {id: 'off', name: 'Off', line: 'A plain board.'},
];

export function AppearancePanel(): ReactElement {
  const {now, kept, trying} = useAppearance();
  const [singleKeys, setSingle] = useState(true);
  useEffect(() => setSingle(singleKeysOn()), []);
  return <section className="ap" aria-labelledby="ap-title">
    <h2 id="ap-title">Appearance</h2>
    <p className="ap-sub">Theme, effects and motion are separate choices, kept in this browser only. Status always shows a shape and a word, in every theme.</p>

    <h3 className="ap-h">Theme</h3>
    <div className="ap-grid" role="list">
      {THEMES.map(t => {
        const on = now.theme === t.id;
        return <article key={t.id} role="listitem" className={`ap-card${on ? ' on' : ''}`} data-theme={t.id} aria-label={`${t.name} theme`}>
          <header><b>{t.name}</b>{kept.theme === t.id && <span className="ap-tag">In use</span>}{trying === t.id && <span className="ap-tag try">Trying</span>}</header>
          <p className="ap-mood">{t.mood}</p>
          <div className="ap-sw" aria-hidden="true">{t.swatches.map(c => <i key={c} style={{background: c}}/>)}</div>
          <div className="ap-sample">
            <span className="ap-read">Board minutes, 4 March 2019</span>
            <span className="ap-mono">€9,800.00 · 3× Feb–Apr 2018</span>
          </div>
          <div className="ap-chips"><StatusChip status="supported"/><StatusChip status="disputed"/><StatusChip status="unshown"/><LevelChip level="textbook"/></div>
          <p className="ap-meta">{t.fonts} · lowest text pair {t.lowestContrast}</p>
          <p className="ap-meta">{t.effects}</p>
          <div className="ap-actions">
            {kept.theme === t.id && !trying ? <span className="ap-meta">This is your theme.</span> : <>
              <button type="button" className="ap-btn" onClick={() => tryTheme(t.id)} disabled={trying === t.id}>Try for this session</button>
              <button type="button" className="ap-btn p" onClick={() => keepAppearance({theme: t.id})}>Use {t.name}</button>
            </>}
          </div>
        </article>;
      })}
    </div>

    <div className="ap-row">
      <fieldset className="ap-set">
        <legend>Effects</legend>
        {EFFECTS.map(e => <label key={e.id} className="ap-opt"><input type="radio" name="ap-effects" checked={now.effects === e.id}
          onChange={() => keepAppearance({effects: e.id})}/><span><b>{e.name}</b> {e.line}</span></label>)}
      </fieldset>
      <fieldset className="ap-set">
        <legend>Motion</legend>
        <label className="ap-opt"><input type="checkbox" checked={now.motion === 'calm'} onChange={ev => keepAppearance({motion: ev.target.checked ? 'calm' : 'normal'})}/>
          <span><b>Calm motion</b> Every movement becomes a short fade. Your computer&apos;s reduce-motion setting does the same.</span></label>
      </fieldset>
      <fieldset className="ap-set">
        <legend>Keys</legend>
        <label className="ap-opt"><input type="checkbox" checked={singleKeys} onChange={ev => { setSingleKeys(ev.target.checked); setSingle(ev.target.checked); }}/>
          <span><b>Single-key shortcuts</b> [ opens the steps, ] the tools, ? the list of keys. They never fire while you type.</span></label>
      </fieldset>
      <fieldset className="ap-set">
        <legend>Format</legend>
        {FORMATS.map(f => <label key={f.id} className={`ap-opt${f.ready ? '' : ' off'}`}><input type="radio" name="ap-format" checked={now.format === f.id} disabled={!f.ready}
          onChange={() => keepAppearance({format: f.id})}/><span><b>{f.name}</b> {f.line}{f.ready ? '' : ' Planned.'}</span></label>)}
      </fieldset>
    </div>
  </section>;
}
