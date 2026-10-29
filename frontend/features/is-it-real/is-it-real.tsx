'use client';
// Is it real? (mockup CHECK_3, ADR-0023). The system records what it found; a detector cannot decide; only a person
// can, with reasons. Left: the item, what it is for (evidence of events, or the subject of the story) and which claims
// lean on it, previewed before a status is recorded. Middle: the four layers: content credentials validated here,
// the outlet's record from the case, hints (none installed; off for images, hidden on short text), and the decision
// with what was checked and why. Right: before anything is sent (a local comparison, or one outside check allowed
// once with exactly what goes; nothing for a source-protected item) and the append-only history.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import type {ReactElement, ReactNode} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import {apiTime} from '../../lib/timestamps';
import {getAuthenticityOptions, getAuthenticityQueryKey, listAuthenticityOptions, listAuthenticityQueryKey, listDocumentsOptions, previewAuthenticityOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {addAboutClaim, compareAuthenticity, decideAuthenticity, examineAgain, outsideAuthenticity, updateAuthenticity} from '../../lib/generated/sdk.gen';
import type {AuthenticityHistoryOut, AuthenticityOut, AuthenticityPreviewOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';

type Status = 'verified_origin' | 'unverified' | 'likely_synthetic' | 'confirmed_synthetic' | 'disputed';
type Checked = 'read_findings' | 'looked_up_source' | 'asked_poster' | 'compared_copies' | 'checked_place_time';

export const STATUSES: {key: Status; label: string; line: string}[] = [
  {key: 'verified_origin', label: 'Verified origin', line: 'You reviewed the credentials and the signer’s trust, or checked the capture and the author yourself.'},
  {key: 'unverified', label: 'Unverified', line: 'The default. Nothing either way. It is not a mark against the item.'},
  {key: 'likely_synthetic', label: 'Likely synthetic', line: 'The signs are weighty but not conclusive. Say why you think so.'},
  {key: 'confirmed_synthetic', label: 'Confirmed synthetic', line: 'A signed AI-source record, the maker’s own statement or a forensic finding, reviewed by you.'},
  {key: 'disputed', label: 'Disputed', line: 'The evidence conflicts. Say what conflicts.'},
];
const CHECKS: {key: Checked; label: string}[] = [
  {key: 'read_findings', label: 'Read the findings'}, {key: 'looked_up_source', label: 'Looked up the source'},
  {key: 'asked_poster', label: 'Asked the poster'}, {key: 'compared_copies', label: 'Compared copies'},
  {key: 'checked_place_time', label: 'Checked place and time'},
];
const statusLabel = (key: string) => STATUSES.find(s => s.key === key)?.label ?? key;
/** The item's kind as a mark, named on reveal. */
const KIND_MARK: Record<string, string> = {image: '▣', text: '¶', audio: '♪', video: '▶'};

type Provenance = {kind?: string; state?: string; expected?: boolean; signer?: string | null; issuer?: string | null; signed_at?: string | null;
  source_types?: string[]; xmp_source_types?: string[]; generator?: string | null; failures?: string[]; trust_list_date?: string};
type SourceRow = {key: string; label: string; tone: 'good' | 'warn' | 'none'; text: string};
type Hint = {state: 'off_by_default' | 'suppressed' | 'none_installed'; text: string; words?: number};
type Findings = {provenance?: Provenance; flags?: {key: string; text: string}[]; source?: SourceRow[]; hints?: Hint; jpeg_quality?: number | null};

const SOURCE_TYPE_WORDS: Record<string, string> = {
  trainedAlgorithmicMedia: 'Created using generative AI', compositeWithTrainedAlgorithmicMedia: 'Edited using generative AI',
  algorithmicMedia: 'Made by an algorithm, without a camera', compositeSynthetic: 'Composited from synthetic parts',
  algorithmicallyEnhanced: 'Enhanced by an algorithm', digitalCapture: 'Captured by a camera', minorHumanEdits: 'Captured, with minor edits',
  composite: 'Composited from several captures', digitalArt: 'Drawn by a person on a computer',
};
const STATES = [{key: 'trusted', label: 'Valid · signer trusted'}, {key: 'valid', label: 'Valid · signer not trusted'}, {key: 'invalid', label: 'Invalid'}, {key: 'absent', label: 'Absent'}];

const when = (iso: string | null | undefined): string => iso
  ? apiTime(iso).toLocaleString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}).replace(',', '') : '';
const clockOf = (iso: string): string => {
  const d = apiTime(iso);
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})
    : d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
};
const spaced = (sha: string) => `${sha.slice(0, 4)} ${sha.slice(4, 8)} …${sha.slice(-4)}`;
const size = (n: number | null | undefined) => n == null ? '' : n < 1024 ? `${n} bytes` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export function IsItReal({investigationId}: {investigationId: string}): ReactElement | null {
  const request = useWorkbenchStore(state => state.realness);
  const close = useWorkbenchStore(state => state.closeRealness);
  if (!request || !investigationId) return null;
  return <Screen key={`${request.documentId}:${request.serial}`} investigationId={investigationId} documentId={request.documentId} onClose={close}/>;
}

function Screen({investigationId, documentId, onClose}: {investigationId: string; documentId: string; onClose: () => void}): ReactElement {
  const queryClient = useQueryClient();
  const caseName = useWorkbenchStore(state => state.investigationName);
  const query = useQuery({...getAuthenticityOptions({path: {document_id: documentId}})});
  const data = query.data;
  const [choice, setChoice] = useState<Status | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    // Escape closes this screen only, not the reading room it may have been opened from.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const refresh = (next: AuthenticityOut) => {
    queryClient.setQueryData(getAuthenticityQueryKey({path: {document_id: documentId}}), next);
    void queryClient.invalidateQueries({queryKey: listAuthenticityQueryKey({path: {investigation_id: investigationId}})});
  };
  const patch = async (body: {role?: 'events' | 'subject'; source_protected?: boolean; platform_label?: string}) => {
    try { refresh((await updateAuthenticity({path: {document_id: documentId}, body, throwOnError: true})).data); setError(''); }
    catch (e) { setError(errorMessage(e, 'Could not save that')); }
  };

  if (!data) return <div className="ir" role="dialog" aria-modal="true" aria-label="Is it real?">
    <header className="ir-top"><h1>Is it real?</h1><button type="button" className="rr-close" onClick={onClose} aria-label="Close">×</button></header>
    <p className="ir-quiet">{query.isError ? errorMessage(query.error, 'Could not open this item') : 'Reading what the file says about itself…'}</p>
  </div>;

  const findings = data.findings as Findings;
  const shown: Status = choice ?? (data.status as Status);
  return <div className="ir" data-calm-zone="" role="dialog" aria-modal="true" aria-label={`Is it real? ${data.item.title}`}>
    <header className="ir-top">
      <nav className="rr-crumbs" aria-label="You are here"><span>{caseName || 'Case'}</span><span>Check</span><span>Sources</span><b>Is it real?</b></nav>
      <span className="ir-mono ir-dim">Content verified: not done by the capture</span>
      <button type="button" className="rr-close" onClick={onClose} aria-label="Close Is it real?">×</button>
    </header>
    <div className="ir-title"><h1>Is it real?</h1><p>The system records what it found. A detector cannot decide this. Only you can, with reasons.</p>
      <Reveal label={`A${data.item.kind === 'image' || data.item.kind === 'audio' ? 'n' : ''} ${data.item.kind}`} detail={<b>{data.item.kind}</b>}>
        <span className="ir-kind" aria-hidden="true">{KIND_MARK[data.item.kind] ?? data.item.kind}</span></Reveal></div>
    {error && <p role="alert" className="ir-err">{error}</p>}
    <aside className="ir-col" aria-label="The item">
      <Item data={data} onProtect={v => void patch({source_protected: v})}/>
      <section className="ir-panel" aria-label="What is this item for?">
        <p className="ir-cap"><Reveal detail={data.role === 'events'
          ? <>It is used to show <b>what happened</b>. If it turns out to be synthetic, claims lose its support.</>
          : <>It is the <b>thing the story is about</b>, such as a real fake that circulated. It proves the fake existed, never what the fake shows.</>}><span>What is this item for?</span></Reveal></p>
        <div className="ir-seg" role="radiogroup" aria-label="What is this item for?">
          {(['events', 'subject'] as const).map(r => <button key={r} type="button" role="radio" aria-checked={data.role === r}
            onClick={() => data.role !== r && void patch({role: r})}>{r === 'events' ? 'Evidence of events' : 'The subject of the story'}</button>)}
        </div>
      </section>
      <Claims documentId={documentId} data={data} choice={choice} onChanged={refresh}/>
    </aside>

    <main className="ir-col ir-mid" aria-label="Findings">
      <ProvenancePanel data={data} findings={findings} onLabel={label => void patch({platform_label: label})}/>
      <section className="ir-panel" aria-label="Outlet and account reputation">
        <p className="ir-cap"><span className="ir-cap-title"><i>2 Source</i> Outlet and account reputation</span><span className="ir-tag">Finding</span></p>
        <dl className="ir-kv ir-dots">{(findings.source ?? []).map(r => <div key={r.key}><dt>{r.label}</dt><dd data-tone={r.tone}>{r.text}</dd></div>)}</dl>
      </section>
      <section className="ir-panel" aria-label="Detectors">
        <p className="ir-cap"><span className="ir-cap-title"><i>3 Hints</i> <Reveal detail={findings.hints?.text ?? 'No hint.'}><span>Detectors</span></Reveal></span><span className="ir-tag">Off by default</span></p>
        <label className="ir-switch"><input type="checkbox" disabled checked={false} readOnly/>
          <span>{findings.hints?.state === 'suppressed' ? 'Show hint' : 'Run local hint'}</span>
          {findings.hints?.state === 'suppressed' && <em className="ir-chip ir-bad">Suppressed on short text</em>}
          {findings.hints?.state !== 'suppressed' && <em className="ir-chip">None installed</em>}</label>
      </section>
      <Decide key={`${data.status}:${data.decided_at ?? ''}`} documentId={documentId} data={data} choice={shown}
        onChoose={s => setChoice(s === data.status ? null : s)} onDone={next => { setChoice(null); refresh(next); }}/>
    </main>

    <aside className="ir-col" aria-label="Before anything is sent, and history">
      <Outside documentId={documentId} data={data} onLogged={() => void query.refetch()}/>
      <History rows={data.history} onAgain={async () => {
        try { refresh((await examineAgain({path: {document_id: documentId}, throwOnError: true})).data); }
        catch (e) { setError(errorMessage(e, 'Could not read the findings again')); }
      }}/>
    </aside>
  </div>;
}

function Item({data, onProtect}: {data: AuthenticityOut; onProtect: (v: boolean) => void}): ReactElement {
  const item = data.item;
  const picture = useQuery({queryKey: ['document-picture', item.document_id], queryFn: () => api.blob(`/api/documents/${item.document_id}/picture`),
    enabled: item.kind === 'image', staleTime: Infinity, retry: false});
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!picture.data) return undefined;
    const made = URL.createObjectURL(picture.data);
    setSrc(made);
    return () => URL.revokeObjectURL(made);
  }, [picture.data]);
  return <section className="ir-panel" aria-label="The item">
    <p className="ir-cap">The item <span className="ir-status" data-status={data.status}>{statusLabel(data.status)}</span></p>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {item.kind === 'image' && (src ? <img className="ir-pic" src={src} alt={`The item: ${item.filename}`}/> : <div className="ir-pic ir-quiet">{picture.isError ? 'No picture to show' : 'Opening…'}</div>)}
    {item.kind === 'text' && <blockquote className="ir-excerpt">{highlight(item.excerpt ?? '', item.quotes)}</blockquote>}
    {(item.kind === 'audio' || item.kind === 'video') && <div className="ir-pic ir-quiet">{item.kind === 'audio' ? 'A recording' : 'A video'} · {item.filename}</div>}
    <h2 className="ir-item-title">{item.title}</h2>
    {/* Who posted it stays; when it came in, the file's size and its fingerprint are on reveal (Ony, 29 Oct). */}
    <p className="ir-small"><Reveal detail={item.from_link ? `Captured ${when(item.captured_at)} from a link` : `Added ${when(item.added_at)}`}>
      <span>{item.posted_by ? `Posted by ${item.posted_by}` : item.from_link ? 'From a link' : 'Added by hand'}</span></Reveal></p>
    <dl className="ir-kv">
      <div><dt>File</dt><dd className="ir-mono"><Reveal detail={[size(item.size), item.width && item.height ? `${item.width}×${item.height}` : null,
        item.words != null ? `${item.words} words` : null].filter(Boolean).join(' · ') || item.filename}><span>{item.filename}</span></Reveal>{' '}
        <Reveal label="SHA-256 fingerprint" detail={<><b>SHA-256</b><span className="rv-row rv-mono">{item.sha256}</span><span className="rv-row rv-mono">{spaced(item.sha256)}</span></>}>
          <span className="ir-fp" aria-hidden="true">#</span></Reveal></dd></div>
      {item.note && <div><dt>Note</dt><dd>{item.note}</dd></div>}
    </dl>
    <label className="ir-switch ir-rule"><input type="checkbox" checked={data.source_protected} onChange={e => onProtect(e.target.checked)}/><span>Source-protected item</span></label>
  </section>;
}

/** The text with the quotes taken from it underlined. */
function highlight(text: string, quotes: string[]): ReactNode {
  const wanted = quotes.map(q => q.trim()).filter(q => q.length > 3);
  if (!wanted.length) return text;
  const parts: ReactNode[] = [];
  let rest = text;
  for (let guard = 0; guard < 20 && rest; guard++) {
    const hits = wanted.map(q => ({q, at: rest.indexOf(q)})).filter(h => h.at >= 0).sort((a, b) => a.at - b.at);
    if (!hits.length) break;
    const {q, at} = hits[0];
    parts.push(rest.slice(0, at), <mark key={parts.length}>{q}</mark>);
    rest = rest.slice(at + q.length);
  }
  parts.push(rest);
  return parts;
}

function Claims({documentId, data, choice, onChanged}: {documentId: string; data: AuthenticityOut; choice: Status | null;
  onChanged: (next: AuthenticityOut) => void}): ReactElement {
  const previewing = choice !== null && choice !== data.status;
  const previewed = useQuery({...previewAuthenticityOptions({path: {document_id: documentId}, query: {status: choice ?? 'unverified', role: data.role as 'events' | 'subject'}}),
    enabled: previewing});
  const p: AuthenticityPreviewOut | undefined = previewing ? previewed.data : data.preview;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (!p) return <section className="ir-panel" aria-label="Which claims lean on it"><p className="ir-cap">Which claims lean on it</p><p className="ir-quiet">Working it out…</p></section>;
  const events = p.claims.filter(c => c.outcome !== 'about');
  const about = p.claims.filter(c => c.outcome === 'about');
  const subject = data.role === 'subject';
  const applied = !previewing && data.status !== 'unverified' && p.claims.length > 0;
  const tone = p.blocking && !subject ? 'bad' : p.blocking ? 'good' : 'plain';
  const add = async () => {
    try { onChanged((await addAboutClaim({path: {document_id: documentId}, body: {text: (draft ?? p.suggestion ?? '').trim()}, throwOnError: true})).data); setDraft(null); setError(''); }
    catch (e) { setError(errorMessage(e, 'Could not add the claim')); }
  };
  const row = (c: AuthenticityPreviewOut['claims'][number], tag?: string) => <li key={c.id}>
    {tag && <span className="ir-mono ir-dim">{tag}</span>}
    <p>{tag ? c.text : <Reveal tabbable={false} detail={<span className="rv-mono">claim {c.id.slice(0, 8)}</span>}><span>{c.text}</span></Reveal>}</p>
    {c.outcome === 'about' && <em className="ir-chip">Supported by this item</em>}
    {c.outcome === 'loses' && <em className="ir-chip ir-bad">Supported only by a synthetic source</em>}
    {c.outcome === 'keeps' && <span>{c.other ? <Reveal detail={`${String(c.other.source ?? '')}${c.other.locator ? `, ${String(c.other.locator)}` : ''}`}>
      <em className="ir-chip">Keeps {c.others} other source{c.others === 1 ? '' : 's'}</em></Reveal> : <em className="ir-chip">Keeps {c.others} other source{c.others === 1 ? '' : 's'}</em>}</span>}
  </li>;
  return <section className="ir-panel" aria-label="Which claims lean on it">
    <p className="ir-cap">Which claims lean on it <span className={applied ? 'ir-tag ir-good' : 'ir-tag'}>{applied ? 'Applied' : 'Preview'}</span></p>
    <h3 className="ir-headline" data-tone={tone}>{p.headline}</h3>
    {!p.blocking && !previewing && data.status === 'unverified' && events.length > 0 &&
      <p className="ir-small"><Reveal detail="Pick a status in step 4 to preview what it would change."><span>{events.length} claim{events.length === 1 ? ' cites' : 's cite'} this item.</span></Reveal></p>}
    <ul className="ir-claims">
      {about.map(c => row(c, 'About the item'))}
      {subject && p.suggestion && about.length === 0 && <li className="ir-new">
        <span className="ir-mono ir-dim">New claim · about the item</span>
        <textarea className="ir-input" rows={2} aria-label="A claim about the item itself" value={draft ?? p.suggestion} onChange={e => setDraft(e.target.value)}/>
        <button type="button" className="ir-ghost" onClick={() => void add()}>Add this claim</button>
      </li>}
      {(!subject || !p.blocking) && events.map(c => row(c))}
    </ul>
    {error && <p role="alert" className="ir-err">{error}</p>}
    {subject && p.blocking && <p className="ir-small">It supports no claim about what it shows. {events.length
      ? `The ${events.length} claim${events.length === 1 ? '' : 's'} that cited it as evidence of events lose${events.length === 1 ? 's' : ''} it${events.some(c => c.outcome === 'keeps') ? ' (some keep other sources)' : ''}.` : ''}</p>}
    {(p.derived.length > 0 || p.restating.length > 0) && <p className="ir-small">Derivatives inherit it: {[
      ...p.derived.map(d => String((d as {operation?: string}).operation ?? 'a derived file')), ...(p.restating.length ? [`${p.restating.length} record${p.restating.length === 1 ? '' : 's'} restating it`] : [])].join(' · ')}.</p>}
  </section>;
}

function ProvenancePanel({data, findings, onLabel}: {data: AuthenticityOut; findings: Findings; onLabel: (label: string) => void}): ReactElement {
  const prov = findings.provenance ?? {};
  const text = data.item.kind === 'text';
  const types = [...(prov.source_types ?? []), ...(prov.xmp_source_types ?? []).filter(t => !(prov.source_types ?? []).includes(t))];
  const [label, setLabel] = useState(data.platform_label ?? '');
  const flags = findings.flags ?? [];
  const note = prov.state === 'unavailable' ? 'Not read: c2pa-python is not installed on this computer.'
    : prov.state === 'unsupported' ? 'This file’s format cannot carry content credentials here.'
      : prov.state === 'missing' ? 'Not read: the file is missing from this computer.' : null;
  return <section className="ir-panel" aria-label="Content credentials">
    <p className="ir-cap"><span className="ir-cap-title"><i>1 Provenance</i> {text ? 'Where it says it comes from' : 'Content credentials (C2PA)'}</span><span className="ir-tag">Finding</span></p>
    <div className="ir-states" aria-label="Validation">{STATES.map(s => <span key={s.key} className="ir-state" data-on={prov.state === s.key || undefined}
      data-tone={s.key === 'invalid' ? 'bad' : s.key === 'absent' ? 'warn' : 'good'}>{s.label}</span>)}</div>
    {note && <p className="ir-small">{note}</p>}
    <dl className="ir-kv">
      {text ? <>
        <div><dt>Credentials</dt><dd>Plain text has none. This is expected, not a finding.</dd></div>
      </> : <>
        <div><dt>Signer</dt><dd>{prov.signer ? <>{prov.signer} · {prov.state === 'trusted' ? 'on the trust list' : 'not on the trust list'}</> : prov.state === 'absent' ? 'None. Absence proves nothing.' : '—'}</dd></div>
        <div><dt>Digital source type</dt><dd>{types.length ? types.map(t => <span key={t}><Reveal detail={<code>{t}</code>}><span>{SOURCE_TYPE_WORDS[t] ?? t}</span></Reveal> </span>) : 'Not stated'}</dd></div>
        <div><dt>Signed</dt><dd>{prov.signed_at ? when(prov.signed_at) : prov.signer ? 'No trusted time in the manifest' : '—'}</dd></div>
        {(prov.failures ?? []).filter(f => f !== 'signingCredential.untrusted').length > 0 &&
          <div><dt>Failed</dt><dd className="ir-mono">{(prov.failures ?? []).filter(f => f !== 'signingCredential.untrusted').join(', ')}</dd></div>}
      </>}
      <div><dt><Reveal detail="Not part of the file; kept as a separate note."><span>Platform label</span></Reveal></dt><dd><input className="ir-input" aria-label="Platform label" placeholder="What the platform showed beside it, if anything"
        value={label} onChange={e => setLabel(e.target.value)} onBlur={() => label !== (data.platform_label ?? '') && onLabel(label)}/></dd></div>
    </dl>
    {!text && prov.trust_list_date && <p className="ir-small ir-dim">Validated on this computer · trust list of {prov.trust_list_date} · nothing fetched.</p>}
    {flags.map(f => <p key={f.key} className="ir-flag"><b>Review flag</b> {f.text}</p>)}
  </section>;
}

function Decide({documentId, data, choice, onChoose, onDone}: {documentId: string; data: AuthenticityOut; choice: Status;
  onChoose: (s: Status) => void; onDone: (next: AuthenticityOut) => void}): ReactElement {
  const [checked, setChecked] = useState<Checked[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const same = choice === data.status;
  const ready = !same && checked.length > 0 && reason.trim().length >= 10;
  const record = async () => {
    setBusy(true);
    try { onDone((await decideAuthenticity({path: {document_id: documentId}, body: {status: choice, checked, reason}, throwOnError: true})).data); }
    catch (e) { setError(errorMessage(e, 'Could not record the decision')); }
    setBusy(false);
  };
  return <section className="ir-panel ir-decide" aria-label="Status and your reasons">
    <p className="ir-cap"><span className="ir-cap-title"><i>4 You decide</i> Status and your reasons</span><span className="ir-tag">Only you set this</span></p>
    <div className="ir-statuses" role="radiogroup" aria-label="Status">{STATUSES.map(s => <button key={s.key} type="button" role="radio"
      aria-checked={choice === s.key} data-status={s.key} data-current={data.status === s.key || undefined} onClick={() => onChoose(s.key)}>{s.label}</button>)}</div>
    <p className="ir-small">{STATUSES.find(s => s.key === choice)?.line}</p>
    <div className="ir-checks">{CHECKS.map(c => <label key={c.key}><input type="checkbox" checked={checked.includes(c.key)}
      onChange={e => setChecked(e.target.checked ? [...checked, c.key] : checked.filter(x => x !== c.key))}/> {c.label}</label>)}</div>
    <textarea className="ir-input ir-reason" aria-label="Why? What you checked, and what you did not." placeholder="Why? What you checked, and what you did not."
      value={reason} onChange={e => setReason(e.target.value)} rows={2}/>
    {error && <p role="alert" className="ir-err">{error}</p>}
    <div className="ir-acts"><button type="button" className="ir-primary" disabled={!ready || busy} onClick={() => void record()}>{busy ? 'Recording…' : 'Record decision'}</button>
      <small className="ir-dim">{same ? 'Pick a different status to record a decision.' : ready ? 'It goes in the history with your reasons.' : 'Tick what you checked and write at least a short reason.'}</small></div>
    {data.decided_at && <p className="ir-small ir-dim"><Reveal detail={`Last decided ${when(data.decided_at)}`}><span>Last decided</span></Reveal>{data.reason ? `: “${data.reason}”` : ''}</p>}
  </section>;
}

function Outside({documentId, data, onLogged}: {documentId: string; data: AuthenticityOut; onLogged: () => void}): ReactElement {
  const local = {key: 'local', label: `Compare with this case’s files`, to: 'Local · nothing leaves this computer', sends: null, available: true, why_not: null};
  // TinEye and Google Lens are one choice (they send the same public address), with the service picked inside it.
  const reverse = data.outside.filter(o => o.key === 'tineye' || o.key === 'lens');
  const grouped = reverse.length ? [{key: 'reverse', label: 'Reverse-image search: send only the item’s public address', to: 'To a reverse-image site (third party)',
    sends: reverse[0].sends ?? null, available: reverse.some(o => o.available), why_not: reverse[0].why_not ?? null}] : [];
  const options = data.source_protected ? [local] : [local, ...grouped, ...data.outside.filter(o => !reverse.includes(o))];
  const [service, setService] = useState<'tineye' | 'lens'>('tineye');
  const firstSend = options.find(o => o.key !== 'local' && o.available)?.key;
  const [choice, setPicked] = useState<string>(firstSend ?? 'local');
  // A source-protected item can only be compared here, whatever was picked before it was marked.
  const picked = data.source_protected ? 'local' : choice;
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const option = options.find(o => o.key === picked) ?? local;
  const run = async () => {
    setBusy(true);
    try {
      if (picked === 'local') {
        const out = (await compareAuthenticity({path: {document_id: documentId}, throwOnError: true})).data;
        setResult(out.text + (out.matches.length ? ` ${out.matches.map(m => String((m as {filename?: string}).filename)).join(', ')}.` : ''));
      } else {
        const out = (await outsideAuthenticity({path: {document_id: documentId}, body: {option: picked === 'reverse' ? service : picked as 'web'}, throwOnError: true})).data;
        window.open(out.url, '_blank', 'noopener,noreferrer');
        setResult(`Sent to ${out.service} and logged. It opened in a new tab.`);
      }
      onLogged();
    } catch (e) { setResult(errorMessage(e, 'Nothing was sent')); }
    setBusy(false);
  };
  return <section className={data.source_protected ? 'ir-panel ir-blocked' : 'ir-panel ir-consent'} aria-label="Before anything is sent">
    {data.source_protected ? <>
      <p className="ir-cap ir-badcap">Sending is blocked <span className="ir-tag ir-bad">Source-protected</span></p>
      <p className="ir-small">This item is marked source-protected. Anything sent to a third party could show what you are looking at, or reveal the source. Nothing is sent from here.</p>
      <p className="ir-small"><b>Still possible, on this computer:</b></p>
    </> : <p className="ir-cap">Before anything is sent <span className="ir-tag">Consent card</span></p>}
    <div className="ir-options" role="radiogroup" aria-label="Checks">{options.map(o => <button key={o.key} type="button" role="radio" aria-checked={picked === o.key}
      disabled={!o.available} onClick={() => { setPicked(o.key); setResult(''); }}>
      <b>{o.label}</b><small>{o.available ? o.to : o.why_not}</small></button>)}</div>
    {picked === 'reverse' && <div className="ir-services" role="group" aria-label="Which reverse-image site">{reverse.map(o =>
      <button key={o.key} type="button" aria-pressed={service === o.key} onClick={() => setService(o.key as 'tineye' | 'lens')}>{o.key === 'tineye' ? 'TinEye' : 'Google Lens'}</button>)}</div>}
    {picked !== 'local' && option.sends && <div className="ir-sent"><span>Exactly this is sent:</span><code>{option.sends}</code></div>}
    {picked !== 'local' && <p className="ir-small">To a service you do not control. It is logged here: what, to whom, when, and why you allowed it.</p>}
    <div className="ir-acts">
      {picked === 'local'
        ? <button type="button" className="ir-ghost" disabled={busy} onClick={() => void run()}>{busy ? 'Comparing…' : 'Run it here'}</button>
        : <><button type="button" className="ir-primary" disabled={busy || !option.available} onClick={() => void run()}>Allow once &amp; send</button>
          <button type="button" className="ir-ghost" onClick={() => { setPicked('local'); setResult('Nothing was sent.'); }}>Don’t send</button></>}
    </div>
    {result && <p className="ir-small" role="status">{result}</p>}
  </section>;
}

function History({rows, onAgain}: {rows: AuthenticityHistoryOut[]; onAgain: () => void}): ReactElement {
  return <section className="ir-panel ir-history" aria-label="History">
    <p className="ir-cap">History <span className="ir-dim">append-only</span></p>
    <ol>{rows.map(h => <li key={h.id} data-actor={h.actor} data-kind={h.kind}>
      <time className="ir-mono">{clockOf(h.at)}</time>
      <p><b className="ir-mono">{h.actor === 'system' ? 'System' : 'You'}</b> {h.text}</p>
    </li>)}</ol>
    <button type="button" className="ir-ghost ir-again" onClick={onAgain}>Read the findings again</button>
  </section>;
}

/** The Check stage's part: the case's files, each with its standing, most in need of a look first (a review flag, a
 *  synthetic or disputed status), and the way into "Is it real?" for each. */
export function RealnessList({investigationId}: {investigationId: string}): ReactElement {
  const open = useWorkbenchStore(state => state.openRealness);
  const docs = useQuery({...listDocumentsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data ?? [];
  const standing = new Map((useQuery({...listAuthenticityOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data ?? [])
    .map(s => [s.document_id, s]));
  const weight = (id: string) => {
    const s = standing.get(id);
    if (!s) return 2;
    return s.status === 'confirmed_synthetic' || s.status === 'likely_synthetic' || s.status === 'disputed' ? 0 : s.flagged && s.status === 'unverified' ? 1 : 3;
  };
  const rows = [...docs].filter(d => !d.parent_document_id).sort((a, b) => weight(a.id) - weight(b.id));
  return <section className="ir-list" aria-label="Is it real?">
    <p className="ir-small">The system records what it found about each file; only you set a status, with reasons. Nothing is sent unless you allow it, once.</p>
    {!rows.length ? <p className="ir-small">No files in this case yet.</p> : <ul>{rows.slice(0, 60).map(d => {
      const s = standing.get(d.id);
      return <li key={d.id}><button type="button" onClick={() => open(d.id)}>
        <span className="ir-list-name">{d.filename}</span>
        {s?.flagged && s.status === 'unverified' && <em className="ir-chip">Review flag</em>}
        {s?.source_protected && <em className="ir-chip ir-bad">Source-protected</em>}
        <span className="ir-status" data-status={s?.status ?? 'unverified'}>{s ? statusLabel(s.status) : 'Not looked at'}</span>
      </button></li>;
    })}</ul>}
  </section>;
}
