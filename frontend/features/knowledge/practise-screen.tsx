'use client';
// Learn › Practise (research Knowledge §6 "Practise (flip cards) in Learn"; no mockup draws the screen itself, the
// catalogue mockup draws its door, "⟲ Practise · 12 due"). Front: the sign as a short scene. Space turns the card.
// Back: the indicator's name, its levels, the innocent explanations first, and the source. Again / Good by default
// ([R4] simple mode), Hard / Easy behind a setting; keys 1–2 (or 1–4) answer, Esc leaves. Decks: all my cards,
// "My case's areas", any area, "Terms I opened", "Safety". States: "Nothing due. Next in 2 days · Practise anyway";
// an empty deck says "Open a term and press ＋ Flip card". The turn is the catalogue's 3D card (450 ms); Calm and
// reduced motion turn it into a crossfade or a cut (styles/learn.css). Cards a reporter answers Again come round
// again at the end of the sitting.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import Link from 'next/link';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement, ReactNode} from 'react';

import {errorMessage} from '../../lib/api-client';
import {
  answerLearningCardMutation, getGlossaryEntryOptions, getIndicatorOptions, listAreasOptions, listLearningCardsOptions,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {LearningCardOut} from '../../lib/generated/types.gen';
import {LevelMark} from '../act/red-flags-board';
import {UNSET_LEVEL, shortAreaName} from './families';
import {
  ANSWER_LABEL, DECK_LABEL, firstSentence, intervalWords, invalidateLearning, readFourAnswers, shownAnswers, untilWords,
  usePractiseSummary, writeFourAnswers,
} from './practise-data';
import type {AnswerKey, Deck} from './practise-data';

const STEPS = ['faint', 'strong', 'textbook'] as const;

function deckName(deck: Deck, areaNames: Map<string, string>): string {
  return deck.deck === 'area' ? `${deck.area} · ${shortAreaName(areaNames.get(deck.area ?? '') ?? '')}` : DECK_LABEL[deck.deck];
}

export function PractiseScreen({tabs, caseAreas, hasCase, initial, onDeck, onLeave}: {
  tabs: ReactNode; caseAreas: string[]; hasCase: boolean; initial: Deck; onDeck: (deck: Deck) => void; onLeave: () => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const [deck, setDeckState] = useState<Deck>(initial);
  const [anyway, setAnyway] = useState(false);
  const [four, setFour] = useState(false);
  useEffect(() => setFour(readFourAnswers()), []);
  const summary = usePractiseSummary(caseAreas);
  const areasQuery = useQuery({...listAreasOptions(), staleTime: Infinity});
  const areaNames = useMemo(() => new Map((areasQuery.data ?? []).map(a => [a.key, a.name])), [areasQuery.data]);

  // One sitting: the deck's cards as they stood when it began; answers do not reshuffle it.
  const [round, setRound] = useState(0);
  const sitting = `${deck.deck}:${deck.area ?? ''}:${anyway ? 'all' : 'due'}:${round}`;
  const list = useQuery({...listLearningCardsOptions({query: {deck: deck.deck, areas: caseAreas.join(','), area: deck.area ?? null, due_only: !anyway, limit: 200}}),
    staleTime: 0});
  const [queue, setQueue] = useState<{key: string; cards: LearningCardOut[]}>({key: '', cards: []});
  const [at, setAt] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    if (queue.key === sitting || !list.data || list.isFetching) return;
    setQueue({key: sitting, cards: list.data.cards});
    setAt(0);
    setFlipped(false);
  }, [list.data, list.isFetching, queue.key, sitting]);

  const chooseDeck = (next: Deck) => {
    setDeckState(next); setAnyway(false); setAnswered(0); onDeck(next);
  };
  const card = queue.key === sitting ? queue.cards[at] : undefined;
  const answer = useMutation({...answerLearningCardMutation()});
  const give = async (given: AnswerKey) => {
    if (!card || !flipped || answer.isPending) return;
    const updated = await answer.mutateAsync({body: {card_id: card.id, answer: given}});
    setAnswered(n => n + 1);
    setFlipped(false);
    const cards = given === 'again' ? [...queue.cards, updated] : queue.cards;
    if (at + 1 < cards.length) { setQueue({key: sitting, cards}); setAt(at + 1); }
    else { setAnyway(false); setRound(r => r + 1); }
    void invalidateLearning(queryClient);
  };

  const answers = shownAnswers(four);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (card) cardRef.current?.focus({preventScroll: true}); }, [card?.id, at]); // eslint-disable-line react-hooks/exhaustive-deps
  // Space turns, 1–2 (or 1–4) answer once the card is turned, Esc leaves. Keys typed into a field stay there.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') { e.preventDefault(); onLeave(); return; }
      if (!card) return;
      if (e.key === ' ') { e.preventDefault(); setFlipped(v => !v); return; }
      const n = Number(e.key);
      if (flipped && Number.isInteger(n) && n >= 1 && n <= answers.length) { e.preventDefault(); void give(answers[n - 1]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const counts = summary.data;
  const deckCount = (d: Deck) => d.deck === 'area' ? counts?.areas.find(a => a.area === d.area) : counts?.decks.find(c => c.deck === d.deck);
  const shown = deckCount(deck);
  const loading = list.isPending || (queue.key !== sitting && !list.isError);
  const total = list.data?.total ?? 0;

  return <>
    <header className="kc-top">
      {tabs}
      <div className="kp-decks" role="group" aria-label="Deck">
        {(['all', 'case', 'terms', 'safety'] as const).map(key => {
          const c = deckCount({deck: key});
          const off = key === 'case' && !hasCase;
          return <button type="button" key={key} aria-pressed={deck.deck === key} className={deck.deck === key ? 'on' : ''} disabled={off}
            title={off ? 'Open a case to practise its areas.' : undefined}
            aria-label={`${DECK_LABEL[key]}, ${c?.due ?? 0} due of ${c?.total ?? 0}`} onClick={() => chooseDeck({deck: key})}>
            {DECK_LABEL[key]} <span className="kp-count">{c?.due ?? 0}</span></button>;
        })}
        <select aria-label="Any area" value={deck.deck === 'area' ? deck.area : ''} className={deck.deck === 'area' ? 'on' : ''}
          onChange={e => { if (e.target.value) chooseDeck({deck: 'area', area: e.target.value}); }}>
          <option value="">Any area…</option>
          {(areasQuery.data ?? []).filter(a => a.indicators > 0).map(a => {
            const c = counts?.areas.find(x => x.area === a.key);
            return <option key={a.key} value={a.key}>{a.key} · {shortAreaName(a.name)}{c ? ` (${c.due} due of ${c.total})` : ''}</option>;
          })}
        </select>
      </div>
      <label className="kp-four"><input type="checkbox" checked={four} onChange={e => { setFour(e.target.checked); writeFourAnswers(e.target.checked); }}/> Hard / Easy too</label>
      <button type="button" className="kc-btn ghost" onClick={onLeave}>Leave <kbd>Esc</kbd></button>
    </header>

    <section className="kc-panel kp" aria-label={`Practise: ${deckName(deck, areaNames)}`}>
      <p className="kc-eyebrow">{deckName(deck, areaNames)}{deck.deck === 'case' && caseAreas.length ? ` · ${caseAreas.join(', ')}` : ''}
        {card ? ` · card ${at + 1} of ${queue.cards.length}` : ''}{answered ? ` · ${answered} answered` : ''}{anyway ? ' · practising anyway' : ''}</p>
      {list.isError && <p className="kc-error" role="alert">{errorMessage(list.error, 'Could not load the cards')}</p>}
      {loading && !list.isError && <div className="kc-skeleton tall" aria-hidden="true"/>}
      {!loading && !list.isError && !card && (total === 0
        ? <div className="kp-state" role="status">
            <p className="kp-state-line">Open a term and press <b>＋ Flip card</b>.</p>
            <p className="kc-quiet">{deck.deck === 'case' && !caseAreas.length ? 'This case has no areas yet: its type or its Red Flags give it some.'
              : 'A card comes from an indicator page or a term in the glossary.'}</p>
            <p className="kp-state-actions"><button type="button" className="kc-btn" onClick={onLeave}>Open the catalogue</button>{' '}
              <Link className="kc-btn ghost" href="/glossary">Open the glossary</Link></p>
          </div>
        : <div className="kp-state" role="status">
            <p className="kp-state-line">{answered ? `${answered} answered. ` : ''}Nothing due.{list.data?.next_due_at ? ` Next ${untilWords(list.data.next_due_at)}` : ''}
              {' · '}<button type="button" className="kp-link" onClick={() => { setAnyway(true); setRound(r => r + 1); }}>Practise anyway</button></p>
            <p className="kc-quiet">{shown?.total ?? total} {(shown?.total ?? total) === 1 ? 'card' : 'cards'} in this deck.</p>
          </div>)}
      {card && <div className="kc-card-stage kp-stage">
        {/* The card is a group, not a button, so both sides are read, front then back; Space or a click turns it. */}
        <div ref={cardRef} tabIndex={0} role="group" aria-roledescription="flip card" className={`kc-flip kp-card${flipped ? ' flipped' : ''}`}
          onClick={() => setFlipped(v => !v)} aria-label={flipped ? `${card.name}, turned` : `Card ${at + 1} of ${queue.cards.length}`}>
          <CardFaces card={card} flipped={flipped}/>
        </div>
        {!flipped
          ? <div className="kc-card-nav"><button type="button" className="kc-btn primary" onClick={() => setFlipped(true)}>Turn the card <kbd>Space</kbd></button></div>
          : <div className="kp-answers" role="group" aria-label="How well did you know it?">
              {answers.map((a, i) => <button type="button" key={a} className={`kc-btn kp-answer ${a}`} disabled={answer.isPending} onClick={() => void give(a)}
                aria-label={`${ANSWER_LABEL[a]}, back ${intervalWords(card.next_days[a]) === 'now' ? 'in this sitting' : `in ${intervalWords(card.next_days[a])}`}, key ${i + 1}`}>
                <kbd>{i + 1}</kbd> {ANSWER_LABEL[a]} <span className="kp-when">{intervalWords(card.next_days[a]) === 'now' ? 'now' : intervalWords(card.next_days[a])}</span>
              </button>)}
            </div>}
        {answer.isError && <p className="kc-error" role="alert">{errorMessage(answer.error, 'Could not keep the answer')}</p>}
        <p className="kc-small kp-keys">Space turns · {answers.length === 4 ? '1–4' : '1 / 2'} answer · Esc leaves</p>
      </div>}
    </section>
  </>;
}

/** The two sides, read in order: the front (the sign as a scene, or a term's meaning), then the back once turned. */
function CardFaces({card, flipped}: {card: LearningCardOut; flipped: boolean}): ReactElement {
  return card.kind === 'indicator' ? <IndicatorFaces card={card} flipped={flipped}/> : <TermFaces card={card} flipped={flipped}/>;
}

function IndicatorFaces({card, flipped}: {card: LearningCardOut; flipped: boolean}): ReactElement {
  const query = useQuery({...getIndicatorOptions({path: {indicator_id: card.ref}}), staleTime: Infinity});
  const ind = query.data;
  const levels = ind?.levels as unknown as Record<string, string> | undefined;
  const source = ind?.sources[0];
  return <>
    <span className="kc-face front" aria-hidden={flipped}>
      <span className="kc-eyebrow">Which sign is this?{card.reviews === 0 ? ' · new' : ''}</span>
      <span className="kc-card-text">{ind ? firstSentence(ind.definition) : query.isError ? 'Could not load the sign.' : '…'}</span>
      <span className="kc-small">Space to turn</span>
    </span>
    <span className="kc-face back kp-back" aria-hidden={!flipped}>
      <span className="kc-eyebrow">{card.ref}{ind ? ` · ${shortAreaName(ind.area_name)}` : ''}</span>
      <span className="kc-ind-name">{card.name}</span>
      {levels && <span className="kp-levels" role="list" aria-label="Levels">
        {STEPS.map(step => {
          const text = levels[step] ?? '';
          const unset = !text || UNSET_LEVEL.test(text);
          return <span role="listitem" key={step} className={`kp-level${unset ? ' unset' : ''}`}><LevelMark level={step}/> {unset ? 'not set' : text}</span>;
        })}
      </span>}
      {ind && <><span className="kc-eyebrow kp-innocent">✓ Could be innocent</span>
        <span className="kc-card-list">{ind.innocent_explanations.slice(0, 4).map((t, i) => <span key={i}>· {t}</span>)}</span></>}
      {source && <span className="kc-small kp-source">{source.publisher} {source.year ?? ''}{source.locator ? ` · ${source.locator}` : ''}
        {' · '}{source.quote_verified ? '✓ quote confirmed' : <span className="kc-dashed">○ not yet confirmed</span>}</span>}
    </span>
  </>;
}

function TermFaces({card, flipped}: {card: LearningCardOut; flipped: boolean}): ReactElement {
  const query = useQuery({...getGlossaryEntryOptions({query: {term: card.ref}}), staleTime: Infinity});
  const term = query.data;
  return <>
    <span className="kc-face front" aria-hidden={flipped}>
      <span className="kc-eyebrow">Which term is this?{card.reviews === 0 ? ' · new' : ''}</span>
      <span className="kc-card-text">{term ? term.definition : query.isError ? 'Could not load the term.' : '…'}</span>
      <span className="kc-small">Space to turn</span>
    </span>
    <span className="kc-face back kp-back" aria-hidden={!flipped}>
      <span className="kc-eyebrow">Term · {card.areas.join(', ')}</span>
      <span className="kc-ind-name">{card.name}</span>
      {term && term.examples.length > 0 && <span className="kc-card-list">{term.examples.slice(0, 3).map((t, i) => <span key={i}>· {t}</span>)}</span>}
      {term?.source_url && <span className="kc-small kp-source">Source: {hostOf(term.source_url)}</span>}
    </span>
  </>;
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
