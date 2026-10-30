'use client';
// The watchlist (ADR-0006, Wave C; backend app/services/watchlists.py): names the reporter wants to know about. Each is
// searched whenever a document of the investigation has been read, and on "Check now": in OpenAleph when it is set up,
// otherwise in the investigation's own read documents. Every document a name turns up in shows once, with the passage
// around it; the reporter opens it at that page, makes it a lead (linked to the document's source) or dismisses it.
// Nothing becomes a lead on its own.
//
// Laid out side by side rather than as full-width text (Ony, BACKLOG "Watchlist hits"): the watched names with how many
// documents each turned up and how many are new since the reporter last looked | that name's hits, one compact snippet
// each | the picked hit's passage, read in the reading face, with the document and page as a link into the reading
// room. Matches are marked with a low tint of the theme's accent and an underline, never a bright highlighter.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {ArrowUpRight, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, Globe, Mail, Plus, RefreshCw, X} from 'lucide-react';
import {useEffect, useState} from 'react';
import type {ReactElement} from 'react';
import {z} from 'zod';

import {Form, FormControl, FormField, FormItemBare, FormMessage, FormRootError} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {submitWith, useZodForm} from '../../lib/forms';
import {
  addWatchlistEntryMutation, checkWatchlistNowMutation, dismissHitMutation, getWatchlistOptions, getWatchlistQueryKey,
  listLeadsQueryKey, makeLeadFromHitMutation, removeWatchlistEntryMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {HighlightSegmentOut, WatchlistEntryOut, WatchlistHitOut, WatchlistOut} from '../../lib/generated/types.gen';
import {apiTime, timeWords} from '../../lib/timestamps';
import {DemoMark, isDemoDecided, useUndoPreDecided} from '../demo/pre-decided';
import {useWorkbenchStore} from '../../lib/workbench-store';

// What the reporter types to watch a name (backend WatchlistEntryCreate: query 1–512, note up to 2000). Other names are
// kept in the query as "Name (Other, Other)", which the backend searches as each of them.
const watchSchema = z.object({
  query: z.string().trim().min(1, 'Type a name or a search to watch.').max(400, 'Keep it under 400 characters.'),
  aliases: z.string().trim().max(100, 'Keep the other names under 100 characters.'),
  note: z.string().trim().max(2000, 'Keep the reason under 2,000 characters.'),
});
type WatchValues = z.infer<typeof watchSchema>;

const CHECK_STATE: Record<string, string> = {
  not_configured: 'OpenAleph is not set up here, so the name was not searched.',
  no_collection: 'No document of this investigation has been sent to OpenAleph yet.',
};
const SEARCHED_OK = new Set(['ok', 'local']);

/** The entry's last check in plain words. */
export function lastCheck(entry: WatchlistEntryOut): string {
  if (!entry.checked_at) return 'Not checked yet: it is searched when a document is next read, or on “Check now”.';
  const at = timeWords(entry.checked_at);
  if (entry.check_state === 'ok') return `Last checked ${at} in OpenAleph.`;
  if (entry.check_state === 'local') return `Last checked ${at} in this investigation's own read documents (OpenAleph could not be asked).`;
  return `Last checked ${at}: ${CHECK_STATE[entry.check_state ?? ''] ?? entry.check_detail ?? 'OpenAleph could not be asked.'}`;
}

/** A watched entry as its name and other names: "Low Taek Jho (Jho Low)" is Low Taek Jho, also Jho Low. */
export function splitAliases(query: string): {name: string; aliases: string[]} {
  const bracketed = /^([^()"]+?)\s*\(([^()"]+)\)$/.exec(query.trim());
  if (!bracketed) return {name: query, aliases: []};
  return {name: bracketed[1].trim(), aliases: bracketed[2].split(/[,;]/).map(a => a.trim()).filter(Boolean)};
}

/** What is sent: the name, with any other names in brackets. */
export function watchQuery(name: string, aliases: string): string {
  const others = aliases.split(/[,;]/).map(a => a.trim()).filter(Boolean);
  return others.length ? `${name.trim()} (${others.join(', ')})` : name.trim();
}

// The document's kind as a mark, named on hover (Ony, 29 Oct: types are marks).
const KINDS: [RegExp, string, typeof FileText][] = [
  [/\.(eml|msg|mbox)$/i, 'Email', Mail], [/\.(zip|7z|tar|gz|rar)$/i, 'Archive', FileArchive],
  [/\.(html?|warc|mhtml)$/i, 'Web page', Globe], [/\.(csv|xlsx?|ods|tsv)$/i, 'Spreadsheet', FileSpreadsheet],
  [/\.(png|jpe?g|gif|tiff?|webp|heic)$/i, 'Picture', FileImage], [/\.(mp3|wav|m4a|ogg|flac)$/i, 'Recording', FileAudio],
  [/\.(mp4|mov|webm|mkv)$/i, 'Video', FileVideo],
];
function DocMark({title}: {title: string}): ReactElement {
  const [, word, Icon] = KINDS.find(([test]) => test.test(title)) ?? [null, 'Document', FileText];
  return <Reveal label={word} detail={word} tabbable={false} className="wl-kind"><Icon size={15} aria-hidden="true"/></Reveal>;
}

/** The pieces cut to start shortly before the first match, so a two-line snippet shows the name, not what leads up to it. */
export function aroundMatch(pieces: HighlightSegmentOut[], lead = 60): HighlightSegmentOut[] {
  const first = pieces.findIndex(piece => piece.match);
  if (first < 0) return pieces;
  const before = pieces.slice(0, first).map(piece => piece.text).join('');
  if (before.length <= lead) return pieces;
  const cut = before.slice(-lead);
  const word = cut.indexOf(' ');
  return [{text: `… ${word >= 0 ? cut.slice(word + 1) : cut}`, match: false}, ...pieces.slice(first)];
}

function Passage({pieces, className}: {pieces: HighlightSegmentOut[]; className: string}): ReactElement {
  return <p className={className}>{pieces.map((piece, index) => piece.match
    ? <mark key={index} className="wl-mark">{piece.text}</mark>
    : <span key={index}>{piece.text}</span>)}</p>;
}

// When the reporter last looked at each name, in this browser only (a convenience: what counts as new to them).
const LOOK_KEY = (investigationId: string) => `wl-looked:${investigationId}`;
function readLooks(investigationId: string): Record<string, number> {
  try { return JSON.parse(window.localStorage.getItem(LOOK_KEY(investigationId)) ?? '{}') as Record<string, number>; } catch { return {}; }
}
function writeLook(investigationId: string, entryId: string): void {
  try {
    const looks = readLooks(investigationId);
    window.localStorage.setItem(LOOK_KEY(investigationId), JSON.stringify({...looks, [entryId]: Date.now()}));
  } catch { /* private window or blocked storage: nothing is marked as seen */ }
}

const isNew = (hit: WatchlistHitOut, since: number | undefined) => since === undefined || apiTime(hit.found_at).getTime() > since;
const pageWord = (hit: WatchlistHitOut) => (hit.page_number ? `p. ${hit.page_number}` : '');

export function Watchlist({investigationId}: {investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const path = {investigation_id: investigationId};
  const key = getWatchlistQueryKey({path});
  const form = useZodForm<WatchValues>(watchSchema, {defaultValues: {query: '', aliases: '', note: ''}, mode: 'onSubmit'});
  const typed = form.watch('query');
  const [status, setStatus] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedHit, setPickedHit] = useState<string | null>(null);
  const [scope, setScope] = useState<'open' | 'all' | null>(null);
  // The looks as they were when the screen opened: what was new stays marked while the reporter reads it.
  const [looks, setLooks] = useState<Record<string, number>>({});
  useEffect(() => { setLooks(readLooks(investigationId)); }, [investigationId]);

  const watchlist = useQuery({...getWatchlistOptions({path}), enabled: Boolean(investigationId)});
  const add = useMutation({...addWatchlistEntryMutation()});
  const check = useMutation({...checkWatchlistNowMutation()});
  const remove = useMutation({...removeWatchlistEntryMutation()});
  const lead = useMutation({...makeLeadFromHitMutation()});
  const dismiss = useMutation({...dismissHitMutation()});
  const busy = lead.isPending || dismiss.isPending;

  const keep = (reply: WatchlistOut) => queryClient.setQueryData(key, reply);
  const attempt = async (work: () => Promise<string>, failed: string) => {
    try { setStatus(await work()); } catch (error) { setStatus(errorMessage(error, failed)); }
  };

  // An empty name is refused under the field; a refused save stays in the form, under the field the server names.
  const submit = submitWith(form, async ({query, aliases, note}) => {
    const watched = watchQuery(query, aliases);
    keep(await add.mutateAsync({path, body: {query: watched, note: note || null}}));
    form.reset();
    setStatus(`Watching “${watched}”.`);
  }, 'Could not watch the name');
  const checkNow = () => attempt(async () => {
    const reply = await check.mutateAsync({path});
    keep(reply);
    return reply.new_hits ? `Found ${reply.new_hits} new document(s).` : 'Nothing new.';
  }, 'Could not check the watchlist');
  const stopWatching = (entry: WatchlistEntryOut) => attempt(async () => {
    keep(await remove.mutateAsync({path: {watch_id: entry.id}}));
    if (picked === entry.id) setPicked(null);
    return `Stopped watching “${entry.query}”.`;
  }, 'Could not stop watching the name');
  const makeLead = (hit: WatchlistHitOut) => attempt(async () => {
    const made = await lead.mutateAsync({path: {hit_id: hit.id}});
    await Promise.all([queryClient.invalidateQueries({queryKey: key}), queryClient.invalidateQueries({queryKey: listLeadsQueryKey({path})})]);
    return `“${made.title}” was added to leads.`;
  }, 'Could not make the lead');
  const dismissHit = (hit: WatchlistHitOut) => attempt(async () => {
    keep(await dismiss.mutateAsync({path: {hit_id: hit.id}}));
    return `Dismissed ${hit.title}.`;
  }, 'Could not dismiss it');

  // A hit the demo dismissed ahead carries its mark, and Undo puts it back to decide.
  const undoDemo = useUndoPreDecided(investigationId);
  const undoDemoHit = (hit: WatchlistHitOut) => attempt(async () => {
    await undoDemo.run({kind: 'watchlist', id: hit.id});
    return `${hit.title} is back to decide.`;
  }, 'Could not undo the demo’s decision');

  const entries = watchlist.data?.entries ?? [];
  const toDecide = (entry: WatchlistEntryOut) => entry.hits.filter(hit => hit.status === 'new');
  // The picked name: the reporter's, else the first with hits to decide, else the first.
  const entry = entries.find(e => e.id === picked) ?? entries.find(e => toDecide(e).length > 0) ?? entries[0];
  const open = entry ? toDecide(entry) : [];
  const view = scope ?? (open.length > 0 ? 'open' : 'all');
  const hits = entry ? (view === 'open' ? open : entry.hits) : [];
  const hit = hits.find(h => h.id === pickedHit) ?? hits[0];
  const pick = (next: WatchlistEntryOut) => { setPicked(next.id); setPickedHit(null); setScope(null); writeLook(investigationId, next.id); };
  // The name shown first counts as looked at too.
  useEffect(() => { if (entry && picked === null) writeLook(investigationId, entry.id); }, [entry, picked, investigationId]);

  // A check that could not search is an alert: said once for the whole list when every name shares it.
  const failing = entries.filter(e => e.checked_at && !SEARCHED_OK.has(e.check_state ?? ''));
  const totalNew = entries.reduce((sum, e) => sum + toDecide(e).length, 0);
  const lastChecked = entries.map(e => e.checked_at).filter((at): at is string => Boolean(at)).sort().at(-1);

  // A name that turned up nowhere has no passage to read: its pane takes the room of both.
  const solo = !entry || entry.hits.length === 0;
  return <section className={`wl${solo ? ' solo' : ''}`} aria-label="Watchlist">
    <div className="wl-names">
      <header className="wl-head">
        <Reveal detail="Names searched whenever a document of this investigation is read. Each document a name turns up in shows here once; nothing becomes a lead on its own.">
          <h4 className="wl-title">Watchlist</h4></Reveal>
        {totalNew > 0 && <Reveal detail={`${totalNew} document(s) to decide across every name.`}><span className="wl-total">{totalNew}</span></Reveal>}
        {entries.length > 0 && <Reveal tabbable={false} className="wl-push" detail={lastChecked ? `Last checked ${timeWords(lastChecked)}.` : 'Not checked yet.'}>
          <button type="button" className="wl-icon" aria-label="Check now" onClick={() => void checkNow()} disabled={check.isPending}>
            <RefreshCw size={15} aria-hidden="true" className={check.isPending ? 'wl-spin' : undefined}/></button></Reveal>}
      </header>
      {watchlist.isError && <p className="wl-alert">{errorMessage(watchlist.error, 'Could not load the watchlist')}</p>}
      {failing.length > 0 && <p className="wl-alert">{failing.length === entries.length && failing.every(e => e.check_state === failing[0].check_state)
        ? lastCheck(failing[0]) : `${failing.length} name(s) could not be searched: ${failing.map(e => splitAliases(e.query).name).join(', ')}.`}</p>}
      {watchlist.data && entries.length === 0 && <p className="wl-empty">No name is watched yet. Try a person or a company, with the other names they go by.</p>}
      <ul className="wl-list" aria-label="Watched names">
        {entries.map(e => {
          const {name, aliases} = splitAliases(e.query);
          const fresh = e.hits.filter(h => isNew(h, looks[e.id]) && h.status === 'new').length;
          const undecided = toDecide(e).length;
          return <li key={e.id} className={e.id === entry?.id ? 'on' : undefined}>
            <button type="button" className="wl-name" aria-pressed={e.id === entry?.id} onClick={() => pick(e)}>
              <Reveal tabbable={false} className="wl-grow" detail={<>
                {aliases.length > 0 && <span className="rv-row">Also: {aliases.join(', ')}</span>}
                {e.note && <span className="rv-row">{e.note}</span>}
                <span className="rv-row">{e.hits.length === 0 ? 'Not found in any document yet.' : `Found in ${e.hits.length} document(s), ${undecided} to decide.`}</span>
                <span className="rv-row">{lastCheck(e)}</span></>}>
                <span className="wl-name-text">{name}</span>
              </Reveal>
              {aliases.length > 0 && <i className="wl-aka" aria-label={`also ${aliases.join(', ')}`}>aka</i>}
              {fresh > 0 && <span className="wl-new" aria-label={`${fresh} new since you last looked`}><i aria-hidden="true"/>{fresh}</span>}
              {/* How many documents it turned up, named; nothing at zero. A name never searched is a hollow ring. */}
              {e.hits.length > 0 ? <span className="wl-count"><b>{e.hits.length}</b> {e.hits.length === 1 ? 'hit' : 'hits'}</span>
                : !e.checked_at && <i className="wl-unchecked" aria-label="Not checked yet"/>}
            </button>
            <button type="button" className="wl-stop" aria-label={`Stop watching ${e.query}`} onClick={() => void stopWatching(e)}><X size={13} aria-hidden="true"/></button>
          </li>;
        })}
      </ul>
      <Form {...form}><form onSubmit={submit} className="wl-add" aria-label="Watch a name" noValidate>
        <div className="wl-add-row">
          <FormField control={form.control} name="query" render={({field}) => <FormItemBare>
            <FormControl><Input {...field} aria-label="Name or search to watch" placeholder="Watch a name…"/></FormControl>
            <FormMessage className="field-msg"/></FormItemBare>}/>
          <button type="submit" className="wl-icon pri" aria-label="Watch" disabled={add.isPending}><Plus size={16} aria-hidden="true"/></button>
        </div>
        {typed.trim() && <>
          <FormField control={form.control} name="aliases" render={({field}) => <FormItemBare>
            <FormControl><Input {...field} aria-label="Other names" placeholder="Other names, with commas (optional)"/></FormControl>
            <FormMessage className="field-msg"/></FormItemBare>}/>
          <FormField control={form.control} name="note" render={({field}) => <FormItemBare>
            <FormControl><Input {...field} aria-label="Why it is watched" placeholder="Why (optional)"/></FormControl>
            <FormMessage className="field-msg"/></FormItemBare>}/>
        </>}
        <FormRootError className="field-msg"/>
      </form></Form>
      {status && <p className="wl-status" role="status">{status}</p>}
    </div>

    <div className="wl-hits">
      {!entry && watchlist.data && <div className="wl-none"><p className="wl-none-name muted">Watch a name</p>
        <p className="wl-none-note">Each document a watched name turns up in shows here, with the passage around it.</p></div>}
      {entry && <>
        {entry.hits.length > 0 && <header className="wl-head">
          <h4 className="wl-sub">{splitAliases(entry.query).name}</h4>
          {entry.hits.length > 0 && <div className="wl-scope" role="group" aria-label="Which hits">
            <button type="button" aria-pressed={view === 'open'} onClick={() => setScope('open')}>To decide <b>{open.length}</b></button>
            <button type="button" aria-pressed={view === 'all'} onClick={() => setScope('all')}>All <b>{entry.hits.length}</b></button>
          </div>}
        </header>}
        {hits.length === 0 && (entry.hits.length === 0 ? <EmptyName entry={entry} onCheck={() => void checkNow()} checking={check.isPending}/>
          : <p className="wl-empty">Every hit is decided.</p>)}
        {hits.length > 0 && <ul className="wl-hitlist" aria-label={`Where “${entry.query}” was found`}>
          {hits.map(h => <li key={h.id}>
            <button type="button" className={h.id === hit?.id ? 'wl-hit on' : 'wl-hit'} aria-pressed={h.id === hit?.id} onClick={() => setPickedHit(h.id)}>
              <span className="wl-hit-top">
                <DocMark title={h.title}/>
                <span className="wl-doc">{h.title}</span>
                {h.page_number ? <span className="wl-page">{pageWord(h)}</span> : null}
                {h.status !== 'new'
                  ? <Reveal tabbable={false} className="wl-push" detail={h.status === 'lead' ? 'In leads' : 'Dismissed'}><i className={`wl-dot ${h.status}`} aria-label={h.status === 'lead' ? 'In leads' : 'Dismissed'}/></Reveal>
                  : isNew(h, looks[entry.id]) && <Reveal tabbable={false} className="wl-push" detail="New since you last looked"><i className="wl-dot fresh" aria-label="New since you last looked"/></Reveal>}
              </span>
              {h.highlights[0] && <Passage pieces={aroundMatch(h.highlights[0])} className="wl-snip"/>}
            </button>
          </li>)}
        </ul>}
      </>}
    </div>

    {!solo && <div className="wl-read" aria-label="The picked passage">
      {hit && entry ? <>
        <header className="wl-read-head">
          <DocMark title={hit.title}/>
          <Reveal className="wl-grow" detail={<><span className="rv-row">{hit.title}</span><span className="rv-row">Found {timeWords(hit.found_at)}</span></>}>
            <h4 className="wl-read-title">{hit.title}</h4></Reveal>
        </header>
        {hit.document_id
          ? <button type="button" className="wl-open" onClick={() => openDocument(hit.document_id as string, hit.page_number)}>
            {hit.page_number ? `Open at page ${hit.page_number}` : 'Open document'} <ArrowUpRight size={15} aria-hidden="true"/></button>
          : <Reveal detail="In OpenAleph, not uploaded to this investigation."><span className="wl-only">Only in OpenAleph</span></Reveal>}
        <div className="wl-passages">{hit.highlights.map((pieces, index) => <Passage key={index} pieces={pieces} className="wl-passage"/>)}</div>
        <div className="wl-actions">
          {hit.status === 'new' ? <>
            <button type="button" className="wl-btn pri" onClick={() => void makeLead(hit)} disabled={busy}>Add to leads</button>
            <button type="button" className="wl-btn" onClick={() => void dismissHit(hit)} disabled={busy}>Dismiss</button>
          </> : <><span className={`wl-decided ${hit.status}`}>{hit.status === 'lead' ? 'In leads' : 'Dismissed'}</span>
            {isDemoDecided(hit) && <DemoMark rule="The document is already in the case." onUndo={() => void undoDemoHit(hit)} undoing={undoDemo.pending}/>}</>}
        </div>
      </> : <p className="wl-empty">Pick a hit to read it here.</p>}
    </div>}
  </section>;
}

/** A watched name that no document holds yet, filling its pane: the name large, its other names, why it is watched,
 *  whether and where it was searched (on hover), and Check now. */
function EmptyName({entry, onCheck, checking}: {entry: WatchlistEntryOut; onCheck: () => void; checking: boolean}): ReactElement {
  const {name, aliases} = splitAliases(entry.query);
  return <div className="wl-none">
    <p className="wl-none-name">{name}</p>
    {aliases.length > 0 && <p className="wl-none-aka">{aliases.map(a => <span key={a}>{a}</span>)}</p>}
    {entry.note && <p className="wl-none-note">{entry.note}</p>}
    <p className="wl-none-state"><Reveal detail={lastCheck(entry)}><span>{entry.checked_at ? 'In no document yet' : 'Not searched yet'}</span></Reveal></p>
    <button type="button" className="wl-btn" onClick={onCheck} disabled={checking}><RefreshCw size={14} aria-hidden="true" className={checking ? 'wl-spin' : undefined}/> Search for it now</button>
  </div>;
}
