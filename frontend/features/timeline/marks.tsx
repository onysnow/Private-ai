'use client';
// The Timeline's marks (Ony, 29 Oct: statuses are colour, a categorical fact is a mark, each named on hover, focus or
// click; key hints live behind ?). One place, so Lanes, Stack, Replay, Board, Periods and Build your own say them alike.
import type {ReactElement, ReactNode} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {eventKind} from '../../lib/viz-tokens';
import {FACT} from './lanes-model';
import type {Fact} from './lanes-model';

/** The word for an event's one mark, as a reveal says it. */
export const factWord = (fact: Fact): string => (fact === 'not_yet' ? 'Not yet shown' : FACT[fact].name.replace(/^./, c => c.toUpperCase()));

/** An event's mark (shown, not yet, disputed, worked out): its glyph in its colour, the word and any note on reveal. */
export function FactMark({fact, note, tabbable = true, big = false}: {fact: Fact; note?: ReactNode; tabbable?: boolean; big?: boolean}): ReactElement {
  const f = FACT[fact];
  return <Reveal tabbable={tabbable} label={tabbable ? factWord(fact) : undefined} describe={tabbable}
    detail={<><b>{factWord(fact)}</b>{note ? <span className="rv-row">{note}</span> : null}</>}>
    <i className={`tl2-glyph f-${f.tone}${big ? ' big' : ''}`} aria-hidden={tabbable ? 'true' : undefined}
      aria-label={tabbable ? undefined : factWord(fact)}>{f.glyph}</i>
  </Reveal>;
}

/** A kind of record (payment, document, your event…) as its colour; the name on reveal. */
export function KindDot({kind, word, tabbable = true}: {kind: string; word?: string; tabbable?: boolean}): ReactElement {
  const k = eventKind(kind);
  const name = word ?? k.name;
  return <Reveal tabbable={tabbable} label={tabbable ? name : undefined} describe={tabbable} detail={<b>{name}</b>}>
    <i className="tl2-kinddot" style={{background: k.colour}} aria-hidden="true"/>
  </Reveal>;
}

/** The keys a view answers to, behind a ? (Ony, 29 Oct). */
export function KeysMark({children}: {children: ReactNode}): ReactElement {
  return <Reveal label="Keys" detail={children}><span className="tl2-q" aria-hidden="true">?</span></Reveal>;
}

/** A how-to or an explanation behind a small ⓘ, for a place that has no title of its own to hang it on. */
export function Aside({label, children}: {label: string; children: ReactNode}): ReactElement {
  return <Reveal label={label} detail={children}><span className="tl2-q" aria-hidden="true">ⓘ</span></Reveal>;
}
