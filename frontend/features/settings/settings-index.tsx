'use client';
// Settings as mockup HOME_2 draws it: a sidebar of every setting under You, Cases and
// This computer, each with its current value, the chosen one opening on the right; the
// address keeps the choice (#keyboard). Search narrows the sidebar; Enter opens the first.
import {useCallback, useEffect, useState} from 'react';
import type {ReactElement} from 'react';

export type SettingRow = {
  group: 'You' | 'Cases' | 'This computer'; id: string; label: string; value: string; words?: string;
  /** A short line under the sidebar while this setting is open. */
  note?: string;
  /** Opens elsewhere instead of on the right. */
  href?: string;
};

const GROUPS: SettingRow['group'][] = ['You', 'Cases', 'This computer'];

/** The open section, read from and written to the address's #. */
export function useSection(ids: string[], first: string): [string, (id: string) => void] {
  const [section, setSection] = useState(first);
  const key = ids.join(' ');
  useEffect(() => {
    const read = () => {
      const hash = window.location.hash.replace(/^#/, '');
      setSection(key.split(' ').includes(hash) ? hash : first);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [key, first]);
  const go = useCallback((id: string) => {
    setSection(id);
    try { window.history.replaceState(null, '', `#${id}`); } catch { /* best effort */ }
    window.setTimeout(() => document.getElementById(`st-${id}`)?.focus({preventScroll: true}), 0);
  }, []);
  return [section, go];
}

const matches = (r: SettingRow, q: string): boolean => {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return words.every(w => `${r.group} ${r.label} ${r.value} ${r.words ?? ''}`.toLowerCase().includes(w));
};

export function SettingsSearch({rows, onGo}: {rows: SettingRow[]; onGo: (id: string) => void}): ReactElement {
  const [q, setQ] = useState('');
  const shown = q.trim() ? rows.filter(r => matches(r, q)) : [];
  return <div className="st-search-box">
    <input type="search" className="st-search" placeholder="Search settings…" aria-label="Search settings" value={q}
      onChange={e => setQ(e.target.value)} onKeyDown={e => {
        if (e.key !== 'Enter' || !shown[0]) return;
        e.preventDefault();
        if (shown[0].href) window.location.assign(shown[0].href); else onGo(shown[0].id);
        setQ('');
      }}/>
    {q.trim() && <ul className="st-results" aria-label="Matching settings">
      {shown.map(r => <li key={r.id}>{r.href ? <a href={r.href}>{r.label}</a>
        : <button type="button" onClick={() => { onGo(r.id); setQ(''); }}><span>{r.label}</span><small>{r.group}</small></button>}</li>)}
      {!shown.length && <li className="st-none">No setting matches “{q.trim()}”.</li>}
    </ul>}
  </div>;
}

export function SettingsNav({rows, current, onGo}: {rows: SettingRow[]; current: string; onGo: (id: string) => void}): ReactElement {
  const note = rows.find(r => r.id === current)?.note;
  return <nav className="st-nav" aria-label="All settings">
    {GROUPS.map(g => <section key={g} aria-label={g}>
      <h2>{g}</h2>
      <ul>{rows.filter(r => r.group === g).map(r => <li key={r.id}>
        {r.href ? <a href={r.href}><span>{r.label} <span aria-hidden="true">↗</span></span></a>
          : <button type="button" className={current === r.id ? 'on' : ''} aria-current={current === r.id ? 'page' : undefined}
            aria-label={r.value ? `${r.label}: ${r.value}` : r.label} onClick={() => onGo(r.id)}>
            <span>{r.label}</span>{r.value && <b>{r.value}</b>}</button>}
      </li>)}</ul>
    </section>)}
    {note && <p className="st-note">{note}</p>}
  </nav>;
}
