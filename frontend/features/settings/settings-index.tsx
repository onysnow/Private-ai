'use client';
// Settings at a glance (mockup HOME_2, "Settings regrouped"): every setting under You,
// Cases or This computer, each row showing its current value; typing narrows the rows,
// and a row (or Enter on the first match) jumps to where the setting is changed.
import {useState} from 'react';
import type {ReactElement} from 'react';

export type SettingRow = {group: 'You' | 'Cases' | 'This computer'; label: string; value: string; target: string; words?: string};

const GROUPS: SettingRow['group'][] = ['You', 'Cases', 'This computer'];

function jump(target: string): void {
  const el = document.getElementById(target);
  if (!el) return;
  el.scrollIntoView({block: 'start'});
  el.focus({preventScroll: true});
}

export function SettingsIndex({rows}: {rows: SettingRow[]}): ReactElement {
  const [q, setQ] = useState('');
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter(r => words.every(w => `${r.group} ${r.label} ${r.value} ${r.words ?? ''}`.toLowerCase().includes(w)));
  return <nav className="st-index" aria-label="All settings">
    <input type="search" className="st-search" placeholder="Search settings…" aria-label="Search settings" value={q}
      onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && shown[0]) { e.preventDefault(); jump(shown[0].target); } }}/>
    <div className="st-groups">
      {GROUPS.map(g => {
        const mine = shown.filter(r => r.group === g);
        if (!mine.length) return null;
        return <section key={g} aria-label={g}>
          <h2>{g}</h2>
          <ul>{mine.map(r => <li key={r.label}><button type="button" aria-label={`${r.label}: ${r.value}`} onClick={() => jump(r.target)}>
            <span>{r.label}</span><b>{r.value}</b></button></li>)}</ul>
        </section>;
      })}
      {!shown.length && <p className="st-none">No setting matches “{q.trim()}”.</p>}
    </div>
  </nav>;
}
