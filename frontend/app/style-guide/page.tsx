'use client';
// Style guide (/style-guide): the app's own tokens and parts, drawn from the live CSS so it cannot drift from the app.
// Exported with the site mockup (tools/export_site_mockup.mjs) for Ony to work on in Illustrator. Each section starts a
// page when printed.
import {useEffect, useRef, useState} from 'react';
import type {ReactElement, ReactNode} from 'react';

import {AiNotice, LevelChip, StatusChip} from '../../components/status';
import {Reveal} from '../../components/ui/reveal';
import {KIND_ICON} from '../../components/network/party-icons';
import {HEALTH, KIND_NAME, KindIcon} from '../../features/following/following-screen';
import {THEMES} from '../../lib/theme';

const ROLES: [string, string][] = [
  ['--ground', 'Ground: the page behind everything'], ['--surface-1', 'Surface 1: panels'], ['--surface-2', 'Surface 2: rows and cards in a panel'],
  ['--surface-3', 'Surface 3: chosen or hovered'], ['--text', 'Text'], ['--text-muted', 'Muted text'], ['--line', 'Lines and borders'],
  ['--accent-1', 'Accent 1: primary action, attention'], ['--accent-2', 'Accent 2: links, focus, information'],
  ['--status-supported', 'Supported'], ['--status-disputed', 'Disputed'], ['--status-unshown', 'Not yet shown'],
  ['--flag-faint', 'Flag: Faint'], ['--flag-strong', 'Flag: Strong'], ['--flag-textbook-fill', 'Flag: Textbook fill'],
  ['--flag-textbook-edge', 'Flag: Textbook edge'], ['--ai-mark', 'AI mark'],
];

const TYPE: [string, string, string][] = [
  ['Page title', '300 30px/1.15 var(--font-display)', 'Following'],
  ['Panel title', '600 20px var(--font-display)', 'The Marlow Courier · news feed'],
  ['Row title', '600 16px/1.35 var(--font-ui)', 'Harbour authority approves Kestrel lease extension'],
  ['Body', '400 15px/1.5 var(--font-ui)', 'The lease runs 25 years from the date of signing.'],
  ['Reading', '400 17px/1.6 var(--font-read)', 'The harbour authority voted on Monday to extend the lease.'],
  ['Eyebrow', '600 12px var(--font-mono)', 'SOURCES FOLLOWED'],
  ['Data', '600 15px var(--font-mono)', '6.87B USD · 23 May 2011'],
  ['Reveal card', '400 12.5px/1.45 var(--font-ui)', 'Looked 29 Oct, 18:56 · 0.4 s'],
];

function Swatch({name, role}: {name: string; role: string}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  useEffect(() => { if (ref.current) setValue(getComputedStyle(ref.current).getPropertyValue(name).trim()); }, [name]);
  return <div className="sg-swatch">
    <div ref={ref} className="sg-chip" style={{background: `var(${name})`}}/>
    <b>{role}</b><code>{name}</code><code>{value}</code>
  </div>;
}

function Section({title, children, theme}: {title: string; children: ReactNode; theme?: string}): ReactElement {
  return <section className="sg-section" data-theme={theme}>
    <p className="sg-eyebrow">Journalism Workbench · style guide</p>
    <h2 className="sg-title">{title}</h2>
    {children}
  </section>;
}

export default function StyleGuidePage(): ReactElement {
  return <main className="sg">
    <Section title="Rules">
      <ol className="sg-rules">
        <li><b>Show only what matters.</b> Titles, important data, alerts, numbers and icons stay on screen. Sub-text (explanations, timings, counts, hashes, full addresses) is revealed on hover, focus or click.</li>
        <li><b>Types are marks.</b> What kind of thing something is shows as an icon, shape, colour or position, named on hover or click.</li>
        <li><b>Fill the space.</b> A row with room above and below its content gets bigger text or a bigger icon, not more padding.</li>
        <li><b>Status is colour by default.</b> Settings › Appearance › Status marks adds the shape, or the shape and the word. The word is always on hover and read by screen readers.</li>
        <li><b>Keys live behind ?</b> No key strips on screens; the ? list holds every key.</li>
        <li><b>AI is a mark.</b> The plum AI mark, its notice on hover.</li>
      </ol>
    </Section>

    {THEMES.map(t => <Section key={t.id} title={`Colour · ${t.name}`} theme={t.id}>
      <p className="sg-mood">{t.mood}</p>
      <div className="sg-swatches">{ROLES.map(([name, role]) => <Swatch key={name} name={name} role={role}/>)}</div>
    </Section>)}

    <Section title="Type">
      <div className="sg-type">{TYPE.map(([role, font, sample]) => <div key={role} className="sg-type-row">
        <span className="sg-role">{role}</span><span style={{font, letterSpacing: role === 'Eyebrow' ? '.14em' : undefined}}>{sample}</span>
        <code>{font}</code></div>)}</div>
      <div className="sg-fonts">{(['--font-display', '--font-ui', '--font-read', '--font-mono'] as const).map(f =>
        <div key={f} style={{fontFamily: `var(${f})`}}><b>{f}</b><span>Aa Bb Cc 0123456789 — Kestrel SA</span></div>)}</div>
    </Section>

    <Section title="Space, corners, depth">
      <div className="sg-row">{[4, 6, 8, 10, 12, 14, 16, 18, 28].map(n => <div key={n} className="sg-space"><i style={{width: n, height: n}}/><code>{n}px</code></div>)}</div>
      <div className="sg-row">{[4, 6, 8, 10, 14, 999].map(r => <div key={r} className="sg-radius" style={{borderRadius: r}}><code>{r === 999 ? 'pill' : `${r}px`}</code></div>)}</div>
      <div className="sg-row">
        <div className="sg-depth" style={{background: 'var(--surface-1)', boxShadow: 'var(--shadow-panel)'}}><b>Panel</b><code>--shadow-panel</code></div>
        <div className="sg-depth" style={{background: 'var(--surface-2)', boxShadow: 'var(--shadow-lifted)'}}><b>Lifted</b><code>--shadow-lifted</code></div>
      </div>
    </Section>

    <Section title="Status and Red Flag levels">
      <div className="sg-grid3">
        <div><h3>Colour (default)</h3>
          <p className="sg-line">{(['supported', 'disputed', 'unshown', 'ruled_out'] as const).map(s => <StatusChip key={s} status={s}/>)}</p>
          <p className="sg-line">{(['faint', 'strong', 'textbook'] as const).map(l => <LevelChip key={l} level={l}/>)}</p></div>
        <div className="sg-shape"><h3>Colour and shape</h3>
          <p className="sg-line">{(['supported', 'disputed', 'unshown', 'ruled_out'] as const).map(s => <StatusChip key={s} status={s}/>)}</p>
          <p className="sg-line">{(['faint', 'strong', 'textbook'] as const).map(l => <LevelChip key={l} level={l}/>)}</p></div>
        <div><h3>Colour, shape and word</h3>
          <p className="sg-line">{(['supported', 'disputed', 'unshown', 'ruled_out'] as const).map(s => <StatusChip key={s} status={s} showWord/>)}</p>
          <p className="sg-line">{(['faint', 'strong', 'textbook'] as const).map(l => <LevelChip key={l} level={l} showWord/>)}</p></div>
      </div>
    </Section>

    <Section title="Marks">
      <h3>Source kinds (Following)</h3>
      <div className="sg-marks">{(Object.keys(KIND_NAME) as (keyof typeof KIND_NAME)[]).map(k => <div key={k}><KindIcon kind={k}/><span>{KIND_NAME[k][0]}</span></div>)}</div>
      <h3>Source health</h3>
      <div className="sg-marks">{Object.entries(HEALTH).map(([k, h]) => <div key={k}><span className={`fl-health ${h.tone}`}>{h.glyph}</span><span>{h.word}</span></div>)}</div>
      <h3>Party kinds</h3>
      <div className="sg-marks">{Object.entries(KIND_ICON).map(([k, Icon]) => <div key={k}>{Icon ? <Icon size={20} aria-hidden="true"/> : <span>–</span>}<span>{k}</span></div>)}</div>
      <h3>AI and worked out</h3>
      <div className="sg-marks"><div><AiNotice>AI can be wrong. Every result waits for you.</AiNotice><span>AI notice</span></div>
        <div><span className="sg-f">ƒ</span><span>Worked out by the app</span></div></div>
    </Section>

    <Section title="Parts">
      <h3>Buttons</h3>
      <div className="sg-row fl-acts"><button type="button" className="p">Capture</button><button type="button">Skip</button>
        <button type="button" className="danger">Stop following</button><button type="button" aria-disabled="true">Capture</button></div>
      <h3>Choices</h3>
      <div className="fl-chips"><button type="button">15 min</button><button type="button" className="on">30 min</button><button type="button">hourly</button><button type="button">daily</button></div>
      <h3>Alerts on a row</h3>
      <p className="fl-alerts"><span className="fl-flag amber">Edited 2×</span><span className="fl-flag amber">Changed +2 −1</span><span className="fl-flag bad">Gone · 404</span><span className="fl-flag teal">+3 copies</span></p>
      <h3>Reveal: sub-text on hover, focus or click</h3>
      <div className="sg-row"><Reveal detail="Looked 29 Oct, 18:56 · 0.4 s · read 14, 2 new"><span className="fl-nums"><b>2</b> waiting</span></Reveal>
        <div className="rv-card sg-static"><b>The Marlow Courier · news feed</b><span className="rv-row rv-mono">https://www.marlow-courier.example/a</span><span className="rv-row">First seen 29 Oct, 09:48</span></div></div>
      <h3>Panel and row</h3>
      <div className="fl-card sg-panel"><p className="fl-eyebrow"><span>Sources followed</span><b>6</b></p>
        <ul className="fl-sources"><li><button type="button" className="on"><KindIcon kind="feed"/><span className="fl-name">The Marlow Courier · news feed</span><span className="fl-health ok">●</span><span className="fl-badge">2</span></button></li>
          <li><button type="button"><KindIcon kind="page"/><span className="fl-name">Fernhill Ltd · About page</span><span className="fl-health amber">↪</span></button></li></ul></div>
    </Section>
  </main>;
}
