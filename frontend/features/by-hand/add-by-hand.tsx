'use client';

// Add by hand (mockup ENTRY_1; backend app/services/manual_entry.py): a party, a link or an event a reporter knows,
// written as a sentence with blanks, and where it comes from. Beside it, before anything is written: where a link
// lands, what it would change (a dry run of the Red Flag rules), and what the case already holds or has waiting in
// Decide. Kinds are never guessed: a new party's kind is picked, "not known" included.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useMemo, useState} from 'react';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {byHandSuggestOptions, listDocumentsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {byHandAdd, byHandPreview} from '../../lib/generated/sdk.gen';
import type {ByHandHitOut, ByHandSuggestionOut, EntryIn, SourceIn} from '../../lib/generated/types.gen';

type Kind = 'party' | 'link' | 'event';
type PartyKind = 'Company' | 'Person' | 'Organization' | 'PublicBody' | 'LegalEntity';
type Slot = {id: string | null; text: string; kind: PartyKind | null};
const EMPTY: Slot = {id: null, text: '', kind: null};

export const LINK_WORDS: Record<string, string> = {
  Payment: 'paid', Ownership: 'owns', Directorship: 'is a director of', Membership: 'is a member of', Employment: 'works for', UnknownLink: 'is linked to',
};
const KIND_WORDS: Record<PartyKind, string> = {Company: 'a company', Person: 'a person', Organization: 'an organisation', PublicBody: 'a public body', LegalEntity: 'kind not known'};

/** How precise a typed date is, from its form: 2019 · 2019-03 · 2019-03-03. */
export function precisionOf(date: string): 'year' | 'month' | 'day' | null {
  const d = date.trim();
  if (/^\d{4}$/.test(d)) return 'year';
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(d)) return 'month';
  if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d)) return 'day';
  return null;
}

/** The link's properties as FollowTheMoney names them, for its kind. */
export function linkProperties(schema: string, amount: string, currency: string, date: string, purpose: string): Record<string, string[]> {
  const p: Record<string, string[]> = {};
  const n = amount.replace(/[,\s]/g, '');
  if (schema === 'Payment') {
    if (n) p.amount = [n];
    if (currency.trim()) p.currency = [currency.trim().toUpperCase()];
    if (date.trim()) p.date = [date.trim()];
    if (purpose.trim()) p.purpose = [purpose.trim()];
  } else {
    if (schema === 'Ownership' && n) p.percentage = [n];
    if (date.trim()) p.startDate = [date.trim()];
  }
  return p;
}

function PartySlot({investigationId, label, value, onChange, autoFocus}: {investigationId: string; label: string; value: Slot;
  onChange: (s: Slot) => void; autoFocus?: boolean}): ReactElement {
  const [open, setOpen] = useState(false);
  const typed = value.id ? '' : value.text;
  const found = useQuery({...byHandSuggestOptions({path: {investigation_id: investigationId}, query: {q: typed}}), enabled: open && typed.trim().length >= 2}).data ?? [];
  const pick = (s: ByHandSuggestionOut) => { onChange({id: s.id, text: s.caption, kind: null}); setOpen(false); };
  return <span className="bh-slotwrap">
    <label className={`bh-slot${value.id ? ' known' : value.text ? '' : ' empty'}`}>
      <small>{label}</small>
      <input value={value.text} autoFocus={autoFocus} aria-label={label} placeholder="type a name" style={{width: `${Math.max(10, value.text.length + 1)}ch`}}
        onChange={e => { onChange({id: null, text: e.target.value, kind: value.kind}); setOpen(true); }} onFocus={() => setOpen(true)}/>
      {value.id && <span className="bh-chip teal" title="A record of this case">in the case</span>}
    </label>
    {open && !value.id && typed.trim().length >= 2 && <span className="bh-suggest" role="listbox" aria-label={`Parties matching ${typed}`}>
      {found.map(s => <button key={s.id} type="button" role="option" aria-selected="false" onClick={() => pick(s)}>
        <span className="bh-chip teal">{s.as === 'its name' ? 'in the case' : 'also known as'}</span>
        <span><b>{s.as === 'its name' ? s.caption : s.matched}</b><small>{s.as === 'its name' ? `${s.schema}${s.country ? ` · ${s.country}` : ''}` : `another name of ${s.caption}`}</small></span>
      </button>)}
      <span className="bh-new" role="group" aria-label={`Add “${typed}” as a new party`}>
        <span className="bh-chip dash">new</span><span><b>Add “{typed}” as a new party</b><small>Its kind, picked by you, never guessed:</small>
          <span className="bh-kinds">{(Object.keys(KIND_WORDS) as PartyKind[]).map(k => <button key={k} type="button" aria-pressed={value.kind === k}
            onClick={() => { onChange({id: null, text: typed, kind: k}); setOpen(false); }}>{KIND_WORDS[k]}</button>)}</span></span>
      </span>
    </span>}
    {!value.id && value.kind && <small className="bh-newnote">new · {KIND_WORDS[value.kind]}</small>}
  </span>;
}

const end = (s: Slot) => (s.id ? {entity_id: s.id} : {new: {caption: s.text.trim(), schema: s.kind ?? 'LegalEntity'}});
const ready = (s: Slot) => Boolean(s.id || (s.text.trim() && s.kind));

function Hits({title, hits}: {title: string; hits: ByHandHitOut[]}): ReactElement | null {
  if (!hits.length) return null;
  return <><p className="bh-sub">{title}</p><ul className="bh-list">{hits.map(h => <li key={`${h.kind}-${h.id}`}><b className="bh-ico amber" aria-hidden="true">!</b>
    <span>{h.kind === 'link' ? `A ${String(h.schema ?? 'link').toLowerCase()} link between these two${h.same ? ', the same way round' : ''} is already in the case.`
      : h.kind === 'proposal' ? `“${h.caption ?? ''}” waits in Decide${h.schema ? ` as a ${String(h.schema).toLowerCase()}` : ''}: answer that one instead?`
      : h.kind === 'event' ? `“${h.caption ?? ''}” is already on the timeline on that date.`
      : `${h.caption ?? ''} (${h.schema ?? ''}) is already in the case, under ${h.as ?? 'that name'}.`}</span></li>)}</ul></>;
}

export function AddByHand({investigationId}: {investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>('link');
  const [a, setA] = useState<Slot>(EMPTY);
  const [b, setB] = useState<Slot>(EMPTY);
  const [schema, setSchema] = useState('Payment');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [date, setDate] = useState('');
  const [purpose, setPurpose] = useState('');
  const [partyKind, setPartyKind] = useState<PartyKind | null>(null);
  const [country, setCountry] = useState('');
  const [title, setTitle] = useState('');
  const [where, setWhere] = useState('');
  const [mode, setMode] = useState<SourceIn['mode']>('passage');
  const [docId, setDocId] = useState('');
  const [quote, setQuote] = useState('');
  const [locator, setLocator] = useState('');
  const [srcTitle, setSrcTitle] = useState('');
  const [srcType, setSrcType] = useState<NonNullable<SourceIn['source_type']>>('interview');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const docs = (useQuery({...listDocumentsOptions({path: {investigation_id: investigationId}}), enabled: mode === 'passage'}).data ?? [])
    .filter(d => d.extraction_status === 'complete');
  const precision = precisionOf(date);

  const entry: EntryIn | null = useMemo(() => {
    if (kind === 'party') return a.text.trim() && partyKind ? {kind, party: {caption: a.text.trim(), schema: partyKind, country: country.trim() || null}} : null;
    if (kind === 'link') return ready(a) && ready(b) ? {kind, link: {schema, source: end(a), target: end(b), properties: linkProperties(schema, amount, currency, date, purpose)}} : null;
    return title.trim() && precision ? {kind, event: {title: title.trim(), date: date.trim(), precision: precision === 'year' ? 'year' : precision, where: where.trim() || null,
      entity_ids: [a.id, b.id].filter((x): x is string => Boolean(x))}} : null;
  }, [kind, a, b, schema, amount, currency, date, purpose, partyKind, country, title, where, precision]);
  // The preview writes nothing: asked again as the sentence changes.
  const preview = useQuery({queryKey: ['by-hand-preview', investigationId, entry], enabled: Boolean(entry), staleTime: 0,
    queryFn: async () => (await byHandPreview({path: {investigation_id: investigationId}, body: entry as EntryIn, throwOnError: true})).data});
  const source: SourceIn = mode === 'passage' ? {mode, document_id: docId || null, quote: quote.trim() || null, locator: locator.trim() || null}
    : mode === 'record' ? {mode, title: srcTitle.trim() || null, source_type: srcType, notes: notes.trim() || null} : {mode};
  const sourceReady = mode === 'none' || (mode === 'passage' ? Boolean(docId && quote.trim()) : Boolean(srcTitle.trim()));
  useEffect(() => { setStatus(''); }, [kind]);

  const reset = () => { setA(EMPTY); setB(EMPTY); setAmount(''); setDate(''); setPurpose(''); setTitle(''); setWhere(''); setQuote(''); setLocator(''); setPartyKind(null); setCountry(''); };
  const add = async (another: boolean) => {
    if (!entry || !sourceReady) return;
    setBusy(true);
    try {
      const made = (await byHandAdd({path: {investigation_id: investigationId}, body: {...entry, source}, throwOnError: true})).data;
      setStatus(`Added: the ${made.record_type}${made.evidence_id ? ', with its evidence' : ''}${made.lead_id ? ', and a lead to find its source' : ''}${made.parties.length ? `, and ${made.parties.length} new part${made.parties.length === 1 ? 'y' : 'ies'}` : ''}.`);
      void queryClient.invalidateQueries();
      if (another) { setQuote(''); setLocator(''); setTitle(''); setAmount(''); setDate(''); setPurpose(''); setB(EMPTY); } else reset();
    } catch (error) { setStatus(errorMessage(error, 'It could not be added')); }
    setBusy(false);
  };
  const changes = preview.data?.changes ?? [];

  return <div className="bh" aria-label="Add by hand">
    <div className="bh-head">
      <p className="bh-lede">Something you know that no document the app read has said yet. Write it as a sentence; the app asks where it comes from.</p>
      <div className="bh-kinds big" role="group" aria-label="What to add">
        {(['party', 'link', 'event'] as Kind[]).map(k => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'party' ? 'A party' : k === 'link' ? 'A link' : 'An event'}</button>)}
      </div>
    </div>
    <div className="bh-grid">
      <div className="bh-col">
        <section className="bh-panel hot" aria-label="The sentence">
          <p className="bh-cap">The {kind}, as a sentence <span>each blank is a record or a value</span></p>
          {kind === 'link' ? <p className="bh-sentence">
            <PartySlot investigationId={investigationId} label="party" value={a} onChange={setA} autoFocus/>
            <label className="bh-slot"><small>link</small><select value={schema} onChange={e => setSchema(e.target.value)} aria-label="Link">
              {Object.entries(LINK_WORDS).map(([s, w]) => <option key={s} value={s}>{w}</option>)}</select></label>
            <PartySlot investigationId={investigationId} label="party" value={b} onChange={setB}/>
            {(schema === 'Payment' || schema === 'Ownership') && <label className={`bh-slot${amount ? '' : ' empty'}`}><small>{schema === 'Payment' ? 'amount' : 'per cent'}</small>
              <input value={amount} onChange={e => setAmount(e.target.value)} aria-label={schema === 'Payment' ? 'Amount' : 'Per cent'} placeholder={schema === 'Payment' ? '29,400' : '60'} inputMode="decimal"/>
              {schema === 'Payment' && <input className="bh-cur" value={currency} onChange={e => setCurrency(e.target.value)} aria-label="Currency" maxLength={3}/>}</label>}
            <span>{schema === 'Payment' ? 'on' : 'from'}</span>
            <label className={`bh-slot${date ? '' : ' empty'}`}><small>date</small><input value={date} onChange={e => setDate(e.target.value)} aria-label="Date" placeholder="2019-03-03, 2019-03 or 2019"/></label>
            <Precision value={precision} date={date}/>
            {schema === 'Payment' && <><span>, for</span><label className={`bh-slot${purpose ? '' : ' empty'}`}><small>purpose</small>
              <input value={purpose} onChange={e => setPurpose(e.target.value)} aria-label="Purpose" placeholder="not known"/></label></>}
          </p>
          : kind === 'party' ? <p className="bh-sentence">
            <label className={`bh-slot${a.text ? '' : ' empty'}`}><small>name</small><input value={a.text} autoFocus onChange={e => setA({id: null, text: e.target.value, kind: null})} aria-label="Name" placeholder="type a name"/></label>
            <span>is</span>
            <span className="bh-kinds" role="group" aria-label="Kind">{(Object.keys(KIND_WORDS) as PartyKind[]).map(k => <button key={k} type="button" aria-pressed={partyKind === k} onClick={() => setPartyKind(k)}>{KIND_WORDS[k]}</button>)}</span>
            <span>in</span>
            <label className={`bh-slot${country ? '' : ' empty'}`}><small>country</small><input value={country} onChange={e => setCountry(e.target.value)} aria-label="Country" placeholder="not known"/></label>
          </p>
          : <p className="bh-sentence">
            <label className={`bh-slot${title ? '' : ' empty'}`}><small>what happened</small><input value={title} autoFocus onChange={e => setTitle(e.target.value)} aria-label="What happened" placeholder="the board met on the lease"/></label>
            <span>on</span>
            <label className={`bh-slot${date ? '' : ' empty'}`}><small>date</small><input value={date} onChange={e => setDate(e.target.value)} aria-label="Date" placeholder="2019-03-03, 2019-03 or 2019"/></label>
            <Precision value={precision} date={date}/>
            <span>at</span>
            <label className={`bh-slot${where ? '' : ' empty'}`}><small>place</small><input value={where} onChange={e => setWhere(e.target.value)} aria-label="Place" placeholder="not known"/></label>
            <span>, with</span>
            <PartySlot investigationId={investigationId} label="party" value={a} onChange={s => setA(s.id ? s : {...s, kind: null})}/>
          </p>}
        </section>
        <section className="bh-panel" aria-label="Where does it come from?">
          <p className="bh-cap">Where does it come from? <span>required · it decides what it can carry</span></p>
          <div className="bh-src" role="radiogroup" aria-label="Source">
            {([['passage', 'A passage', 'Words in a document of the case. It starts with them as its evidence.'],
              ['record', 'A source with no file', 'A call, a meeting, a register seen in person. Kept as a source; the custody chain says no file is behind it.'],
              ['none', 'I know it, no source yet', 'Kept as Not yet shown, with a lead to find one. Never counts toward Supported.']] as const).map(([m, t, d]) =>
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}><b>{t}</b><small>{d}</small></button>)}
          </div>
          {mode === 'passage' ? <div className="bh-fields">
            <label>Document<select value={docId} onChange={e => setDocId(e.target.value)}><option value="">Choose a document…</option>
              {docs.map(d => <option key={d.id} value={d.id}>{d.title || d.filename}</option>)}</select></label>
            <label>The words, as the document has them<textarea value={quote} onChange={e => setQuote(e.target.value)} rows={2} placeholder="LOOP TWO BV · 29,400.00 EUR"/></label>
            <label>Where in it (optional)<input value={locator} onChange={e => setLocator(e.target.value)} placeholder="page 3 — found by the words when left empty"/></label>
          </div> : mode === 'record' ? <div className="bh-fields">
            <label>Who or what said it<input value={srcTitle} onChange={e => setSrcTitle(e.target.value)} placeholder="Call with a former board member"/></label>
            <label>Kind<select value={srcType} onChange={e => setSrcType(e.target.value as NonNullable<SourceIn['source_type']>)}>
              <option value="interview">an interview or a call</option><option value="public_record">a public record seen in person</option>
              <option value="document">a document not in the case</option><option value="web">a web page</option><option value="other">something else</option></select></label>
            <label>What it said (your note)<textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}/></label>
          </div> : <p className="bh-note">A lead “Find a source for …” is opened on it.</p>}
        </section>
        <section className="bh-panel" aria-label="Who wrote it">
          <p className="bh-cap">Who wrote it <span>kept on the record and in its custody chain</span></p>
          <p className="bh-note">Typed in by you, now. A person, not the app.</p>
          <div className="bh-acts">
            <button type="button" className="pri" disabled={!entry || !sourceReady || busy} onClick={() => void add(false)}>Add the {kind}</button>
            <button type="button" disabled={!entry || !sourceReady || busy} onClick={() => void add(true)}>Add and write another</button>
          </div>
          {status && <p role="status" className="bh-status">{status}</p>}
        </section>
      </div>
      <div className="bh-col">
        {kind === 'link' && <section className="bh-panel" aria-label="Where it lands">
          <p className="bh-cap t">Where it lands <span>before you add it</span></p>
          <svg className="bh-wire" viewBox="0 0 400 120" role="img" aria-label={`${a.text || 'a party'} ${LINK_WORDS[schema]} ${b.text || 'a party'}`}>
            <line x1="90" y1="60" x2="310" y2="60" className="bh-new-line"/>
            <text x="200" y="30" textAnchor="middle" className="bh-line-label">{LINK_WORDS[schema]}{amount ? ` ${amount}${schema === 'Payment' ? ` ${currency}` : '%'}` : ''} · new</text>
            <rect x="20" y="44" width="140" height="32" rx="8" className={a.id ? 'bh-node known' : 'bh-node'}/><text x="90" y="64" textAnchor="middle">{(a.text || 'party').slice(0, 20)}</text>
            <rect x="240" y="44" width="140" height="32" rx="8" className={b.id ? 'bh-node known' : 'bh-node'}/><text x="310" y="64" textAnchor="middle">{(b.text || 'party').slice(0, 20)}</text>
          </svg>
        </section>}
        <section className="bh-panel" aria-label="What it changes">
          <p className="bh-cap">What it changes <span>a dry run · nothing saved yet</span></p>
          {!entry ? <p className="bh-note">Fill in the blanks to see.</p>
            : changes.length ? <ul className="bh-list">{changes.map(c => <li key={c}><b className="bh-ico amber" aria-hidden="true">◆</b><span>{c}</span></li>)}</ul>
            : <p className="bh-note">{kind === 'link' ? 'No Red Flag rises with it.' : 'It raises no Red Flag on its own.'}{mode === 'none' ? ' With no source it stays Not yet shown.' : ''}</p>}
        </section>
        <section className="bh-panel" aria-label="Already in the case?">
          <p className="bh-cap">Already in the case? <span>checked as you type</span></p>
          {!entry ? <p className="bh-note">Fill in the blanks to see.</p> : preview.isError ? <p role="alert">{errorMessage(preview.error, 'Could not check')}</p>
            : preview.data && !preview.data.already.length && !preview.data.waiting.length ? <p className="bh-note"><b className="bh-ico ok" aria-hidden="true">✓</b> Nothing like it yet.</p>
            : <><Hits title="In the case" hits={preview.data?.already ?? []}/><Hits title="Waiting in Decide" hits={preview.data?.waiting ?? []}/></>}
        </section>
      </div>
    </div>
  </div>;
}

function Precision({value, date}: {value: 'year' | 'month' | 'day' | null; date: string}): ReactElement {
  return <span className="bh-prec" aria-label="Precision">{(['day', 'month', 'year'] as const).map(p => <span key={p} className={value === p ? 'on' : ''}>{p}</span>)}
    {date && !value && <small className="bh-bad">a year, a month or a day: 2019, 2019-03, 2019-03-03</small>}</span>;
}
