'use client';
// The catalogue as cards (mockup KNOWLEDGE_KEEP_1's "Cards"; research Knowledge §6): the chosen area's indicators one
// card at a time. The front is the sign in the catalogue's words; Space (or a click) turns it to the name, the
// innocent explanations first, and the first source. ← / → move through the area. This is browsing, not Practise:
// nothing is scheduled or kept (spaced review needs a store that is not built yet).
import {useQuery} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import type {KeyboardEvent, ReactElement} from 'react';

import {getIndicatorOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {CatalogueAreaOut, CatalogueIndicatorRowOut} from '../../lib/generated/types.gen';

export function CatalogueCards({area, rows, indicator, onOpenIndicator}: {
  area: CatalogueAreaOut | undefined; rows: CatalogueIndicatorRowOut[]; indicator: string; onOpenIndicator: (id: string) => void;
}): ReactElement {
  const at = Math.max(0, rows.findIndex(r => r.id === indicator));
  const row = rows[at];
  const [flipped, setFlipped] = useState(false);
  useEffect(() => setFlipped(false), [row?.id]);
  const query = useQuery({...getIndicatorOptions({path: {indicator_id: row?.id ?? ''}}), enabled: Boolean(row), staleTime: Infinity});
  const go = (by: number) => { const next = rows[(at + by + rows.length) % rows.length]; if (next) onOpenIndicator(next.id); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === ' ') { e.preventDefault(); setFlipped(v => !v); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  };
  const ind = query.data;
  return <section className="kc-panel kc-cards" aria-label="Cards">
    <p className="kc-eyebrow">{area ? `${area.key} · ${area.name}` : 'Cards'} · card {rows.length ? at + 1 : 0} of {rows.length}</p>
    {row && <div className="kc-card-stage">
      <button type="button" className={`kc-flip${flipped ? ' flipped' : ''}`} onClick={() => setFlipped(v => !v)} onKeyDown={onKey}
        aria-label={flipped ? `${row.id} ${row.name}: the answer side. Space turns it back.` : 'The sign. Space turns the card.'}>
        <span className="kc-face front" aria-hidden={flipped}>
          <span className="kc-eyebrow">Which sign is this?</span>
          <span className="kc-card-text">{ind ? ind.definition : '…'}</span>
        </span>
        <span className="kc-face back" aria-hidden={!flipped}>
          <span className="kc-eyebrow">{row.id}</span>
          <span className="kc-ind-name">{row.name}</span>
          {ind && <><span className="kc-eyebrow">✓ Could be innocent</span>
            <span className="kc-card-list">{ind.innocent_explanations.slice(0, 3).map((t, i) => <span key={i}>· {t}</span>)}</span>
            {ind.sources[0] && <span className="kc-small">{ind.sources[0].publisher} {ind.sources[0].year ?? ''}</span>}</>}
        </span>
      </button>
      <div className="kc-card-nav">
        <button type="button" className="kc-btn ghost" onClick={() => go(-1)}>← Previous</button>
        <button type="button" className="kc-btn ghost" onClick={() => setFlipped(v => !v)}>{flipped ? 'Turn back' : 'Turn the card'}</button>
        <button type="button" className="kc-btn ghost" onClick={() => go(1)}>Next →</button>
      </div>
    </div>}
    {!row && <p className="kc-quiet">Choose an area to go through its indicators as cards.</p>}
  </section>;
}
