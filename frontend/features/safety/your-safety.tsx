'use client';
// "Your safety · shown apart from Red Flags" (mockup KEEP-safety-and-data, right top; research Keep §13). The SA
// indicators of the catalogue that fire in this case, read from its Red Flags (the same engine; shown apart so they are
// never read as findings about anyone), the highest at the top with "This never blocks your work."; the questions only
// the reporter can answer, Yes / No / Not sure, kept private; and the guides, which open outside only after a line
// saying so. Frame in accent-2, never the flag reds; no motion.
import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {LevelChip} from '../../components/status';
import {getRedFlagsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {RedFlagOut, SafetySummaryOut} from '../../lib/generated/types.gen';

const RANK: Record<string, number> = {textbook: 3, strong: 2, faint: 1};
const UNSET = 'To be set by Ony';
const ANSWER_WORDS = {YES: 'Yes', NO: 'No', NOT_SURE: 'Not sure'} as const;
type AnswerValue = keyof typeof ANSWER_WORDS;

// Research Keep §13 "Guides": CPJ Digital Safety Kit ([R6]); "Before you travel" is its "Crossing borders" part.
const GUIDES = [
  {label: 'CPJ Digital Safety Kit', url: 'https://cpj.org/2019/07/digital-safety-kit-journalists/'},
  {label: 'Before you travel', url: 'https://cpj.org/2019/07/digital-safety-kit-journalists/'},
  {label: 'Protect a source', url: 'https://cpj.org/2019/07/digital-safety-kit-journalists/'},
];

/** The case's open safety signs (SA-…), strongest first. */
export function safetySigns(flags: RedFlagOut[] | undefined): RedFlagOut[] {
  return (flags ?? []).filter(f => f.indicator_id.startsWith('SA-') && f.status !== 'dismissed')
    .sort((a, b) => (RANK[b.level] ?? 0) - (RANK[a.level] ?? 0) || b.weight - a.weight);
}

function levelSet(f: RedFlagOut): boolean {
  return !f.indicator || f.indicator.levels[f.level] !== UNSET;
}

function Level({flag}: {flag: RedFlagOut}): ReactElement {
  return levelSet(flag) ? <LevelChip level={flag.level}/> : <span className="sd-chip">level not set</span>;
}

type Props = {
  summary: SafetySummaryOut;
  onAnswer: (question: string, answer: AnswerValue | null) => void;
};

export function YourSafety({summary, onAnswer}: Props): ReactElement {
  const flags = useQuery({...getRedFlagsOptions({path: {investigation_id: summary.investigation_id}})});
  const signs = safetySigns(flags.data?.flags);
  const top = signs[0];
  const [leaving, setLeaving] = useState<string | null>(null);
  return <section className="sd-panel sd-safety" aria-labelledby="sd-safety-title">
    <p className="sd-eyebrow sd-teal">Your safety · shown apart from Red Flags</p>
    <h2 id="sd-safety-title">{flags.isPending ? 'Checking your records…' : signs.length ? `${signs.length === 1 ? '1 sign' : `${signs.length} signs`} about danger to you or your sources`
      : 'No safety signs from your records'}</h2>
    {top && <div className="sd-notice" role="status">
      <Level flag={top}/><p>{top.summary} This never blocks your work.</p>
    </div>}
    {!flags.isPending && !signs.length && <p className="sd-small">{flags.isError ? 'The case’s signs could not be read just now.' : 'Only you can judge the rest.'}</p>}
    <ul className="sd-signs">
      {signs.map(f => <li key={f.id} className="sd-sign" tabIndex={0} aria-describedby={`sd-sign-tip-${f.id}`}>
        <span className="sd-mono sd-id">{f.indicator_id}</span>
        <span><b>{f.indicator?.name ?? f.indicator_id}</b><span className="sd-small sd-block">{f.summary} <Level flag={f}/></span></span>
        <span className="sd-tip" role="tooltip" id={`sd-sign-tip-${f.id}`}>
          {f.indicator?.innocent_explanations?.[0] && <><b>Could be innocent</b> {f.indicator.innocent_explanations[0]}<br/></>}
          {f.indicator?.sources?.[0] && <><b>Source</b> {f.indicator.sources[0].publisher}, {f.indicator.sources[0].title}</>}
        </span>
      </li>)}
      {summary.questions.map(q => <li key={q.id} className="sd-sign sd-question">
        <span className="sd-mono sd-id">Only you</span>
        <span><span id={`sd-q-${q.id}`}>{q.text}</span>
          <span className="sd-answers" role="radiogroup" aria-labelledby={`sd-q-${q.id}`}>
            {(Object.keys(ANSWER_WORDS) as AnswerValue[]).map(a => <button key={a} type="button" role="radio" aria-checked={q.answer === a}
              className={q.answer === a ? 'on' : ''} onClick={() => onAnswer(q.id, q.answer === a ? null : a)}>{ANSWER_WORDS[a]}</button>)}
            <span className="sd-small">· kept private</span>
          </span></span>
      </li>)}
    </ul>
    <div className="sd-guides">
      {GUIDES.map(g => <button key={g.label} type="button" className="sd-guide" aria-expanded={leaving === g.label}
        onClick={() => setLeaving(l => l === g.label ? null : g.label)}>{g.label}{g.label.startsWith('CPJ') && <span aria-hidden="true"> ↗</span>}</button>)}
    </div>
    {leaving && <p className="sd-small sd-leaving">This opens cpj.org in your browser. <a href={GUIDES.find(g => g.label === leaving)!.url} target="_blank" rel="noopener noreferrer">Open {leaving}</a></p>}
  </section>;
}
