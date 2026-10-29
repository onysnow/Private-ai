'use client';
// Decks (mockups DECK_1 and DECK_2; research §9; DECISIONS_LOG 13): a deck made from the story tree or blank, edited
// slide by slide at the largest 16:9 that fits, its speaker notes under it, the filmstrip on the bottom edge with a
// check badge per slide (✓, the number of problems, or Δ changed since made), and the right panel with the slide's
// words and its checks, each with a one-click fix. A slide citing a claim not yet shown carries a Draft band. Present
// opens the presenter view: the slide now, its notes, the next slide, a timer against the planned length and "If they
// ask" (the claims behind the slide), after a bar that names any draft or changed slide (warned, never blocked).
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useMemo, useState} from 'react';
import type {ReactElement} from 'react';

import {SlideCanvas, SlideStyleProvider, buildCitationLookup, resolveTheme} from '../../components/presentation/slide-canvas';
import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import type {CitationDetail, DeckSlide, DeckStyle} from '../../lib/api-types';
import {deckChecksEndpointOptions, deckChecksEndpointQueryKey, listClaimsOptions, listDecksEndpointOptions,
  listDecksEndpointQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {createDeckEndpoint, updateDeckEndpoint} from '../../lib/generated/sdk.gen';
import type {DeckChecksOut, DeckOut, SlideProblemOut} from '../../lib/generated/types.gen';

type Slide = DeckSlide & {made_with?: Record<string, string>};
type Kind = 'presenting' | 'slidedoc' | 'side';
const MAX_WORDS = 7;

/** One fix, applied to the slide as the check names it. Returns the slide unchanged when the fix does not apply. */
export function applyFix(slide: Slide, problem: SlideProblemOut, statusOf: (claimId: string) => string | undefined): Slide {
  const bullets = [...slide.bullets];
  const notes = slide.notes ?? '';
  const more = (text: string) => (notes ? `${notes}\n${text}` : text);
  if (problem.fix === 'words_to_notes' && problem.line) {
    const line = bullets[problem.line - 1] ?? '';
    const words = line.split(/\s+/).filter(Boolean);
    bullets[problem.line - 1] = `${words.slice(0, MAX_WORDS).join(' ')}…`;
    return {...slide, bullets, notes: more(line)};
  }
  if (problem.fix === 'lines_to_notes') return {...slide, bullets: bullets.slice(0, 7), notes: more(bullets.slice(7).join('\n'))};
  if (problem.fix === 'accept_change' && problem.claim_id) {
    const now = statusOf(problem.claim_id);
    return now ? {...slide, made_with: {...(slide.made_with ?? {}), [problem.claim_id]: now}} : slide;
  }
  if (problem.fix === 'remove_citation' && problem.claim_id) {
    return {...slide, evidence: slide.evidence.filter(r => !(r.record_type === 'claim' && r.record_id === problem.claim_id))};
  }
  return slide;
}

function badge(check: DeckChecksOut['slides'][number] | undefined): {text: string; tone: string; label: string} {
  if (!check) return {text: '·', tone: '', label: 'not checked yet'};
  if (check.changed) return {text: 'Δ', tone: 'changed', label: 'changed since made'};
  if (check.problems.length) return {text: String(check.problems.length), tone: 'warn', label: `${check.problems.length} to look at`};
  return {text: '✓', tone: 'ok', label: 'no problem found'};
}

export function DecksScreen({investigationId}: {investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const decks = useQuery({...listDecksEndpointOptions({path: {investigation_id: investigationId}})});
  const [picked, setPicked] = useState<string | null>(null);
  const list = decks.data?.decks ?? [];
  const deck = list.find(d => d.id === picked) ?? list[0] ?? null;
  const [message, setMessage] = useState('');
  const make = useMutation({
    mutationFn: async (source: 'story' | 'blank') =>
      (await createDeckEndpoint({path: {investigation_id: investigationId}, body: {source, title: ''}, throwOnError: true})).data,
    onSuccess: async row => { setPicked(row.id); setMessage(''); await queryClient.invalidateQueries({queryKey: listDecksEndpointQueryKey({path: {investigation_id: investigationId}})}); },
    onError: error => setMessage(errorMessage(error, 'Could not make the deck')),
  });
  return <div className="dk">
    <header className="dk-top">
      <h2>Decks</h2>
      {list.length > 1 && <select aria-label="Deck" value={deck?.id ?? ''} onChange={e => setPicked(e.target.value)}>
        {list.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select>}
      <button type="button" className="dk-btn" onClick={() => make.mutate('story')} disabled={make.isPending}>New deck from the story</button>
      <button type="button" className="dk-btn plain" onClick={() => make.mutate('blank')} disabled={make.isPending}>Blank deck</button>
    </header>
    {message && <p className="dk-note" role="alert">{message}</p>}
    {decks.isSuccess && !deck ? <p className="dk-note">No deck yet. A deck made from the story has a slide for each part of the story tree, its claims cited; a claim not yet shown makes its slide a draft.</p>
      : deck ? <DeckEditor key={deck.id} deck={deck} investigationId={investigationId}/> : <p className="dk-note">Loading…</p>}
  </div>;
}

function DeckEditor({deck, investigationId}: {deck: DeckOut; investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const [slides, setSlides] = useState<Slide[]>(deck.slides as unknown as Slide[]);
  const [title, setTitle] = useState(deck.title);
  const [at, setAt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [kind, setKind] = useState<Kind>('presenting');
  const [presenting, setPresenting] = useState(false);
  const [message, setMessage] = useState('');
  const checks = useQuery({...deckChecksEndpointOptions({path: {deck_id: deck.id}})});
  const claims = useQuery({...listClaimsOptions({path: {investigation_id: investigationId}})});
  const claimById = useMemo(() => new Map((claims.data ?? []).map(c => [c.id, c])), [claims.data]);
  // The slides cite claims: each is named on the slide by its own words and status.
  const details = useMemo<CitationDetail[]>(() => (claims.data ?? []).map(c => ({record_type: 'claim', record_id: c.id, trace_record_type: 'claim',
    type_label: 'Claim', label: c.text, quote: null, locator: null, source_title: null, source_url: null, detail: c.status, missing: false})), [claims.data]);
  const lookup = useMemo(() => buildCitationLookup(slides, details), [slides, details]);
  const theme = resolveTheme(null, deck.style as unknown as DeckStyle);
  const slide = slides[at];
  const check = checks.data?.slides[at];
  const contentTotal = slides.filter(s => (s.kind ?? 'content') === 'content').length;

  const save = useMutation({
    mutationFn: async () => (await updateDeckEndpoint({path: {deck_id: deck.id}, throwOnError: true,
      body: {title, slides_json: slides as never}})).data,
    onSuccess: async () => {
      setDirty(false); setMessage('Saved');
      await queryClient.invalidateQueries({queryKey: deckChecksEndpointQueryKey({path: {deck_id: deck.id}})});
      await queryClient.invalidateQueries({queryKey: listDecksEndpointQueryKey({path: {investigation_id: investigationId}})});
    },
    onError: error => setMessage(errorMessage(error, 'Could not save the deck')),
  });
  const change = (next: Slide) => { setSlides(all => all.map((s, i) => (i === at ? next : s))); setDirty(true); setMessage(''); };
  const addSlide = () => { setSlides(all => [...all.slice(0, at + 1), {kind: 'content', heading: 'New slide', bullets: [], evidence: [], notes: ''}, ...all.slice(at + 1)]); setAt(at + 1); setDirty(true); };
  const removeSlide = () => { if (slides.length < 2) return; setSlides(all => all.filter((_, i) => i !== at)); setAt(Math.max(0, at - 1)); setDirty(true); };
  const exportPptx = async () => {
    const href = URL.createObjectURL(await api.blob(`/api/decks/${deck.id}/export.pptx`));
    const a = document.createElement('a'); a.href = href; a.download = `${title || 'deck'}.pptx`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (presenting || ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLSelectElement) return;
      if (ev.key === 'j' || ev.key === 'ArrowRight') setAt(n => Math.min(slides.length - 1, n + 1));
      if (ev.key === 'k' || ev.key === 'ArrowLeft') setAt(n => Math.max(0, n - 1));
      if (ev.key === 'p') setPresenting(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenting, slides.length]);

  if (!slide) return <p className="dk-note">This deck has no slides.</p>;
  const contentIndex = (n: number) => slides.slice(0, n + 1).filter(s => (s.kind ?? 'content') === 'content').length;
  const canvas = (s: Slide, n: number) => <SlideCanvas slide={s} page={n + 1} contentIndex={contentIndex(n)} contentTotal={contentTotal} deckTitle={title} lookup={lookup} sourceCount={lookup.numbers.size}/>;
  const slidedoc = <article className="dk-doc" aria-label="As a slidedoc"><h3>{slide.heading}</h3>{slide.bullets.map((b, i) => <p key={i}>{b}</p>)}
    {slide.notes && <p className="dk-doc-notes">{slide.notes}</p>}</article>;

  return <SlideStyleProvider theme={theme}><div className="dk-body">
    <div className="dk-bar">
      <input className="dk-title" aria-label="Deck title" value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }}/>
      <span className="dk-kinds" role="radiogroup" aria-label="Deck kind">{(['presenting', 'slidedoc', 'side'] as Kind[]).map(k =>
        <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>{k === 'presenting' ? 'Presenting' : k === 'slidedoc' ? 'Slidedoc' : 'Side by side'}</button>)}</span>
      <button type="button" className="dk-btn plain" onClick={() => void exportPptx()}>Export .pptx</button>
      <button type="button" className="dk-btn" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>{save.isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button>
      <button type="button" className="dk-btn pri" onClick={() => setPresenting(true)}>Present <kbd>P</kbd></button>
      {message && <span className="dk-msg" role="status">{message}</span>}
    </div>

    <section className="dk-stage" aria-label={`Slide ${at + 1} of ${slides.length}`}>
      <div className={`dk-canvas${kind === 'side' ? ' side' : ''}`}>
        {kind !== 'slidedoc' && <div className="dk-slide">{canvas(slide, at)}{check?.draft && <span className="dk-draft" aria-label="Draft: cites a claim not yet shown">Draft</span>}</div>}
        {kind !== 'presenting' && slidedoc}
      </div>
      <label className="dk-notes">Speaker notes<textarea value={slide.notes ?? ''} rows={3} onChange={e => change({...slide, notes: e.target.value})}/></label>
    </section>

    <aside className="dk-side" aria-label="This slide">
      <p className="dk-cap">Slide {at + 1} · {slide.kind ?? 'content'}</p>
      <label className="dk-field">Heading<input value={slide.heading} onChange={e => change({...slide, heading: e.target.value})}/></label>
      <label className="dk-field">Lines, one per line<textarea rows={5} value={slide.bullets.join('\n')}
        onChange={e => change({...slide, bullets: e.target.value.split('\n')})}/></label>
      <p className="dk-cap">Claims on it</p>
      <ul className="dk-claims">{slide.evidence.filter(r => r.record_type === 'claim').map(r => { const c = claimById.get(r.record_id);
        return <li key={r.record_id} className={c && (c.status === 'supported' || c.status === 'confirmed') ? 'shown' : 'unshown'}>
          <b>{c ? (c.status === 'supported' || c.status === 'confirmed' ? 'shown' : c.status === 'disputed' ? 'disputed' : 'not yet shown') : 'gone'}</b>{c?.text ?? r.record_id}</li>; })}
        {!slide.evidence.some(r => r.record_type === 'claim') && <li className="dk-none">No claim cited.</li>}</ul>
      <p className="dk-cap">Checks</p>
      <ul className="dk-checks">{(check?.problems ?? []).map((p, i) => <li key={i} className={p.kind}>
        <span>{p.text}</span>{p.fix && <button type="button" className="dk-btn sm" onClick={() => change(applyFix(slide, p, id => claimById.get(id)?.status))}>
          {p.fix === 'words_to_notes' ? 'Move the rest to notes' : p.fix === 'lines_to_notes' ? 'Move extra lines to notes' : p.fix === 'accept_change' ? 'I have read the change' : 'Remove the citation'}</button>}</li>)}
        {check && !check.problems.length && <li className="ok">✓ Nothing to look at on this slide.</li>}
        {dirty && <li className="dk-none">Save to check again.</li>}</ul>
      <div className="dk-row"><button type="button" className="dk-btn sm" onClick={addSlide}>Add a slide after</button>
        <button type="button" className="dk-btn sm plain" onClick={removeSlide} disabled={slides.length < 2}>Remove this slide</button></div>
    </aside>

    <nav className="dk-strip" aria-label="Slides">{slides.map((s, i) => { const b = badge(checks.data?.slides[i]);
      return <button key={i} type="button" aria-current={i === at ? 'true' : undefined} onClick={() => setAt(i)} aria-label={`Slide ${i + 1}: ${s.heading}, ${b.label}`}>
        <span className="dk-n">{i + 1}</span><span className="dk-h">{s.heading}</span><span className={`dk-badge ${b.tone}`}>{b.text}</span></button>; })}</nav>
    {presenting && <Present slides={slides} checks={checks.data} title={title} canvas={canvas} claimText={id => claimById.get(id)} onClose={() => setPresenting(false)} start={at}/>}
  </div></SlideStyleProvider>;
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function Present({slides, checks, title, canvas, claimText, onClose, start}: {slides: Slide[]; checks: DeckChecksOut | undefined; title: string;
  canvas: (s: Slide, n: number) => ReactElement; claimText: (id: string) => {text: string; status: string} | undefined; onClose: () => void; start: number}): ReactElement {
  const flagged = [...new Set([...(checks?.drafts ?? []), ...(checks?.changed ?? [])])].sort((a, b) => a - b);
  const [ready, setReady] = useState(flagged.length === 0);
  const [at, setAt] = useState(start);
  const [audience, setAudience] = useState(false);
  const [planned, setPlanned] = useState(10);
  const [began, setBegan] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [asked, setAsked] = useState(false);
  useEffect(() => { if (ready && began === null) setBegan(Date.now()); }, [ready, began]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement) return;
      if (ev.key === 'Escape') onClose();
      if (!ready) return;
      if (ev.key === 'ArrowRight' || ev.key === ' ' || ev.key === 'PageDown') setAt(n => Math.min(slides.length - 1, n + 1));
      if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') setAt(n => Math.max(0, n - 1));
      if (ev.key === 's' || ev.key === 'S') setAudience(a => !a);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, ready, slides.length]);
  const elapsed = began ? (now - began) / 1000 : 0;
  const slide = slides[at];
  const sources = slide.evidence.filter(r => r.record_type === 'claim').map(r => ({id: r.record_id, claim: claimText(r.record_id)}));
  return <div className="dk-present" role="dialog" aria-modal="true" aria-label={`Presenting ${title}`}>
    {!ready ? <div className="dk-before" role="alert">
      <h3>Before you present</h3>
      <ul>{flagged.map(n => <li key={n}>Slide {n}: {(checks?.changed ?? []).includes(n) ? 'a claim on it changed since the deck was made' : 'cites a claim not yet shown (Draft)'} · {slides[n - 1]?.heading}</li>)}</ul>
      <p>Presenting is not blocked. Each of these slides keeps its Draft band.</p>
      <div className="dk-row"><button type="button" className="dk-btn pri" onClick={() => setReady(true)}>Present anyway</button>
        <button type="button" className="dk-btn plain" onClick={onClose}>Back to the editor</button></div>
    </div> : audience ? <div className="dk-audience" onClick={() => setAt(n => Math.min(slides.length - 1, n + 1))}>{canvas(slide, at)}</div> : <div className="dk-presenter">
      <div className="dk-now">{canvas(slide, at)}{checks?.slides[at]?.draft && <span className="dk-draft">Draft</span>}</div>
      <aside>
        <p className="dk-cap">Slide {at + 1} of {slides.length} · <span className={elapsed > planned * 60 ? 'dk-over' : ''}>{clock(elapsed)}</span> of
          <input aria-label="Planned minutes" type="number" min={1} max={180} value={planned} onChange={e => setPlanned(Math.max(1, Number(e.target.value) || 1))}/> min</p>
        <div className="dk-pnotes"><p className="dk-cap">Notes</p><p>{slide.notes || 'No notes for this slide.'}</p></div>
        {at + 1 < slides.length && <div className="dk-next"><p className="dk-cap">Next</p>{canvas(slides[at + 1], at + 1)}</div>}
        <details className="dk-ask" open={asked} onToggle={e => setAsked((e.target as HTMLDetailsElement).open)}>
          <summary>If they ask · {sources.length} {sources.length === 1 ? 'claim' : 'claims'} behind this slide</summary>
          <ul>{sources.map(s => <li key={s.id}><b>{s.claim?.status ?? 'gone'}</b> {s.claim?.text ?? s.id}</li>)}</ul></details>
        <p className="dk-keys">← → slides · S audience view · Esc ends</p>
      </aside>
    </div>}
  </div>;
}
