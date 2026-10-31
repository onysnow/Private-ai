'use client';
// Decks (mockups DECK_1 and DECK_2; research §9; DECISIONS_LOG 13): a deck made from the story tree or blank, edited
// slide by slide at the largest 16:9 that fits, its speaker notes under it, the filmstrip on the bottom edge with a
// check badge per slide (✓, the number of problems, or Δ changed since made), and the right panel with the slide's
// words and its checks, each with a one-click fix. A slide citing a claim not yet shown carries a Draft band. Present
// opens the presenter view: the slide now, its notes, the next slide, a timer against the planned length and "If they
// ask" (the claims behind the slide), after a bar that names any draft or changed slide (warned, never blocked).
// Style opens the deck's themes and fonts in the right panel; Export gives the .pptx, the slides as a PDF, or a handout
// (a PDF page per slide with its notes), saving first so the file is what is on screen (DECISIONS_LOG 15).
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement} from 'react';

import {SlideCanvas, SlideStyleProvider, buildCitationLookup, resolveTheme} from '../../components/presentation/slide-canvas';
import {StatusChip} from '../../components/status';
import type {ClaimStatus} from '../../components/status';
import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import type {CitationDetail, DeckSlide, DeckStyle, PresentationStyleCatalog} from '../../lib/api-types';
import {deckChecksEndpointOptions, deckChecksEndpointQueryKey, getStoryOptions, listClaimsOptions, listDecksEndpointOptions,
  listDecksEndpointQueryKey, presentationStylesOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {createDeckEndpoint, updateDeckEndpoint} from '../../lib/generated/sdk.gen';
import type {DeckChecksOut, DeckOut, SlideProblemOut, StoryOut} from '../../lib/generated/types.gen';
import {onScreen, typingInto} from '../../lib/on-screen';

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

/** A claim's status in the app's status grammar (colour by default, the word on reveal). */
function claimStatus(status: string): ClaimStatus {
  return status === 'supported' || status === 'confirmed' ? 'supported' : status === 'disputed' ? 'disputed' : status === 'ruled_out' || status === 'refuted' ? 'ruled_out' : 'unshown';
}

function badge(check: DeckChecksOut['slides'][number] | undefined): {text: string; tone: string; label: string} {
  if (!check) return {text: '·', tone: '', label: 'not checked yet'};
  if (check.changed) return {text: 'Δ', tone: 'changed', label: 'changed since made'};
  if (check.problems.length) return {text: String(check.problems.length), tone: 'warn', label: `${check.problems.length} to look at`};
  return {text: '✓', tone: 'ok', label: 'no problem found'};
}

export function DecksScreen({investigationId}: {investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const decks = useQuery({...listDecksEndpointOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const story = useQuery({...getStoryOptions({path: {investigation_id: investigationId}}), retry: false, enabled: Boolean(investigationId)}).data as StoryOut | undefined;
  const [picked, setPicked] = useState<string | null>(null);
  const list = decks.data?.decks ?? [];
  const deck = list.find(d => d.id === picked) ?? list[0] ?? null;
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const make = useMutation({
    mutationFn: async (source: 'story' | 'blank') =>
      (await createDeckEndpoint({path: {investigation_id: investigationId}, body: {source, title: ''}, throwOnError: true})).data,
    onSuccess: async row => { setPicked(row.id); setMessage(''); setAdding(false); await queryClient.invalidateQueries({queryKey: listDecksEndpointQueryKey({path: {investigation_id: investigationId}})}); },
    onError: error => setMessage(errorMessage(error, 'Could not make the deck')),
  });
  // A deck open: picking another deck and starting a new one sit in the editor's bar, so the slide gets the height.
  const more = <>
    {list.length > 1 && <select className="dk-pick" aria-label="Deck" value={deck?.id ?? ''} onChange={e => setPicked(e.target.value)}>
      {list.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select>}
    <span className="dk-export">
      <button type="button" className="dk-btn plain" aria-expanded={adding} onClick={() => setAdding(o => !o)}>New deck ▾</button>
      {adding && <span className="dk-menu" role="menu">
        <button type="button" role="menuitem" disabled={make.isPending} onClick={() => make.mutate('story')}>New deck from the story</button>
        <button type="button" role="menuitem" disabled={make.isPending} onClick={() => make.mutate('blank')}>Blank deck</button>
      </span>}
    </span>
  </>;
  return <div className="dk">
    {message && <p className="dk-note" role="alert">{message}</p>}
    {decks.isSuccess && !deck ? <NoDeck story={story} busy={make.isPending} onMake={source => make.mutate(source)}/>
      : deck ? <DeckEditor key={deck.id} deck={deck} investigationId={investigationId} story={story} more={more}/> : <p className="dk-note">Loading…</p>}
  </div>;
}

/** No deck yet: what a deck from the story would hold, drawn as its slides, and the two ways to start. */
function NoDeck({story, busy, onMake}: {story: StoryOut | undefined; busy: boolean; onMake: (source: 'story' | 'blank') => void}): ReactElement {
  const sections = story?.sections ?? [];
  const claims = sections.reduce((n, s) => n + s.total, 0);
  const drafts = sections.filter(s => s.shown < s.total).length;
  const thesis = story?.thesis?.trim();
  return <section className="dk-empty" aria-label="No deck yet">
    <h2>Decks</h2>
    <div className="dk-empty-grid">
      <button type="button" className="dk-start story" onClick={() => onMake('story')} disabled={busy || !sections.length}
        aria-label={`New deck from the story: ${sections.length + 1} slides`}>
        <span className="dk-start-head"><span className="dk-start-mark" aria-hidden="true">❖</span>
          <b>New deck from the story</b>
          <Reveal tabbable={false} detail={sections.length ? 'A title slide, then a slide for each part of the story tree with its claims cited. A slide citing a claim not yet shown carries a Draft band. Edits stay in the deck; the story is not changed.'
            : 'The story has no parts yet: build it in Act › Story first.'}><span className="dk-q">?</span></Reveal></span>
        <span className="dk-preview" aria-hidden="true">
          <span className="dk-ghost cover"><i>{thesis || 'Title'}</i></span>
          {sections.map(s => <span key={s.id} className={`dk-ghost${s.shown < s.total ? ' draft' : ''}`}>
            <i>{s.title}</i><em>{Array.from({length: Math.min(s.total, 7)}, (_, i) => <u key={i}/>)}</em>
            <small>{s.total}</small></span>)}
        </span>
        <span className="dk-start-nums">
          <span><b>{sections.length ? sections.length + 1 : 0}</b> slides</span>
          <span><b>{claims}</b> claims cited</span>
          {drafts > 0 && <span className="warn"><b>{drafts}</b> {drafts === 1 ? 'draft' : 'drafts'}</span>}
        </span>
      </button>
      <button type="button" className="dk-start blank" onClick={() => onMake('blank')} disabled={busy}>
        <span className="dk-start-head"><span className="dk-start-mark" aria-hidden="true">＋</span><b>Blank deck</b>
          <Reveal tabbable={false} detail="A title slide only: add slides and cite claims yourself."><span className="dk-q">?</span></Reveal></span>
        <span className="dk-preview" aria-hidden="true"><span className="dk-ghost cover"><i>Title</i></span><span className="dk-ghost empty"/></span>
      </button>
    </div>
  </section>;
}

/** Each 7×7 line problem is one fix; several are shown as one check whose button moves each line's rest to the notes. */
function groupedProblems(problems: SlideProblemOut[]): Array<{text: string; detail?: string; kind: string; fixes: SlideProblemOut[]}> {
  const lines = problems.filter(p => p.fix === 'words_to_notes');
  const out: Array<{text: string; detail?: string; kind: string; fixes: SlideProblemOut[]}> = [];
  let grouped = false;
  for (const p of problems) {
    if (p.fix === 'words_to_notes' && lines.length > 1) {
      if (!grouped) out.push({kind: '7x7', text: `${lines.length} lines over ${MAX_WORDS} words`, detail: `7×7: at most about ${MAX_WORDS} words a line; the rest of each goes to the notes. ${lines.map(l => l.text.split(':')[0]).join(' · ')}`, fixes: lines});
      grouped = true;
      continue;
    }
    const cut = p.text.indexOf(': ');
    out.push({kind: p.kind, text: cut > 0 ? p.text.slice(0, cut) : p.text, detail: cut > 0 ? p.text.slice(cut + 2) : undefined, fixes: p.fix ? [p] : []});
  }
  return out;
}

function fixLabel(fixes: SlideProblemOut[]): string {
  const fix = fixes[0]?.fix;
  if (fix === 'words_to_notes') return fixes.length > 1 ? 'Move the rest of each to notes' : 'Move the rest to notes';
  return fix === 'lines_to_notes' ? 'Move extra lines to notes' : fix === 'accept_change' ? 'I have read the change' : 'Remove the citation';
}

function DeckEditor({deck, investigationId, story, more}: {deck: DeckOut; investigationId: string; story: StoryOut | undefined; more: ReactElement}): ReactElement {
  const queryClient = useQueryClient();
  const [slides, setSlides] = useState<Slide[]>(deck.slides as unknown as Slide[]);
  const [title, setTitle] = useState(deck.title);
  const [at, setAt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [kind, setKind] = useState<Kind>('presenting');
  const [presenting, setPresenting] = useState(false);
  const [message, setMessage] = useState('');
  const [style, setStyle] = useState<DeckStyle>(deck.style as unknown as DeckStyle);
  const [panel, setPanel] = useState<'slide' | 'style'>('slide');
  const catalog = useQuery({...presentationStylesOptions()}).data as unknown as PresentationStyleCatalog | undefined;
  const checks = useQuery({...deckChecksEndpointOptions({path: {deck_id: deck.id}})});
  const claims = useQuery({...listClaimsOptions({path: {investigation_id: investigationId}})});
  const claimById = useMemo(() => new Map((claims.data ?? []).map(c => [c.id, c])), [claims.data]);
  // Where each claim comes from (its first supporting source in the story tree), and which story part a slide was made from.
  const sourceOf = useMemo(() => new Map((story?.sections ?? []).flatMap(s => s.claims.map(c => {
    const ev = c.evidence.find(e => e.stance === 'supports') ?? c.evidence[0];
    return [c.id, ev ? `${ev.label}${ev.locator ? ` · ${ev.locator}` : ''}` : ''] as const;
  }))), [story]);
  const sectionTitles = useMemo(() => new Set((story?.sections ?? []).map(s => s.title)), [story]);
  // The slides cite claims: each is named on the slide by its own words and status.
  const details = useMemo<CitationDetail[]>(() => (claims.data ?? []).map(c => ({record_type: 'claim', record_id: c.id, trace_record_type: 'claim',
    type_label: 'Claim', label: c.text, quote: null, locator: null, source_title: null, source_url: null, detail: c.status, missing: false})), [claims.data]);
  const lookup = useMemo(() => buildCitationLookup(slides, details), [slides, details]);
  const theme = resolveTheme(catalog, style);
  const slide = slides[at];
  const check = checks.data?.slides[at];
  const contentTotal = slides.filter(s => (s.kind ?? 'content') === 'content').length;
  const look = (checks.data?.slides ?? []).filter(c => c.problems.some(p => p.kind !== 'draft' && p.kind !== 'changed')).length;

  const save = useMutation({
    mutationFn: async () => (await updateDeckEndpoint({path: {deck_id: deck.id}, throwOnError: true,
      body: {title, slides_json: slides as never, style_json: style}})).data,
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
  // Exports read the saved deck, so unsaved changes are saved first.
  const download = async (path: string, name: string) => {
    try {
      if (dirty) await save.mutateAsync();
      const href = URL.createObjectURL(await api.blob(`/api/decks/${deck.id}/${path}`));
      const a = document.createElement('a'); a.href = href; a.download = name; a.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
    } catch (error) { setMessage(errorMessage(error, 'Could not export the deck')); }
  };
  const [exporting, setExporting] = useState(false);
  const restyle = (next: DeckStyle) => { setStyle(next); setDirty(true); setMessage(''); };

  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (presenting || ev.metaKey || ev.ctrlKey || ev.altKey || ev.defaultPrevented || typingInto(ev.target) || !onScreen(rootRef.current)) return;
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
  const cited = slide.evidence.filter(r => r.record_type === 'claim');
  const madeFrom = (slide.kind ?? 'content') === 'title' ? 'The deck’s title slide.'
    : sectionTitles.has(slide.heading) ? `Story tree · part “${slide.heading}”. Edits here stay in the deck; the story is not changed.` : 'Written in the deck.';
  const groups = groupedProblems(check?.problems ?? []);
  const applyAll = (fixes: SlideProblemOut[]) => {
    // Lines are fixed from the last up, so each fix still finds its line.
    const ordered = [...fixes].sort((a, b) => (b.line ?? 0) - (a.line ?? 0));
    change(ordered.reduce((s, p) => applyFix(s, p, id => claimById.get(id)?.status), slide));
  };

  return <SlideStyleProvider theme={theme}><div className="dk-body" ref={rootRef}>
    <div className="dk-bar">
      <input className="dk-title" aria-label="Deck title" value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }}/>
      <Reveal detail="Every slide re-checks against the case each time the deck is saved: a claim not yet shown, 7×7, a long run of text slides, a claim changed since the slide was made.">
        <span className="dk-sum"><i aria-hidden="true"/>{slides.length} slides
          {(checks.data?.drafts.length ?? 0) > 0 && <> · <span className="d">{checks.data?.drafts.length} draft</span></>}
          {look > 0 && <> · <span className="w">{look} to look at</span></>}
          {(checks.data?.changed.length ?? 0) > 0 && <> · <span className="d">{checks.data?.changed.length} changed since made</span></>}</span></Reveal>
      <span className="dk-kinds" role="radiogroup" aria-label="Deck kind">{(['presenting', 'slidedoc', 'side'] as Kind[]).map(k =>
        <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>{k === 'presenting' ? 'Presenting' : k === 'slidedoc' ? 'Slidedoc' : 'Side by side'}</button>)}</span>
      {more}
      <button type="button" className="dk-btn plain" aria-pressed={panel === 'style'} onClick={() => setPanel(p => (p === 'style' ? 'slide' : 'style'))}>Style</button>
      <span className="dk-export">
        <button type="button" className="dk-btn plain" aria-expanded={exporting} onClick={() => setExporting(o => !o)}>Export ▾</button>
        {exporting && <span className="dk-menu" role="menu">
          <Reveal tabbable={false} detail="Editable"><button type="button" role="menuitem" onClick={() => { setExporting(false); void download('export.pptx', `${title || 'deck'}.pptx`); }}>PowerPoint (.pptx)</button></Reveal>
          <Reveal tabbable={false} detail="One page a slide, on the theme’s paper"><button type="button" role="menuitem" onClick={() => { setExporting(false); void download('export.pdf', `${title || 'deck'}.pdf`); }}>PDF, the slides</button></Reveal>
          <Reveal tabbable={false} detail="Each slide with its notes"><button type="button" role="menuitem" onClick={() => { setExporting(false); void download('export.pdf?handout=true', `${title || 'deck'} handout.pdf`); }}>PDF handout</button></Reveal>
        </span>}
      </span>
      <button type="button" className="dk-btn" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>{save.isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button>
      <button type="button" className="dk-btn pri" onClick={() => setPresenting(true)}>Present <kbd aria-hidden="true">P</kbd></button>
      <Reveal label="Keys" detail={<><kbd>J</kbd><kbd>K</kbd> or <kbd>←</kbd><kbd>→</kbd> slides · <kbd>P</kbd> present</>}><span className="dk-q" aria-hidden="true">?</span></Reveal>
      {message && <span className="dk-msg" role="status">{message}</span>}
    </div>

    <section className="dk-stage" aria-label={`Slide ${at + 1} of ${slides.length}`}>
      <div className={`dk-canvas${kind === 'side' ? ' side' : ''}`}>
        {kind !== 'slidedoc' && <div className="dk-slide">{canvas(slide, at)}{check?.draft && <span className="dk-draft" aria-label="Draft: cites a claim not yet shown"><span>Draft</span></span>}</div>}
        {kind !== 'presenting' && slidedoc}
      </div>
      <label className="dk-notes"><span>Speaker notes</span><textarea value={slide.notes ?? ''} rows={1} placeholder="What to say on this slide" onChange={e => change({...slide, notes: e.target.value})}/></label>
    </section>

    {panel === 'style' ? <DeckStylePanel catalog={catalog} style={style} onChange={restyle} onClose={() => setPanel('slide')}/>
      : <aside className="dk-side" aria-label="This slide">
      <p className="dk-head"><Reveal detail={`A ${slide.kind ?? 'content'} slide`}><span className="dk-cap">Slide {at + 1} · {slide.heading}</span></Reveal>
        {check?.draft && <span className="dk-tag">Draft</span>}<span className="dk-jk" aria-hidden="true">J / K</span></p>
      <p className="dk-cap">Claims on this slide</p>
      <ul className="dk-claims">{cited.map(r => { const c = claimById.get(r.record_id); const from = sourceOf.get(r.record_id);
        return <li key={r.record_id}>{c ? <StatusChip status={claimStatus(c.status)} focusable/> : <b>gone</b>}
          <span><span className="dk-ctext" title={c?.text}>{c?.text ?? r.record_id}</span>{from && <Reveal tabbable={false} detail={from}><small>{from}</small></Reveal>}</span></li>; })}
        {!cited.length && <li className="dk-none">No claim cited.</li>}</ul>
      <p className="dk-cap">Checks</p>
      <ul className="dk-checks">{groups.map((g, i) => <li key={i} className={g.kind}>
        <span className="dk-mark" aria-hidden="true">!</span>
        <span className="dk-ck">{g.detail ? <Reveal detail={g.detail}><span>{g.text}</span></Reveal> : <span>{g.text}</span>}
          {g.fixes.length > 0 && <button type="button" className="dk-btn sm" onClick={() => applyAll(g.fixes)}>{fixLabel(g.fixes)}</button>}</span></li>)}
        {check && !check.problems.length && <li className="ok"><span className="dk-mark" aria-hidden="true">✓</span><span className="dk-ck">Nothing to look at on this slide.</span></li>}
        {dirty && <li className="dk-none">Save to check again.</li>}</ul>
      <p className="dk-cap">Made from</p>
      <p className="dk-from">{madeFrom}</p>
      <details className="dk-words">
        <summary>Edit the words</summary>
        <label className="dk-field">Heading<input value={slide.heading} onChange={e => change({...slide, heading: e.target.value})}/></label>
        <label className="dk-field">Lines, one per line<textarea rows={6} value={slide.bullets.join('\n')}
          onChange={e => change({...slide, bullets: e.target.value.split('\n')})}/></label>
      </details>
    </aside>}

    <div className="dk-films">
      <p className="dk-cap">Slides <span className="dk-row"><button type="button" className="dk-btn sm" onClick={addSlide}>+ Slide after this</button>
        <button type="button" className="dk-btn sm plain" onClick={removeSlide} disabled={slides.length < 2}>Remove this slide</button></span></p>
      <nav className="dk-strip" aria-label="Slides">{slides.map((s, i) => { const b = badge(checks.data?.slides[i]);
        return <button key={i} type="button" aria-current={i === at ? 'true' : undefined} onClick={() => setAt(i)} aria-label={`Slide ${i + 1}: ${s.heading}, ${b.label}`}>
          <span className="dk-thumb" aria-hidden="true" inert>{canvas(s, i)}</span>
          <span className="dk-n">{i + 1} · {s.heading}</span><span className={`dk-badge ${b.tone}`}>{b.text}</span></button>; })}</nav>
    </div>
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
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.defaultPrevented || typingInto(ev.target) || !onScreen(rootRef.current)) return;
      if (ev.key === 'Escape') { ev.preventDefault(); onClose(); return; }
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
  return <div className="dk-present" ref={rootRef} role="dialog" aria-modal="true" aria-label={`Presenting ${title}`}>
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
          <ul>{sources.map(s => <li key={s.id}>{s.claim ? <StatusChip status={claimStatus(s.claim.status)} focusable/> : <b>gone</b>} {s.claim?.text ?? s.id}</li>)}</ul></details>
        <p className="dk-keys"><Reveal label="Keys" detail={<><kbd>←</kbd><kbd>→</kbd> slides · <kbd>S</kbd> audience view · <kbd>Esc</kbd> ends</>}><span className="dk-q" aria-hidden="true">?</span></Reveal></p>
      </aside>
    </div>}
  </div>;
}

/** DECK_1's style panel: the deck's themes as cards with their colours, its fonts, and what a style never changes. */
function DeckStylePanel({catalog, style, onChange, onClose}: {catalog: PresentationStyleCatalog | undefined; style: DeckStyle;
  onChange: (style: DeckStyle) => void; onClose: () => void}): ReactElement {
  const chosen = catalog?.themes.find(t => t.id === style.theme)?.id ?? catalog?.defaults.theme;
  return <aside className="dk-side dk-style" aria-label="Style">
    <p className="dk-cap"><Reveal detail="The whole deck’s theme. Present and every export follow it."><span>Style</span></Reveal></p>
    {!catalog ? <p className="dk-none">Loading the themes…</p> : <>
      <div className="dk-themes" role="radiogroup" aria-label="Theme">{catalog.themes.map(t =>
        <button key={t.id} type="button" role="radio" aria-checked={chosen === t.id} onClick={() => onChange({...style, theme: t.id})}>
          <span><Reveal tabbable={false} detail={t.description}><b>{t.label}</b></Reveal></span>
          <span className="dk-swatches" aria-hidden="true">{[t.cover_bg, t.page, t.accent, t.alert].map((c, i) => <i key={i} style={{background: `#${c}`}}/>)}</span>
        </button>)}</div>
      <label className="dk-field">Fonts<select value={style.fonts} onChange={e => onChange({...style, fonts: e.target.value})}>
        {catalog.font_pairs.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
    </>}
    <p className="dk-cap"><Reveal detail="Every figure carries shown, estimated or alleged. A style cannot turn this off."><span>Words on figures: always</span></Reveal></p>
    <p className="dk-cap"><Reveal detail="The PDF and the handout use a light paper version of the theme."><span>Paper: light</span></Reveal></p>
    <div className="dk-row"><button type="button" className="dk-btn sm plain" onClick={onClose}>Close style</button></div>
  </aside>;
}
