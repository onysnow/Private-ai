'use client';
// The glossary page (docs/discovery/indicators.md, "The glossary page"): every
// term of the indicator catalogue with its definition, examples, sources, cases
// to look up, related terms and the indicators that use it; search, a filter
// by area, and each indicator opened in full beside the list. ?indicator=ID
// opens one (Red Flag cards link here); ?q= and ?area= set the search.
import {keepPreviousData, useQuery} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

// Connects the generated client to the shared ApiClient, as every page that calls the API does.
import '../../lib/api-instance';
import {errorMessage} from '../../lib/api-client';
import {getIndicatorOptions, listAreasOptions, searchGlossaryOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {GlossaryTermOut} from '../../lib/generated/types.gen';
import {QueryProvider} from '../../lib/query-client';
import {GlossaryText} from '../../features/glossary/glossary-text';

const OUTCOME: Record<string, string> = {
  convicted: 'Convicted', settled: 'Settled', fined_by_regulator: 'Fined by a regulator',
  found_by_official_inquiry: 'Found by an official inquiry', alleged_in_reporting: 'Alleged in published reporting',
};
const CHECKABLE: Record<string, string> = {
  records: 'From the investigation’s own records', lookups: 'After outside lookups', person: 'Only by a person reading documents or interviews',
};

function setParam(key: string, value: string | null): void {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  window.history.replaceState(window.history.state, '', url.href);
}

function IndicatorDetail({id, onClose}: {id: string; onClose: () => void}): ReactElement {
  const query = useQuery({...getIndicatorOptions({path: {indicator_id: id}})});
  const ind = query.data;
  return <aside className="gl-detail" aria-label={`Indicator ${id}`}>
    <button type="button" className="wb-drawer-close" onClick={onClose} aria-label="Close the indicator">×</button>
    {query.isError && <p className="sv-error">{errorMessage(query.error, 'Could not load the indicator')}</p>}
    {ind && <>
      <p className="wb-eyebrow">{ind.id} · {ind.area_name}{ind.status === 'pending' ? ' · pending checks' : ''}</p>
      <h2>{ind.name}</h2>
      <p><GlossaryText text={ind.definition}/></p>
      <h4>Levels</h4>
      <dl className="gl-levels">
        <dt>Faint</dt><dd><GlossaryText text={ind.levels.faint}/></dd>
        <dt>Strong</dt><dd><GlossaryText text={ind.levels.strong}/></dd>
        <dt>Textbook</dt><dd><GlossaryText text={ind.levels.textbook}/></dd>
      </dl>
      {ind.levels.threshold_source !== 'none' && <p className="gl-small">Numbers from: {ind.levels.threshold_source}</p>}
      {ind.levels.threshold_note && <p className="gl-small"><b>About the numbers.</b> {ind.levels.threshold_note}</p>}
      <h4>Could be innocent</h4>
      <ul>{ind.innocent_explanations.map((t, i) => <li key={i}><GlossaryText text={t}/></li>)}</ul>
      {ind.examples.length > 0 && <><h4>What it looks like</h4><ul>{ind.examples.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
      <h4>How it can be checked</h4>
      <p>{CHECKABLE[ind.checkable]}{ind.lookup_sources.length ? `: ${ind.lookup_sources.join(', ')}` : ''}</p>
      {ind.data_needed.length > 0 && <p className="gl-small">Data needed: {ind.data_needed.join('; ')}</p>}
      <h4>Sources</h4>
      <ul className="gl-sources">{ind.sources.map((s, i) => <li key={i}>
        <a href={s.url} target="_blank" rel="noreferrer">{s.publisher}, {s.title}{s.year ? ` (${s.year})` : ''}</a>{s.locator ? `, ${s.locator}` : ''}
        <blockquote>“{s.quote}”</blockquote>{!s.quote_verified && <small className="sv-error">Quote not yet confirmed at the source.</small>}
      </li>)}</ul>
      {ind.cases.length > 0 && <><h4>Cases to look up</h4><ul className="gl-cases">{ind.cases.map((c, i) => <li key={i}>
        <b>{c.name}</b> ({c.year}, {c.jurisdiction}) · <span className={`gl-outcome ${c.outcome}`}>{OUTCOME[c.outcome] ?? c.outcome}</span>
        <p>{c.what_happened}</p><a href={c.source_url} target="_blank" rel="noreferrer">{c.source_title || 'Source'}</a></li>)}</ul></>}
      {ind.cross_hints.length > 0 && <><h4>This may also point to</h4><ul>{ind.cross_hints.map((h, i) => <li key={i}>
        <b>{String(h.target_area)}</b>: <GlossaryText text={String(h.reason)}/> <a href={String(h.source_url)} target="_blank" rel="noreferrer">source</a></li>)}</ul></>}
      {ind.jurisdictions && <p className="gl-small">Where it applies: {ind.jurisdictions}</p>}
    </>}
  </aside>;
}

function Term({term, onIndicator}: {term: GlossaryTermOut; onIndicator: (id: string) => void}): ReactElement {
  return <article className="gl-term" id={`term-${term.term.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
    <h3>{term.term} <small>{term.areas.join(' · ')}</small></h3>
    <p><GlossaryText text={term.definition} skip={term.term}/></p>
    {term.examples.length > 0 && <p className="gl-small"><b>Examples.</b> {term.examples.join(' · ')}</p>}
    {term.cases.length > 0 && <p className="gl-small"><b>Cases to look up.</b> {term.cases.join(' · ')}</p>}
    {term.related.length > 0 && <p className="gl-small"><b>Related.</b> {term.related.join(' · ')}</p>}
    <p className="gl-small">{term.areas.includes('APP') ? <a href={term.source_url}>Where it is in the app</a> : <a href={term.source_url} target="_blank" rel="noreferrer">Source</a>}
      {term.indicators.length > 0 && <> · <b>Used by</b> {term.indicators.map(id => <button type="button" key={id} className="gl-ind" onClick={() => onIndicator(id)}>{id}</button>)}</>}
    </p>
  </article>;
}

function Glossary(): ReactElement {
  const [q, setQ] = useState('');
  const [area, setArea] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQ(params.get('q') ?? '');
    setArea(params.get('area'));
    setOpen(params.get('indicator'));
  }, []);
  const areas = useQuery({...listAreasOptions()}).data ?? [];
  const page = useQuery({...searchGlossaryOptions({query: {q, ...(area ? {area} : {}), limit: 200}}), placeholderData: keepPreviousData});
  const openIndicator = (id: string | null) => { setOpen(id); setParam('indicator', id); };

  return <div className="gl-page">
    <header className="wb-head">
      <div>
        <p className="wb-eyebrow">Indicator catalogue</p>
        <h1>Glossary</h1>
        <p className="wb-tagline">Every term the catalogue uses, in plain words, with examples, sources and cases to look up.</p>
      </div>
    </header>
    <div className="gl-tools">
      <label className="sv-sbox"><input value={q} placeholder="Search terms and definitions…" aria-label="Search the glossary"
        onChange={(e: ChangeEvent<HTMLInputElement>) => { setQ(e.target.value); setParam('q', e.target.value || null); }}/></label>
      <div className="gl-areas" role="group" aria-label="Area">
        <button type="button" className="cf-chip" aria-pressed={area === null} onClick={() => { setArea(null); setParam('area', null); }}>All areas</button>
        {areas.map(a => <button type="button" key={a.key} className="cf-chip" aria-pressed={area === a.key} title={a.scope}
          onClick={() => { setArea(a.key); setParam('area', a.key); }}>{a.name} · {a.terms}</button>)}
      </div>
    </div>
    <div className={`gl-body${open ? ' with-detail' : ''}`}>
      <section aria-label="Terms">
        {page.isError && <p className="sv-error">{errorMessage(page.error, 'Could not load the glossary')}</p>}
        {page.data && <p className="sv-muted">{page.data.total} {page.data.total === 1 ? 'term' : 'terms'}{page.data.total > page.data.terms.length ? `, the first ${page.data.terms.length} shown` : ''}</p>}
        {page.data?.terms.map(t => <Term key={t.term} term={t} onIndicator={openIndicator}/>)}
      </section>
      {open && <IndicatorDetail id={open} onClose={() => openIndicator(null)}/>}
    </div>
  </div>;
}

export default function GlossaryPage(): ReactElement {
  return <QueryProvider><Glossary/></QueryProvider>;
}
