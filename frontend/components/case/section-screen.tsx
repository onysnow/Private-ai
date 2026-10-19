'use client';
// A stage's whole-screen page (redesign, step 6): the stage's name and its
// sections as tabs, one section filling the screen at a time. The page never
// scrolls; a section scrolls inside itself, or lays itself out to fit (a
// section marked `fill`, such as the Red Flags board). The address keeps the
// section (/act#leads), so links from other screens land on it, and a section
// once opened stays mounted so going back to it keeps its place.
import {useCallback, useEffect, useState} from 'react';
import type {ReactElement, ReactNode} from 'react';

import {STAGES} from '../../lib/stages';
import type {StageKey} from '../../lib/stages';

export type Section = {
  anchor: string;
  label: string;
  /** A short count or state beside the tab's name ("12", "3 open"). */
  badge?: ReactNode;
  /** The section lays itself out to the screen; otherwise it scrolls inside. */
  fill?: boolean;
  render: () => ReactNode;
};

const fromHash = (sections: Section[]): string | null => {
  if (typeof window === 'undefined') return null;
  const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  return sections.some(s => s.anchor === hash) ? hash : null;
};

export function SectionScreen({stage, investigationName, sections, active = true}: {
  stage: StageKey; investigationName: string; sections: Section[]; active?: boolean;
}): ReactElement {
  const s = STAGES.find(x => x.key === stage)!;
  // The first render matches the server's (which cannot see the address's #); the effect below then opens the asked-for section.
  const [current, setCurrent] = useState<string>(sections[0].anchor);
  const [opened, setOpened] = useState<Set<string>>(() => new Set([current]));

  const open = useCallback((anchor: string, write = true) => {
    setCurrent(anchor);
    setOpened(prev => (prev.has(anchor) ? prev : new Set(prev).add(anchor)));
    if (write && typeof window !== 'undefined') window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${anchor}`);
  }, []);

  // A link to /act#leads, or the hash changing while the page is open, opens that section.
  useEffect(() => {
    if (!active) return undefined;
    const follow = () => { const asked = fromHash(sections); if (asked) open(asked, false); };
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, [active, sections, open]);

  const at = sections.findIndex(x => x.anchor === current);
  const step = (by: number) => open(sections[(at + by + sections.length) % sections.length].anchor);

  return <div className="ss" style={{['--stage' as string]: s.colour}} data-stage={stage}>
    <header className="ss-head">
      <div className="ss-title">
        <p className="cv-eyebrow">{investigationName ? '' : 'No case open · '}step {s.n} of 5</p>
        <h1>{s.name}</h1>
      </div>
      <nav className="ss-tabs" aria-label={`Sections of ${s.name}`}
        onKeyDown={e => { if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } }}>
        {sections.map(x => <a key={x.anchor} href={`#${x.anchor}`} aria-current={x.anchor === current ? 'page' : undefined}
          onClick={e => { e.preventDefault(); open(x.anchor); }}>
          {x.label}{x.badge !== undefined && x.badge !== null && <span className="ss-badge">{x.badge}</span>}
        </a>)}
      </nav>
      <p className="ss-line">{s.line}</p>
    </header>
    <div className="ss-body">
      {sections.map(x => opened.has(x.anchor) && <section key={x.anchor} id={`${x.anchor}-section`} aria-label={x.label}
        className={`ss-sec${x.fill ? ' fill' : ''}`} hidden={x.anchor !== current}>
        {x.render()}
      </section>)}
    </div>
  </div>;
}
