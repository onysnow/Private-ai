'use client';
// Your safety (research §13; mockup KEEP-safety-and-data, right top; DECISIONS_LOG 9): signs that the story itself
// raises the danger to the reporter, their sources or witnesses, shown apart from Red Flags and never blocking work.
// Signs from the case's records come from the server; the questions only the reporter can answer, and the safety plan,
// stay in this browser (localStorage): never sent to the server, not in backups, never shared with a team. They go when
// the case is deleted; the app lock does not cover them (lib/case-browser-data.ts, DECISIONS_LOG 59).
import {useQuery} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import type {ReactElement} from 'react';

import {LevelChip} from '../../components/status';
import {Reveal} from '../../components/ui/reveal';
import {getYourSafetyOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {SafetyQuestionOut, SafetySignOut, YourSafetyOut} from '../../lib/generated/types.gen';

export type Answer = 'yes' | 'no' | 'not_sure';
type Kept = {answers: Record<string, Answer>; plan: Record<string, string>};
const EMPTY: Kept = {answers: {}, plan: {}};
const KEY = (investigationId: string) => `workbench.your-safety.${investigationId}`;
export const SAFETY_CHANGED = 'workbench:your-safety';

/** What this browser keeps for the case: the answers and the plan. Never sent anywhere. */
export function readKept(investigationId: string): Kept {
  try {
    const raw = window.localStorage.getItem(KEY(investigationId));
    const parsed = raw ? JSON.parse(raw) as Partial<Kept> : {};
    return {answers: parsed.answers ?? {}, plan: parsed.plan ?? {}};
  } catch { return EMPTY; }
}

function writeKept(investigationId: string, kept: Kept): void {
  try { window.localStorage.setItem(KEY(investigationId), JSON.stringify(kept)); } catch { /* a private window keeps nothing */ }
  window.dispatchEvent(new Event(SAFETY_CHANGED));
}

/** The highest sign: a Yes to a question meets that indicator's published definition as worded (its Textbook). */
export function topSign(questions: Pick<SafetyQuestionOut, 'id' | 'name'>[], answers: Record<string, Answer>): {id: string; name: string} | null {
  return questions.find(q => answers[q.id] === 'yes') ?? null;
}

const PLAN = [
  {key: 'who', label: 'Who knows where you are, and how to reach them'},
  {key: 'checkin', label: 'When you check in, and with whom'},
  {key: 'silence', label: 'What they do if they hear nothing'},
  {key: 'sources', label: 'How you reach sources, and what you never carry'},
];

/** A safety plan's first lines, from the signs: what it has to answer. */
export function planFrom(signs: SafetySignOut[], questions: SafetyQuestionOut[], answers: Record<string, Answer>): string {
  const named = [...signs.map(s => `${s.id} ${s.name}`), ...questions.filter(q => answers[q.id] === 'yes').map(q => `${q.id} ${q.name} (you said yes)`)];
  return named.length ? `This plan answers: ${named.join('; ')}.` : 'No sign yet: a plan is still worth having before you travel or meet a source.';
}

function host(url: string): string {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
}

export function YourSafety({investigationId}: {investigationId: string}): ReactElement {
  const query = useQuery({...getYourSafetyOptions({path: {investigation_id: investigationId}}), retry: false});
  const [kept, setKept] = useState<Kept>(EMPTY);
  const [opening, setOpening] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setKept(readKept(investigationId)); }, [investigationId]);
  const save = (next: Kept) => { setKept(next); writeKept(investigationId, next); };
  const data: YourSafetyOut | undefined = query.data;
  const top = data ? topSign(data.questions, kept.answers) : null;
  const signs = data?.signs ?? [];
  const yes = data?.questions.filter(q => kept.answers[q.id] === 'yes') ?? [];
  const count = signs.length + yes.length;
  const intro = data ? planFrom(signs, data.questions, kept.answers) : '';

  return <section className="sd-panel ys" aria-label="Your safety">
    <p className="sd-eyebrow ys-eyebrow"><Reveal detail="Shown apart from Red Flags, and never blocking your work."><span>Your safety</span></Reveal></p>
    <h3 className="sd-h3">{!data ? 'Checking…' : count ? `${count} ${count === 1 ? 'sign' : 'signs'} about danger to you or your sources` : 'No safety signs from your records'}</h3>
    {query.isError && <p className="sd-quiet">Could not read the signs from your records. The questions below still work.</p>}
    {top && <p className="ys-notice" role="status"><b><LevelChip level="textbook" showWord/></b> {top.name}: you said this has happened. Read the guides below, and tell your editor.
      <span> This never blocks your work.</span></p>}
    <ul className="ys-signs">
      {signs.map(s => <li key={s.id}>
        <span className="ys-id" aria-hidden="true">!</span>
        {/* The name shows; the evidence from the records is two lines, in full on reveal. No level yet: a hollow mark,
            named on reveal (levels are a mark by default, the word on reveal). */}
        <div><p className="ys-name"><Reveal detail={<span className="rv-mono">{s.id}</span>}><span>{s.name}</span></Reveal></p>
          <p className="ys-ev"><Reveal tabbable={false} detail={s.evidence}><span>{s.evidence}</span></Reveal></p>
          <details><summary>It may be nothing</summary><p>{s.innocent[0]}</p><p className="ys-src">{s.source.publisher}: {s.source.title}</p></details></div>
        <Reveal describe={false} detail="Level not set: the catalogue has no Faint or Strong level for safety signs yet, and none is made up here."><span className="ys-level"><span aria-hidden="true">◌</span><span className="st-sr">level not set</span></span></Reveal>
      </li>)}
    </ul>
    {data && <fieldset className="ys-ask">
      <legend>Only you can say <Reveal label="Kept private" detail="Kept private: in this browser only, never sent, not in backups. Deleted with the case. The app lock does not cover it: your disk encryption does."><span aria-hidden="true">🔒</span></Reveal></legend>
      {data.questions.map(q => <div key={q.id} role="radiogroup" aria-label={q.question} className="ys-q">
        <p>{q.question}</p>
        <span>{(['yes', 'no', 'not_sure'] as Answer[]).map(a => <label key={a} className={kept.answers[q.id] === a ? 'on' : ''}>
          <input type="radio" name={`ys-${q.id}`} checked={kept.answers[q.id] === a}
            onChange={() => save({...kept, answers: {...kept.answers, [q.id]: a}})}/>{a === 'not_sure' ? 'Not sure' : a === 'yes' ? 'Yes' : 'No'}</label>)}</span>
        {kept.answers[q.id] === 'not_sure' && <small>Talk it through with your editor or a safety adviser; the guides below help.</small>}
      </div>)}
    </fieldset>}
    {data && <div className="ys-guides">
      {data.guides.map(g => <button key={g.url} type="button" className="sd-btn" aria-expanded={opening === g.url} onClick={() => setOpening(o => (o === g.url ? null : g.url))}>{g.title} ↗</button>)}
      <button type="button" className="sd-btn" aria-expanded={planning} onClick={() => setPlanning(p => !p)}>Make a safety plan</button>
    </div>}
    {opening && <p className="ys-open">This opens {host(opening)} in your browser. Nothing from this case goes with it.
      <button type="button" className="sd-btn primary" onClick={() => { window.open(opening, '_blank', 'noopener,noreferrer'); setOpening(null); }}>Open it</button></p>}
    {planning && data && <div className="ys-plan">
      <p className="sd-quiet">{intro} Kept in this browser only.</p>
      {PLAN.map(f => <label key={f.key}>{f.label}<textarea rows={2} value={kept.plan[f.key] ?? ''} onChange={e => save({...kept, plan: {...kept.plan, [f.key]: e.target.value}})}/></label>)}
      <button type="button" className="sd-btn" onClick={() => {
        const text = [intro, ...PLAN.map(f => `${f.label}: ${kept.plan[f.key] ?? ''}`)].join('\n');
        void navigator.clipboard?.writeText(text).then(() => setCopied(true));
      }}>{copied ? 'Copied' : 'Copy the plan'}</button>
    </div>}
  </section>;
}

/** The slim notice for the top of the case (research §13): only when a sign is at Textbook. */
export function SafetyNotice({investigationId, onOpen}: {investigationId: string; onOpen: () => void}): ReactElement | null {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  useEffect(() => {
    const read = () => setAnswers(readKept(investigationId).answers);
    read();
    window.addEventListener(SAFETY_CHANGED, read);
    return () => window.removeEventListener(SAFETY_CHANGED, read);
  }, [investigationId]);
  const query = useQuery({...getYourSafetyOptions({path: {investigation_id: investigationId}}), retry: false, enabled: Object.values(answers).includes('yes')});
  const top = query.data ? topSign(query.data.questions, answers) : null;
  if (!top) return null;
  return <p className="ys-notice slim" role="status"><b>Textbook safety sign</b> {top.name} · <button type="button" className="sd-link" onClick={onOpen}>See Your safety</button>
    <span> This never blocks your work.</span></p>;
}
