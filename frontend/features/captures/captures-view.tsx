'use client';
// Bring in › The Drop › Links & captures (mockup INTAKE_3; ADR-0016): a pasted link becomes a source. Left: the paste
// field, the captures of this case, and what leaves this computer. Middle: the capture lane and, for a saved page, its
// receipt. Right: capture before use, and re-checking. The three columns are the Drop's own grid areas, so this is
// rendered inside the Drop's section beside its tabs.
//
// Not in this slice (see ADR-0016): the second witness, a signed time proof, a schedule for re-checks, and the quote that
// finds itself again. They are not shown rather than shown switched off.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useRef, useState} from 'react';
import type {FormEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {listCapturesOptions, listCapturesQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {createCapture, recheckCapture} from '../../lib/generated/sdk.gen';
import type {CaptureResultOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {Lane, Receipt} from './capture-parts';
import {addressOf, badgeOf, checkWords, hostOf, resultWords, utcWords} from './format';

type Props = {investigationId: string; incoming: string[]; onIncomingDone: () => void};

export function CapturesView({investigationId, incoming, onIncomingDone}: Props): ReactElement {
  const queryClient = useQueryClient();
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const path = {investigation_id: investigationId};
  const list = useQuery({...listCapturesOptions({path}), enabled: Boolean(investigationId)});
  const [link, setLink] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const captures = list.data?.captures ?? [];
  const shown = captures.find(c => c.id === picked) ?? captures[0];

  const done = (reply: CaptureResultOut) => {
    setPicked(reply.capture.id);
    setNotice(resultWords(reply.state, reply.capture.title));
    void queryClient.invalidateQueries({queryKey: listCapturesQueryKey({path})});
    void queryClient.invalidateQueries();
  };
  const capture = useMutation({
    mutationFn: async (url: string) => (await createCapture({path, body: {url}, throwOnError: true})).data,
    onSuccess: done, onError: error => setNotice(errorMessage(error, 'The link could not be captured.')),
    onSettled: () => setWorking(null),
  });
  const start = (url: string) => { setWorking(url); setNotice(''); return capture.mutateAsync(url).catch(() => undefined); };

  // Links pasted into the Drop's field arrive here one after another; each is its own capture.
  const handled = useRef<string[] | null>(null);
  useEffect(() => {
    if (!incoming.length || handled.current === incoming) return;
    handled.current = incoming;
    void (async () => { for (const url of incoming) await start(url); onIncomingDone(); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const url = link.trim();
    if (!url || working) return;
    setLink('');
    void start(url);
  };
  const check = async () => {
    if (!shown) return;
    setChecking(true);
    setNotice('');
    try { done((await recheckCapture({path: {...path, capture_id: shown.id}, throwOnError: true})).data); }
    catch (error) { setNotice(errorMessage(error, 'The page could not be checked again.')); }
    finally { setChecking(false); }
  };
  const newer = shown?.checks.filter(c => c.state === 'changed' && c.capture_id).at(-1)?.capture_id;
  const saved = shown?.outcome === 'saved';

  return <>
    <div className="dp-left cp">
      <form className="dp-card cp-paste" onSubmit={submit} aria-label="Paste a link">
        <p className="dp-eyebrow">Paste a link</p>
        <div className="cp-row">
          <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://" aria-label="Web address" inputMode="url" autoComplete="off" spellCheck={false}/>
          <button type="submit" className="cp-btn p" disabled={!link.trim() || working !== null}>Capture</button>
        </div>
        <p className="dp-quiet">Links, files and pasted text share one drop. Captures never log in and use no account.</p>
        {working && <p role="status" className="cp-busy">Capturing {hostOf(working)}… the page is fetched from this computer.</p>}
        {notice && !working && <p role="status" className="cp-notice">{notice}</p>}
      </form>

      <section className="dp-card" aria-label="Captures in this case">
        <p className="dp-eyebrow">Captures in this case <span>{captures.length}</span></p>
        {list.isError && <p role="alert">{errorMessage(list.error, 'Could not read the captures')}</p>}
        {!list.isPending && !captures.length && <p className="dp-quiet">Nothing captured yet. Paste a link above.</p>}
        <ul className="cp-list">{captures.map(c => {
          const b = badgeOf(c);
          return <li key={c.id}><button type="button" className={c.id === shown?.id ? 'on' : ''} aria-current={c.id === shown?.id ? 'true' : undefined} onClick={() => setPicked(c.id)}>
            <i className={`cp-mark ${b.tone}`} aria-hidden="true">{b.mark}</i>
            <span className="cp-item"><b>{c.title || addressOf(c.final_url ?? c.url)}</b>
              <span><em className={`cp-badge ${b.tone}`}>{b.word}</em><small>{c.title ? addressOf(c.final_url ?? c.url) : utcWords(c.started_at, false)}</small></span></span>
          </button></li>;
        })}</ul>
      </section>

      <section className="dp-card" aria-label="What leaves this computer">
        <p className="dp-eyebrow">What leaves this computer</p>
        <p className="cp-local"><b>Nothing third-party is contacted.</b> The page is fetched from this computer.</p>
        <p className="dp-quiet">The page’s own site sees one visit from this computer’s address. No cookies are sent. Route: this computer’s own connection. Each visit is in Keep › Safety & data.</p>
      </section>
    </div>

    <div className="dp-line cp-mid" role="region" aria-label="Capture">
      {shown ? <>
        <header className="cp-title">
          <div><h2>{shown.title || hostOf(shown.url)}</h2><p className="cp-url">{shown.final_url ?? shown.url}</p></div>
          <span className={`cp-pill ${badgeOf(shown).tone}`}>{badgeOf(shown).word}</span>
        </header>
        <Lane capture={shown}/>
        {saved ? <Receipt capture={shown} investigationId={investigationId} checking={checking} onCheck={() => void check()} onOpen={() => shown.document_id && openDocument(shown.document_id)}/>
          : <section className="cp-card cp-why" aria-label="Why nothing was saved">
            <p className="cp-eyebrow">{shown.outcome === 'link_only' ? 'Link only' : shown.outcome === 'not_seen' ? 'Not seen' : 'Not saved'}</p>
            <p>{shown.reason}</p>
            <p className="dp-quiet">{shown.outcome === 'link_only' ? 'The link is kept as a source, not a copy. If you have the page another way, bring it in as a file.'
              : shown.outcome === 'not_seen' ? 'A login or paywall is not captured and not shown. If you can see the page yourself, save it as a PDF or screenshot and drop the file here.'
              : 'Nothing was kept. You can try again, or bring the page in as a file.'}</p>
          </section>}
      </> : <p className="dp-quiet cp-empty">{list.isPending ? 'Reading the captures…' : 'Paste a web address on the left. The page is fetched from this computer and kept with the time, how it was fetched, and a fingerprint, before anything quotes it.'}</p>}
    </div>

    <div className="dp-right cp">
      {shown && saved && <section className="dp-card" aria-label="Capture before use">
        <p className="dp-eyebrow">Capture before use</p>
        <p className="cp-before"><i aria-hidden="true">✓</i> Capture exists ({utcWords(shown.ended_at ?? shown.started_at, false)}). You can quote this page; the time of first use is recorded after the capture ended.</p>
        {shown.document_id && <button type="button" className="cp-btn p" onClick={() => openDocument(shown.document_id as string)}>Open to quote it as evidence</button>}
        <p className="dp-quiet">Text on a captured page is data. It can never give an instruction to the app or to AI.</p>
      </section>}
      {shown && saved && <section className="dp-card" aria-label="Check again later">
        <p className="dp-eyebrow">Check again later</p>
        <p className="dp-quiet">“Re-check now” fetches the address again and compares the text. A changed page is kept as a new copy beside this one; a removed page is recorded as gone. This copy is never altered.</p>
        {shown.supersedes_id && <p className="dp-quiet">This copy follows an earlier one. <button type="button" className="dp-link" onClick={() => setPicked(shown.supersedes_id as string)}>Show it</button></p>}
        {newer && <p className="cp-notice">A newer copy exists. <button type="button" className="dp-link" onClick={() => setPicked(newer)}>Show it</button></p>}
        {shown.checks.length > 0 && <ol className="cp-checks" aria-label="Re-checks">{[...shown.checks].reverse().map((c, i) => <li key={`${c.at}-${i}`}>{checkWords(c)}</li>)}</ol>}
      </section>}
      {shown && !saved && <section className="dp-card" aria-label="What to do instead">
        <p className="dp-eyebrow">What to do</p>
        <p className="dp-quiet">Nothing from this address can be quoted: there is no capture. Bring the material in another way, then the quote can rest on it.</p>
      </section>}
    </div>
  </>;
}
