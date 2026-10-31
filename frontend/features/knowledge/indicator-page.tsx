'use client';
// Panel C of the catalogue explorer, the indicator page (mockup KNOWLEDGE_KEEP_1, research Knowledge §4): what the
// sign is, the level ladder (a step with no published number is a dashed "not set", never guessed; the step this
// case meets is tagged), "Could be innocent" first and "Signs" beside it with equal weight, how it is checked and
// what that needs from outside, the first source with its quote, the first case with its outcome in its own style,
// and this case's flags for it. A step or quote not yet confirmed is dashed, never error red.
import {useQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {caseHref} from '../../lib/case-href';
import {errorMessage} from '../../lib/api-client';
import {getIndicatorOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {CatalogueIndicatorOut, CatalogueIndicatorRowOut} from '../../lib/generated/types.gen';
import {Reveal} from '../../components/ui/reveal';
import {GlossaryText} from '../glossary/glossary-text';
import type {CaseLayer} from './case-layer';
import {HOW_CHECKED, UNSET_LEVEL} from './families';
import {FlagLevelChip, HowGlyph} from './indicator-list';

const OUTCOME: Record<string, string> = {
  convicted: 'Convicted', acquitted: 'Acquitted', settled: 'Settled', fined_by_regulator: 'Fined by a regulator',
  found_by_official_inquiry: 'Found by an official inquiry', alleged_in_reporting: 'Alleged in reporting',
};
const CHECKED_BY: Record<string, string> = {
  records: 'From the case’s own records', lookups: 'Outside lookups', person: 'Only a person reading documents or interviews',
};
const STEPS = ['faint', 'strong', 'textbook'] as const;
const STEP_NAME: Record<string, string> = {faint: 'Faint', strong: 'Strong', textbook: 'Textbook'};

export function IndicatorPage({id, row, layer, preview}: {
  id: string; row: CatalogueIndicatorRowOut | undefined; layer: CaseLayer; preview: boolean;
}): ReactElement {
  const query = useQuery({...getIndicatorOptions({path: {indicator_id: id}}), enabled: Boolean(id), staleTime: Infinity});
  if (!id) return <section className="kc-panel kc-page" aria-label="Indicator"><p className="kc-quiet">Choose an indicator to read it in full.</p></section>;
  return <section className={`kc-panel kc-page${preview ? ' preview' : ''}`} aria-label={`Indicator ${id}`} aria-live={preview ? 'polite' : undefined}>
    {query.isError && <p className="kc-error" role="alert">{errorMessage(query.error, 'Could not load the indicator')}</p>}
    {query.isPending && <><p className="kc-eyebrow">{id}</p><div className="kc-skeleton tall" aria-hidden="true"/></>}
    {query.data && <Body ind={query.data} row={row} layer={layer} preview={preview}/>}
  </section>;
}

function Body({ind, row, layer, preview}: {ind: CatalogueIndicatorOut; row: CatalogueIndicatorRowOut | undefined; layer: CaseLayer; preview: boolean}): ReactElement {
  const [allSources, setAllSources] = useState(false);
  const [checked, setChecked] = useState('');
  const flags = layer.flags.get(ind.id) ?? [];
  const meets = flags[0]?.level;
  const verified = ind.status === 'verified';
  const how = HOW_CHECKED[ind.checkable];
  const source = ind.sources[0];
  const hasRule = Boolean(row?.rule);
  const levels = ind.levels as unknown as Record<string, string> & {threshold_source: string; threshold_note?: string | null};

  const check = async () => {
    setChecked('');
    await layer.refetch();
    setChecked('Checked just now on this case’s records.');
  };
  const reason = !layer.investigationId ? 'Open a case first.' : !hasRule
    ? `No rule checks this on records yet: it is checked ${how.long}.` : '';

  return <article className="kc-ind">
    {/* The id names the indicator across Learn; its area and version are on the ✓ / ○ mark, on hover or focus (Ony, 29 Oct). */}
    <p className="kc-eyebrow">{preview && <span className="kc-preview-tag">Preview · </span>}{ind.id}{' '}
      <Reveal describe={false} detail={<><b>{verified ? 'Verified' : 'Pending checks'}</b><span className="rv-row">{ind.area_name}</span><span className="rv-row">Version {ind.version}</span></>}>
        {verified ? <span className="kc-verified">✓<span className="sr-only"> Verified · {ind.area_name} · version {ind.version}</span></span>
          : <span className="kc-pending-tag">○<span className="sr-only"> Pending checks · {ind.area_name} · version {ind.version}</span></span>}</Reveal></p>
    <h2 className="kc-ind-name">{ind.name}</h2>
    {!verified && <p className="kc-banner-pending">Pending checks: not used for Red Flags yet.</p>}
    <p className="kc-def"><GlossaryText text={ind.definition}/></p>

    {layer.investigationId && <InThisCase ind={ind} layer={layer} hasRule={hasRule}/>}

    <ol className="kc-ladder" aria-label="Levels">
      {STEPS.map(step => {
        const text = levels[step] ?? '';
        const unset = !text || UNSET_LEVEL.test(text);
        const here = meets === step;
        return <li key={step} className={`kc-step ${step}${unset ? ' unset' : ''}${here ? ' here' : ''}`}
          aria-label={`${STEP_NAME[step]}, ${STEPS.indexOf(step) + 1} of 3, ${unset ? 'not set' : text}${here ? ', this case meets it' : ''}`}>
          {/* Learn teaches the levels, so here each step names its level in words. */}
          <span className="kc-step-top"><FlagLevelChip level={step} showWord/>{here && <span className="kc-this-case">This case</span>}</span>
          <span className="kc-step-text">{unset ? 'No published number yet. Shown as “not set”, never guessed.' : <GlossaryText text={text}/>}</span>
        </li>;
      })}
    </ol>
    {/* Where the numbers come from stays one click away; whether it is confirmed and the note are on its mark. */}
    {(levels.threshold_source && levels.threshold_source !== 'none' || levels.threshold_note) && <p className="kc-small">
      {levels.threshold_source && levels.threshold_source !== 'none' && <a href={levels.threshold_source} target="_blank" rel="noreferrer">Source of the numbers</a>}{' '}
      <Reveal label={ind.threshold_verified ? 'Numbers confirmed' : 'Numbers not yet confirmed'} detail={<>
        <b>{ind.threshold_verified ? '✓ Confirmed' : '○ Not yet confirmed'}</b>{levels.threshold_note && <span className="rv-row">{levels.threshold_note}</span>}</>}>
        <span aria-hidden="true">{ind.threshold_verified ? '✓' : '○'}</span></Reveal></p>}

    <div className="kc-pair">
      <section aria-label="Could be innocent" className="kc-innocent">
        <h3>✓ Could be innocent</h3>
        <ul>{ind.innocent_explanations.map((t, i) => <li key={i}><GlossaryText text={t}/></li>)}</ul>
      </section>
      <section aria-label="Signs: what it looks like" className="kc-signs">
        <h3>▲ Signs: what it looks like</h3>
        {ind.examples.length ? <ul>{ind.examples.map((t, i) => <li key={i}><GlossaryText text={t}/></li>)}</ul>
          : <p className="kc-quiet">No example in the catalogue yet.</p>}
      </section>
    </div>

    <dl className="kc-facts">
      <dt>Checked by</dt>
      <dd>{ind.data_needed.length > 0
          ? <Reveal label={`Checked ${how.long}`} detail={<><b>Data needed</b><span className="rv-row">{ind.data_needed.join('; ')}</span></>}><HowGlyph how={ind.checkable}/></Reveal>
          : <HowGlyph how={ind.checkable}/>}{' '}{CHECKED_BY[ind.checkable]}{ind.lookup_sources.length ? `: ${ind.lookup_sources.join(', ')}` : ''}.
        {/* What leaves this computer stays on screen. */}
        {ind.checkable === 'lookups' && <span className="kc-outbound">↗ Checking this means asking an outside source</span>}</dd>
      <dt>Sources · {ind.sources.length}</dt>
      <dd>{(allSources ? ind.sources : source ? [source] : []).map((s, i) => <div key={i} className="kc-source">
        <q className="kc-quote">{s.quote}</q>
        {/* The publisher shows; the year, the place in the source and whether the quote is confirmed are on its mark. */}
        <span className="kc-mono kc-small">{s.publisher}{' '}
          <Reveal describe={false} detail={<>{[s.year, s.locator].filter(Boolean).join(' · ')}<span className="rv-row">{s.quote_verified ? 'Quote confirmed' : 'Quote not yet confirmed'}</span></>}>
            {s.quote_verified ? <span>✓<span className="sr-only"> quote confirmed</span></span> : <span className="kc-dashed">○<span className="sr-only"> not yet confirmed</span></span>}</Reveal>
          <span className="sr-only">{[s.year, s.locator].filter(Boolean).join(' · ')}</span>
          {' · '}<a href={s.url} target="_blank" rel="noreferrer">open</a></span>
      </div>)}</dd>
      {ind.cases.length > 0 && <><dt>Case{ind.cases.length > 1 ? `s · ${ind.cases.length}` : ''}</dt>
        <dd>{(allSources ? ind.cases : ind.cases.slice(0, 1)).map((c, i) => <div key={i} className="kc-case">
          <a href={c.source_url} target="_blank" rel="noreferrer">{c.name}</a> · {c.jurisdiction} · {c.year}{' '}
          <span className={`kc-outcome ${c.outcome}`}>{c.outcome === 'alleged_in_reporting' ? '○ ' : ''}{OUTCOME[c.outcome] ?? c.outcome}</span>
          {allSources && <p className="kc-small">{c.what_happened}</p>}
        </div>)}</dd></>}
      {allSources && ind.cross_hints.length > 0 && <><dt>May also point to</dt>
        <dd>{ind.cross_hints.map((h, i) => <div key={i}><b className="kc-mono">{String(h.target_area)}</b> <GlossaryText text={String(h.reason)}/>{' '}
          <a href={String(h.source_url)} target="_blank" rel="noreferrer">source</a></div>)}</dd></>}
      {allSources && ind.jurisdictions && <><dt>Where it applies</dt><dd>{ind.jurisdictions}</dd></>}
    </dl>

    {!preview && <footer className="kc-actions">
      <button type="button" className="kc-btn primary" disabled={Boolean(reason) || layer.refetching} onClick={check}
        aria-describedby={reason ? `kc-why-${ind.id}` : undefined}>{layer.refetching ? 'Checking…' : 'Check this in my case'}</button>
      <Reveal tabbable={false} describe={false} detail="Flip cards come with Practise, not built yet.">
        <button type="button" className="kc-btn" disabled aria-describedby={`kc-why-flip-${ind.id}`}>＋ Flip card</button></Reveal>
      <button type="button" className="kc-btn ghost" aria-expanded={allSources} onClick={() => setAllSources(v => !v)}>
        {allSources ? 'Fewer details' : `${ind.sources.length} ${ind.sources.length === 1 ? 'source' : 'sources'}`}</button>
      <Reveal tabbable={false} describe={false} detail="Suggestions need a place to send them, not built yet.">
        <button type="button" className="kc-btn ghost" disabled aria-describedby={`kc-why-suggest-${ind.id}`}>Suggest change</button></Reveal>
      <p className="kc-why">
        {reason && <span id={`kc-why-${ind.id}`}>{reason} </span>}
        {checked && <span role="status">{checked} </span>}
        {/* Why a control is not built yet is sub-text: on the control, on hover, and here for screen readers. The reason
            the main action is blocked stays on screen. */}
        <span id={`kc-why-flip-${ind.id}`} className="sr-only">Flip cards come with Practise, not built yet. </span>
        <span id={`kc-why-suggest-${ind.id}`} className="sr-only">Suggestions need a place to send them, not built yet.</span>
      </p>
    </footer>}
  </article>;
}

function InThisCase({ind, layer, hasRule}: {ind: CatalogueIndicatorOut; layer: CaseLayer; hasRule: boolean}): ReactElement {
  const flags = layer.flags.get(ind.id) ?? [];
  const href = caseHref('/act#red-flags', layer.investigationId);
  if (layer.error) return <div className="kc-incase-box quiet"><b>In this case:</b> could not read the case’s Red Flags.</div>;
  if (layer.loading) return <div className="kc-incase-box quiet"><b>In this case:</b> reading the case’s Red Flags…</div>;
  if (flags.length) {
    const f = flags[0];
    return <div className="kc-incase-box">
      <b>In this case:</b> {f.summary} <FlagLevelChip level={f.level}/>
      {flags.length > 1 && <> and {flags.length - 1} more</>}. {f.not_shown.length > 0 && <span className="kc-small">Records can’t show: {f.not_shown[0]}</span>}
      {' '}<Link href={href}>Open in Red Flags</Link>
    </div>;
  }
  if (hasRule && layer.ran.has(ind.id)) return <div className="kc-incase-box quiet"><b>In this case:</b> the rule ran on the case’s records and did not fire. Records can’t show everything; no flag is not a finding.</div>;
  return <div className="kc-incase-box quiet"><b>In this case:</b> not checked yet.{' '}
    {hasRule ? 'Its rule has not run on this case: the records it needs are not there yet.' : `No rule checks it on records; it is checked ${HOW_CHECKED[ind.checkable].long}.`}</div>;
}
