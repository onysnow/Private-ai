'use client';
// The watchlist (ADR-0006, Wave C; backend app/services/watchlists.py): names
// or searches the reporter wants to know about. Each is searched in the
// investigation's OpenAleph collection whenever OpenAleph has read a new
// document of it, and on "Check now". Every document a name is found in shows
// once, with OpenAleph's highlighted snippet; the reporter opens it, makes it
// a lead (linked to the document's source) or dismisses it. Nothing becomes a
// lead on its own.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ChangeEvent, FormEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {errorMessage} from '../../lib/api-client';
import {
  addWatchlistEntryMutation, checkWatchlistNowMutation, dismissHitMutation, getWatchlistOptions, getWatchlistQueryKey,
  listLeadsQueryKey, makeLeadFromHitMutation, removeWatchlistEntryMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {WatchlistEntryOut, WatchlistHitOut, WatchlistOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {Snippet} from '../search/corpus-results';

const CHECK_STATE: Record<string, string> = {
  not_configured: 'OpenAleph is not set up here, so the name was not searched.',
  no_collection: 'No document of this investigation has been sent to OpenAleph yet.',
};

/** The entry's last check in plain words. */
export function lastCheck(entry: WatchlistEntryOut): string {
  if (!entry.checked_at) return 'Not checked yet: it is searched when OpenAleph next reads a document, or on “Check now”.';
  const at = new Date(/Z$|[+-]\d\d:\d\d$/.test(entry.checked_at) ? entry.checked_at : `${entry.checked_at}Z`).toLocaleString();
  if (entry.check_state === 'ok') return `Last checked ${at}.`;
  return `Last checked ${at}: ${CHECK_STATE[entry.check_state ?? ''] ?? entry.check_detail ?? 'OpenAleph could not be asked.'}`;
}

function Hit({hit, onOpen, onLead, onDismiss, busy}: {hit: WatchlistHitOut; onOpen: () => void; onLead: () => void;
  onDismiss: () => void; busy: boolean}): ReactElement {
  return <li>
    <b>{hit.title}</b>{hit.page_number ? <small> · page {hit.page_number}</small> : null}
    {hit.highlights.slice(0, 2).map((pieces, index) => <Snippet key={index} pieces={pieces}/>)}
    <div className="actions">
      {hit.document_id && <Button variant="link" onClick={onOpen}>Open document</Button>}
      {hit.status === 'new' ? <>
        <Button size="sm" variant="outline" onClick={onLead} disabled={busy}>Make a lead</Button>
        <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}>Dismiss</Button>
      </> : <small>{hit.status === 'lead' ? 'Made a lead' : 'Dismissed'}</small>}
    </div>
  </li>;
}

export function Watchlist({investigationId}: {investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const path = {investigation_id: investigationId};
  const key = getWatchlistQueryKey({path});
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
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

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = query.trim();
    if (!name) return;
    void attempt(async () => {
      keep(await add.mutateAsync({path, body: {query: name, note: note.trim() || null}}));
      setQuery('');
      setNote('');
      return `Watching “${name}”.`;
    }, 'Could not watch the name');
  };
  const checkNow = () => attempt(async () => {
    const reply = await check.mutateAsync({path});
    keep(reply);
    return reply.new_hits ? `Found ${reply.new_hits} new document(s).` : 'Nothing new.';
  }, 'Could not check the watchlist');
  const stopWatching = (entry: WatchlistEntryOut) => attempt(async () => {
    keep(await remove.mutateAsync({path: {watch_id: entry.id}}));
    return `Stopped watching “${entry.query}”.`;
  }, 'Could not stop watching the name');
  const makeLead = (hit: WatchlistHitOut) => attempt(async () => {
    const made = await lead.mutateAsync({path: {hit_id: hit.id}});
    await Promise.all([queryClient.invalidateQueries({queryKey: key}), queryClient.invalidateQueries({queryKey: listLeadsQueryKey({path})})]);
    return `“${made.title}” is now a lead.`;
  }, 'Could not make the lead');
  const dismissHit = (hit: WatchlistHitOut) => attempt(async () => {
    keep(await dismiss.mutateAsync({path: {hit_id: hit.id}}));
    return `Dismissed ${hit.title}.`;
  }, 'Could not dismiss it');

  const entries = watchlist.data?.entries ?? [];
  return <div className="candidate">
    <b>Watchlist</b>
    <p className="muted">Names searched in this investigation&apos;s documents whenever OpenAleph reads a new one. Each document a name turns up in shows here once.</p>
    <form onSubmit={submit} className="actions" aria-label="Watch a name">
      <Input aria-label="Name or search to watch" placeholder="A name, or a search like “Jane Doe” OR Zanzibar" value={query}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}/>
      <Input aria-label="Why it is watched" placeholder="Why (optional)" value={note}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setNote(e.target.value)}/>
      <Button type="submit" disabled={!query.trim() || add.isPending}>Watch</Button>
    </form>
    {watchlist.isError && <p className="muted">{errorMessage(watchlist.error, 'Could not load the watchlist')}</p>}
    {watchlist.data && entries.length === 0 && <p className="muted">No name is watched yet.</p>}
    {entries.length > 0 && <Button variant="outline" onClick={() => void checkNow()} disabled={check.isPending}>{check.isPending ? 'Checking…' : 'Check now'}</Button>}
    {entries.map(entry => {
      const open = entry.hits.filter(hit => hit.status === 'new');
      return <div className="statement" key={entry.id}>
        <div>
          <b>{entry.query}</b>{entry.note && <small> · {entry.note}</small>}
          <div><small>{lastCheck(entry)}</small></div>
          <div><small>{entry.hits.length === 0 ? 'Not found in any document yet.' : `Found in ${entry.hits.length} document(s), ${open.length} to decide.`}</small></div>
        </div>
        {entry.hits.length > 0 && <ul aria-label={`Where “${entry.query}” was found`}>
          {entry.hits.map(hit => <Hit key={hit.id} hit={hit} busy={busy} onOpen={() => openDocument(hit.document_id as string, hit.page_number)}
            onLead={() => void makeLead(hit)} onDismiss={() => void dismissHit(hit)}/>)}
        </ul>}
        <div className="actions"><Button size="sm" variant="ghost" onClick={() => void stopWatching(entry)}>Stop watching</Button></div>
      </div>;
    })}
    {status && <p className="muted" role="status">{status}</p>}
  </div>;
}
