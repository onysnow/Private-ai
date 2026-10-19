'use client';
// Act › Story (mockup ACT_2, research Act §7–8, ADR-0010): "what the story needs" beside the write-up.
// Left: the tree read left to right, thesis (a diamond) → sections → claims → their evidence; a branch is only as
// strong as its weakest claim (solid when every claim is shown, dashed when one is not yet shown, red when one is
// disputed); the critical path at the top; the gates under the thesis; L for the tree as an outline; drag a claim into
// the text to cite it. Right: the write-up (TipTap, ADR-0011) with its Cited and Notes tabs and its version history;
// a citation's passage opens beside the text (Esc closes). The Export sheet says what each format holds; the export
// for publication stays disabled, saying why, until every sentence has a source. "Ready to run" can be recorded only
// when every gate has passed.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement} from 'react';
import {z} from 'zod';

import {Form, FormControl, FormField, FormItemBare, FormMessage, FormRootError} from '@/components/ui/form';
import {StatusChip} from '../../components/status';
import {errorMessage} from '../../lib/api-client';
import {submitWith, useZodForm} from '../../lib/forms';
import {
  addStorySectionMutation, getNotesOptions, getStoryOptions, getStoryQueryKey, markStoryReadyMutation, placeStoryClaimMutation, recordStoryGateMutation,
  removeStoryClaimMutation, setStoryThesisMutation, startStoryWriteupMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import {exportWriteupDocx} from '../../lib/generated/sdk.gen';
import type {StoryGateOut, StoryOut} from '../../lib/generated/types.gen';
import type {CitableClaim, DocInfo} from './editor-extensions';
import {ExportSheet, NotesTab, PassagePane, VersionsPane} from './story-panes';

const WriteupEditor = dynamic(() => import('./writeup-editor').then(m => m.WriteupEditor), {ssr: false, loading: () => <p className="sy-quiet">Opening the write-up…</p>});
/** The drag type a claim of the tree carries (editor-extensions.ts CLAIM_DRAG; repeated so TipTap loads only with the editor). */
const CLAIM_DRAG = 'application/x-story-claim';
type Pane = {kind: 'passage'; claimId: string} | {kind: 'versions'} | null;

// What the boxes of this screen take, as the backend does (StoryThesisSet thesis up to 2000, StorySectionCreate title
// 1–512, StoryGateSet who up to 255 and a day, StoryReady by 1–255).
type Gate = 'right_of_reply' | 'legal_read';
const thesisSchema = z.object({thesis: z.string().trim().min(1, 'Write the sentence first.').max(2000, 'Keep it under 2,000 characters.')});
const sectionSchema = z.object({title: z.string().trim().min(1, 'Write what the section will say.').max(512, 'Keep it under 512 characters.')});
const gateSchema = (gate: Gate) => z.object({
  who: z.string().trim().min(1, gate === 'right_of_reply' ? 'Write who it was sent to.' : 'Write who read it.').max(255, 'Keep it under 255 characters.'),
  on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the day.'),
});
const readySchema = z.object({by: z.string().trim().min(1, 'Write who decided.').max(255, 'Keep it under 255 characters.')});
type ThesisValues = z.infer<typeof thesisSchema>;
type SectionValues = z.infer<typeof sectionSchema>;
type GateValues = z.infer<ReturnType<typeof gateSchema>>;
type ReadyValues = z.infer<typeof readySchema>;
const NEXT_LINE = 'field-msg next-line';

const STATE_CHIP = {shown: 'supported', disputed: 'disputed', unshown: 'unshown', ruled_out: 'ruled_out'} as const;
const GATE_MARK: Record<StoryGateOut['state'], string> = {passed: '✓', open: '○', warning: '!', pending: '○'};

/** The write-up as a Word document (the server's .docx, with numbered citations and a Sources section). */
async function exportDocx(writeupId: string): Promise<void> {
  const {data} = await exportWriteupDocx({path: {writeup_id: writeupId}, parseAs: 'blob', throwOnError: true});
  const url = URL.createObjectURL(data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'write-up.docx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** The readiness ring: shown claims out of all, as a fraction of a circle. */
function Ring({shown, total}: {shown: number; total: number}): ReactElement {
  const r = 13; const c = 2 * Math.PI * r; const k = total ? shown / total : 0;
  return <svg className="sy-ring" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r={r} className="sy-ring-bg"/>
    <circle cx="16" cy="16" r={r} className="sy-ring-fg" strokeDasharray={`${c * k} ${c}`} transform="rotate(-90 16 16)"/></svg>;
}

export function StoryScreen({investigationId, active = true}: {investigationId: string; active?: boolean}): ReactElement {
  const queryClient = useQueryClient();
  const path = {investigation_id: investigationId};
  const q = useQuery({...getStoryOptions({path}), enabled: Boolean(investigationId)});
  const put = (data: StoryOut) => queryClient.setQueryData(getStoryQueryKey({path}), data);
  const thesisM = useMutation({...setStoryThesisMutation(), onSuccess: put});
  const sectionM = useMutation({...addStorySectionMutation(), onSuccess: put});
  const placeM = useMutation({...placeStoryClaimMutation(), onSuccess: put});
  const removeM = useMutation({...removeStoryClaimMutation(), onSuccess: put});
  const gateM = useMutation({...recordStoryGateMutation(), onSuccess: put});
  const readyM = useMutation({...markStoryReadyMutation(), onSuccess: put});
  const writeM = useMutation({...startStoryWriteupMutation(), onSuccess: put});
  const story = q.data;
  const [outline, setOutline] = useState(false);
  const [tab, setTab] = useState<'write' | 'cited' | 'notes'>('write');
  const [doc, setDoc] = useState<DocInfo | null>(null);
  const cited = doc?.cited ?? [];
  const thesisForm = useZodForm<ThesisValues>(thesisSchema, {defaultValues: {thesis: ''}, mode: 'onSubmit'});
  const sectionForm = useZodForm<SectionValues>(sectionSchema, {defaultValues: {title: ''}, mode: 'onSubmit'});
  const [lit, setLit] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>(null);
  const [exporting, setExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // The thesis, a new section, a gate and "Ready to run" show a failed save in their own forms.
  const problem = [placeM, removeM, gateM, writeM].find(m => m.isError)?.error;
  const notes = useQuery({...getNotesOptions({path, query: {record_type: 'story', record_id: story?.id ?? ''}}), enabled: Boolean(story?.id)});

  // Claims of the story, numbered in the tree's order: the numbers on the citation chips.
  const claims: CitableClaim[] = useMemo(() => (story?.sections ?? []).flatMap(s => s.claims)
    .map((c, i) => ({id: c.id, n: i + 1, text: c.text, state: c.state, evidence: c.evidence})), [story]);
  const byId = new Map(claims.map(c => [c.id, c]));
  const closeExport = useCallback(() => setExporting(false), []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pane) { setPane(null); return; }
      const t = e.target;
      if (e.metaKey || e.ctrlKey || e.altKey || (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"]'))) return;
      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); setOutline(v => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, pane]);

  if (!investigationId) return <p className="sy-quiet">Open a case first.</p>;
  if (q.isError) return <p role="alert" className="sy-quiet">{errorMessage(q.error, 'Could not read the story')}</p>;
  if (!story) return <div className="ch-skeleton" aria-busy="true" aria-label="Reading the story"/>;
  const c = story.counts;
  const gatesOpen = story.gates.length - story.gates_passed;
  const ready = Boolean(story.writeup_id) && story.sentences.total > 0 && story.sentences.uncited === 0;

  return <section className="sy" aria-label="Story">
    <header className="sy-head">
      <h2>{story.thesis || 'The story'}</h2>
      <p className="sy-ready" aria-label="Readiness"><Ring shown={c.shown} total={c.claims}/>
        <span><b>{c.shown} of {c.claims}</b> claims shown{c.disputed > 0 && <> · <span className="sy-bad">{c.disputed} disputed</span></>}
          {c.unshown > 0 && <> · {c.unshown} not yet shown</>} · <span className={gatesOpen ? 'sy-warn' : 'sy-ok'}>{gatesOpen ? `${gatesOpen} gates open` : 'every gate passed'}</span></span></p>
    </header>
    {problem && <p role="alert" className="sy-quiet">{errorMessage(problem, 'Could not save that')}</p>}
    <div className="sy-body">
      <div className="sy-left">
        <header className="sy-left-head"><p className="sy-eyebrow">What the story needs <small>thesis → sections → claims → evidence · a branch is as strong as its weakest claim</small></p>
          <button type="button" className="sy-btn" aria-pressed={outline} onClick={() => setOutline(v => !v)}><kbd>L</kbd> list view</button></header>
        {story.critical.length > 0 && <p className="sy-critical"><b>Critical path</b> Blocked by: {story.critical.map(x => x.text).join(' · ')} <small>({story.critical[0].section})</small></p>}
        {!story.thesis ? <Form {...thesisForm}><form className="sy-thesis-form" noValidate onSubmit={submitWith(thesisForm, async ({thesis}) => {
          await thesisM.mutateAsync({path, body: {thesis}});
        }, 'Could not set the thesis')}>
          <label htmlFor="sy-thesis">Write the one sentence this story says</label>
          <FormField control={thesisForm.control} name="thesis" render={({field}) => <FormItemBare>
            <FormControl><input {...field} id="sy-thesis" placeholder="e.g. Kestrel SA ended up with the harbour land through companies that hid who owned them"/></FormControl>
            <FormMessage className="field-msg"/></FormItemBare>}/>
          <FormRootError className="field-msg"/>
          <button type="submit">Set the thesis</button>
        </form></Form> : outline ? <Outline story={story}/> : <Tree story={story} lit={lit} setLit={setLit} byId={byId} canDrag={Boolean(story.writeup_id)}
          onRemove={(section, claim) => removeM.mutate({path: {...path, section_id: section, claim_id: claim}})}
          onPlace={(section, claim) => placeM.mutate({path: {...path, section_id: section}, body: {claim_id: claim}})}/>}
        {story.thesis && <Form {...sectionForm}><form className="sy-add" noValidate onSubmit={submitWith(sectionForm, async ({title}) => {
          await sectionM.mutateAsync({path, body: {title}});
          sectionForm.reset();
        }, 'Could not add the section')}>
          <FormField control={sectionForm.control} name="title" render={({field}) => <FormItemBare>
            <FormControl><input {...field} aria-label="A new section" placeholder="+ A section: what the story will say next"/></FormControl>
            <FormMessage className={NEXT_LINE}/></FormItemBare>}/>
          <FormRootError className={NEXT_LINE}/>
          <button type="submit">Add section</button></form></Form>}
        <Gates story={story} onClear={gate => gateM.mutate({path, body: {gate, who: null, on: null}})}
          onGate={async (gate, who, on) => {
            // The failure shows in the gate's form, so not again over the screen.
            try { await gateM.mutateAsync({path, body: {gate, who, on}}); } catch (error) { gateM.reset(); throw error; }
          }}
          onReady={async by => { await readyM.mutateAsync({path, body: {by}}); }}/>
        {/* What opens beside the text lies over the tree's edge, next to the write-up, so the text never moves. */}
        {pane && <div className="sy-pane-slot">
          {pane.kind === 'passage' && <PassagePane claim={byId.get(pane.claimId)} onClose={() => setPane(null)}/>}
          {pane.kind === 'versions' && story.writeup_id && <VersionsPane investigationId={investigationId} writeupId={story.writeup_id}
            onClose={() => setPane(null)} onRestored={() => setReloadKey(k => k + 1)}/>}
        </div>}
      </div>
      <div className="sy-right">
        <div className="sy-tabs" role="tablist" aria-label="Write-up">
          <button type="button" role="tab" aria-selected={tab === 'write'} className={tab === 'write' ? 'on' : ''} onClick={() => setTab('write')}>Write-up</button>
          <button type="button" role="tab" aria-selected={tab === 'cited'} className={tab === 'cited' ? 'on' : ''} onClick={() => setTab('cited')}>Cited · {cited.length}</button>
          <button type="button" role="tab" aria-selected={tab === 'notes'} className={tab === 'notes' ? 'on' : ''} disabled={!story.id}
            title={story.id ? undefined : 'Write the thesis first: notes sit on the story'} onClick={() => setTab('notes')}>Notes{notes.data ? ` · ${notes.data.notes.length}` : ''}</button>
          <span className={`sy-export${ready ? ' ready' : ''}`}>
            <button type="button" disabled={!story.writeup_id} aria-haspopup="dialog" onClick={() => setExporting(true)}>Export for publication</button>
            <small>{!story.writeup_id ? 'Start the write-up first' : story.sentences.total === 0 ? 'Nothing written yet'
              : story.sentences.uncited ? `${story.sentences.uncited} sentence${story.sentences.uncited === 1 ? ' needs' : 's need'} a source` : 'every sentence has a source'}</small>
          </span>
        </div>
        {tab === 'notes' && story.id ? <NotesTab investigationId={investigationId} storyId={story.id}/> : !story.writeup_id ? <div className="sy-start">
          <p>No write-up yet.</p>
          <button type="button" className="primary" disabled={!story.thesis} onClick={() => writeM.mutate({path})}>Start the write-up</button>
          {!story.thesis && <small>Write the thesis first: the write-up is told from it.</small>}
        </div> : null}
        {story.writeup_id && <>
          <div hidden={tab !== 'write'}>
            <p className="sy-doc-meta">Draft for the editor · {story.version ? <>version “{story.version.name}”</> : 'no named version yet'}
              <button type="button" className="sy-link" aria-expanded={pane?.kind === 'versions'} onClick={() => setPane(p => (p?.kind === 'versions' ? null : {kind: 'versions'}))}>Version history</button></p>
            <WriteupEditor investigationId={investigationId} writeupId={story.writeup_id} claims={claims} onDoc={setDoc} reloadKey={reloadKey}
              onOpenPassage={id => setPane({kind: 'passage', claimId: id})}/>
          </div>
          {tab === 'cited' && <ol className="sy-cited" aria-label="Cited in the write-up">
            {cited.length ? cited.map(id => byId.get(id)).filter(Boolean).map(cl => <li key={cl!.id}><span className="wu-n">{cl!.n}</span>
              <span>{cl!.text}</span><StatusChip status={STATE_CHIP[cl!.state]}/></li>) : <li className="sy-quiet">Nothing cited yet.</li>}
          </ol>}
          <footer className="sy-foot">
            <span><b>Exhibits</b> {cited.length} record{cited.length === 1 ? '' : 's'}</span>
            <span><b>AI use</b> {doc?.aiDrafted ?? 0} of {doc?.paragraphs ?? 0} paragraph{doc?.paragraphs === 1 ? '' : 's'} drafted with AI</span>
            <span className="sy-key"><i className="k-uncited"/>no source <i className="k-disputed"/>rests on a disputed claim <i className="k-unshown"/>rests on a claim not yet shown <i className="k-ai"/>AI wording</span>
          </footer>
        </>}
      </div>
    </div>
    {exporting && <ExportSheet story={story} doc={doc} onClose={closeExport} onExportDocx={() => (story.writeup_id ? exportDocx(story.writeup_id) : Promise.resolve())}/>}
  </section>;
}

function Tree({story, lit, setLit, byId, canDrag, onRemove, onPlace}: {
  story: StoryOut; lit: string | null; setLit: (id: string | null) => void; byId: Map<string, CitableClaim>; canDrag: boolean;
  onRemove: (section: string, claim: string) => void; onPlace: (section: string, claim: string) => void;
}): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{key: string; d: string; style: string}[]>([]);
  useLayoutEffect(() => {
    const host = box.current;
    if (!host) return;
    const measure = () => {
      const r0 = host.getBoundingClientRect();
      const at = (sel: string) => host.querySelector<HTMLElement>(sel)?.getBoundingClientRect();
      const thesis = at('[data-node="thesis"]');
      const out: typeof lines = [];
      const curve = (a: DOMRect, b: DOMRect) => {
        const x1 = a.right - r0.left; const y1 = a.top + a.height / 2 - r0.top; const x2 = b.left - r0.left; const y2 = b.top + b.height / 2 - r0.top;
        const mx = (x1 + x2) / 2;
        return `M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
      };
      for (const s of story.sections) {
        const sec = at(`[data-node="s:${s.id}"]`);
        if (thesis && sec) out.push({key: `t>${s.id}`, d: curve(thesis, sec), style: s.status});
        for (const cl of s.claims) {
          const cb = at(`[data-node="c:${cl.id}"]`);
          if (sec && cb) out.push({key: `${s.id}>${cl.id}`, d: curve(sec, cb), style: cl.state});
        }
      }
      setLines(out);
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(host);
    return () => ro?.disconnect();
  }, [story]);
  return <div className="sy-tree" ref={box} role="tree" aria-label="What the story needs">
    <svg className="sy-lines" aria-hidden="true">{lines.map(l => <path key={l.key} d={l.d} className={`sy-line l-${l.style}${lit && l.key.includes(lit) ? ' lit' : ''}`}/>)}</svg>
    <div className="sy-col sy-col-thesis">
      <div className="sy-thesis" data-node="thesis" role="treeitem" aria-level={1} aria-selected={false} aria-label={`Thesis: ${story.thesis}`}>
        <span className="sy-diamond" aria-hidden="true"><b>Thesis</b></span>
        <p>{story.thesis}</p>
      </div>
    </div>
    <div className="sy-col sy-col-rest">
      {!story.sections.length && <p className="sy-quiet">Add the sections the story will say, then put claims under them.</p>}
      {story.sections.map((s, i) => <div key={s.id} className="sy-branch">
        <div className={`sy-section st-${s.status}`} data-node={`s:${s.id}`} role="treeitem" aria-level={2} aria-selected={lit === s.id}
          aria-label={`Section ${i + 1}: ${s.title}, ${s.shown} of ${s.total} shown`} onMouseEnter={() => setLit(s.id)} onMouseLeave={() => setLit(null)}>
          <b>{i + 1} · {s.title}</b>
          <span className="sy-bar" aria-hidden="true"><i style={{width: `${s.total ? (s.shown / s.total) * 100 : 0}%`}}/></span>
          <small>{s.total ? `${s.shown} of ${s.total} shown` : 'no claim yet'}</small>
        </div>
        <div className="sy-claims">
          {s.claims.map(cl => <article key={cl.id} className={`sy-claim st-${cl.state}${story.critical.some(x => x.claim_id === cl.id) ? ' critical' : ''}`} data-node={`c:${cl.id}`}
            role="treeitem" aria-level={3} aria-selected={lit === cl.id} aria-label={`Claim, ${cl.state === 'shown' ? 'shown' : cl.state === 'disputed' ? 'disputed' : 'not yet shown'}, ${cl.text}`}
            onMouseEnter={() => setLit(cl.id)} onMouseLeave={() => setLit(null)} draggable={canDrag}
            title={canDrag ? 'Drag into the write-up to cite it there' : undefined}
            onDragStart={e => { e.dataTransfer.setData(CLAIM_DRAG, cl.id); e.dataTransfer.effectAllowed = 'copy'; }}>
            <span className="sy-claim-top"><StatusChip status={STATE_CHIP[cl.state]}/><span className="wu-n" title="Its number in the write-up">{byId.get(cl.id)?.n}</span>
              {story.critical.some(x => x.claim_id === cl.id) && <span className="sy-cp">Critical path</span>}
              <button type="button" className="sy-x" aria-label={`Take “${cl.text}” out of this section`} onClick={() => onRemove(s.id, cl.id)}>×</button></span>
            <b>{cl.text}</b>
            <span className="sy-ev">{cl.evidence.length ? cl.evidence.map(e => <span key={e.id} className={`sy-ev-chip ${e.stance === 'contradicts' ? 'against' : ''}`}>
              {e.label}{e.locator ? ` · ${e.locator}` : ''}</span>) : <span className="sy-ev-chip empty">no evidence linked</span>}
              {cl.single_source && <span className="sy-single" title="Rests on one record: mark it as single-source in the text">one source</span>}</span>
          </article>)}
          {story.unplaced.length > 0 && <label className="sy-place">
            <select value="" aria-label={`Put a claim under “${s.title}”`} onChange={e => e.target.value && onPlace(s.id, e.target.value)}>
              <option value="">+ put a claim here…</option>
              {story.unplaced.filter(u => u.state !== 'ruled_out').map(u => <option key={u.id} value={u.id}>{u.text.length > 70 ? `${u.text.slice(0, 70)}…` : u.text}</option>)}
            </select></label>}
        </div>
      </div>)}
    </div>
  </div>;
}

function Outline({story}: {story: StoryOut}): ReactElement {
  return <ol className="sy-outline" aria-label="The story as an outline">
    <li><b>Thesis:</b> {story.thesis}
      <ol>{story.sections.map(s => <li key={s.id}><b>{s.title}</b> · {s.shown} of {s.total} shown
        <ol>{s.claims.map(c => <li key={c.id}>{c.state === 'shown' ? '✓' : c.state === 'disputed' ? '✕' : '○'} {c.text}
          <ul>{c.evidence.map(e => <li key={e.id}>{e.stance === 'contradicts' ? 'against: ' : ''}{e.label}{e.locator ? `, ${e.locator}` : ''}</li>)}</ul></li>)}</ol></li>)}</ol>
    </li>
  </ol>;
}

/** Who the reply went to, or who read it for the lawyer, and on which day: asked in place, under the gate. */
function GateForm({gate, onGate, onClose}: {gate: Gate; onGate: (gate: Gate, who: string, on: string) => Promise<void>; onClose: () => void}): ReactElement {
  const form = useZodForm<GateValues>(gateSchema(gate), {defaultValues: {who: '', on: ''}, mode: 'onSubmit'});
  const label = gate === 'right_of_reply' ? 'Sent to' : 'Read by';
  return <Form {...form}><form className="gate-form" noValidate onSubmit={submitWith(form, async ({who, on}) => {
    await onGate(gate, who, on);
    onClose();
  }, 'Could not record it')}>
    <FormField control={form.control} name="who" render={({field}) => <FormItemBare>
      <FormControl><input {...field} aria-label={label} placeholder={label}/></FormControl>
      <FormMessage className={NEXT_LINE}/></FormItemBare>}/>
    <FormField control={form.control} name="on" render={({field}) => <FormItemBare>
      <FormControl><input {...field} type="date" aria-label="On"/></FormControl>
      <FormMessage className={NEXT_LINE}/></FormItemBare>}/>
    <FormRootError className={NEXT_LINE}/>
    <button type="submit">Record</button><button type="button" onClick={onClose}>Cancel</button>
  </form></Form>;
}

function Gates({story, onGate, onClear, onReady}: {story: StoryOut; onGate: (gate: Gate, who: string, on: string) => Promise<void>;
  onClear: (gate: Gate) => void; onReady: (by: string) => Promise<void>}): ReactElement {
  const [editing, setEditing] = useState<Gate | null>(null);
  const ready = useZodForm<ReadyValues>(readySchema, {defaultValues: {by: ''}, mode: 'onSubmit'});
  return <section className="sy-gates" aria-label="Gates">
    <p className="sy-eyebrow">Gates · {story.gates_passed} of {story.gates.length} passed</p>
    <ul>{story.gates.map(g => <li key={g.key} className={`gate g-${g.state}`}>
      <span className="gate-mark" aria-hidden="true">{GATE_MARK[g.state]}</span>
      <span><b>{g.label}</b><small>{g.detail}</small>
        {(g.key === 'right_of_reply' || g.key === 'legal_read') && (editing === g.key
          ? <GateForm gate={g.key as Gate} onGate={onGate} onClose={() => setEditing(null)}/> : <span className="gate-acts">
            <button type="button" onClick={() => setEditing(g.key as Gate)}>{g.state === 'passed' ? 'Change' : 'Record'}</button>
            {g.state === 'passed' && <button type="button" onClick={() => onClear(g.key as Gate)}>Clear</button>}
          </span>)}
      </span>
    </li>)}</ul>
    {story.ready ? <p className="sy-ok">Ready to run · decided by {story.ready.by} on {new Date(story.ready.at).toLocaleDateString('en-GB')}</p>
      : <Form {...ready}><form className="gate-form" noValidate onSubmit={submitWith(ready, async ({by}) => { await onReady(by); }, 'Could not record it')}>
        <FormField control={ready.control} name="by" render={({field}) => <FormItemBare>
          <FormControl><input {...field} aria-label="Decided by" placeholder="Decided by" disabled={!story.can_ready}/></FormControl>
          <FormMessage className={NEXT_LINE}/></FormItemBare>}/>
        <FormRootError className={NEXT_LINE}/>
        <button type="submit" disabled={!story.can_ready}>Ready to run</button>
        {!story.can_ready && <small>Only when every gate has passed.</small>}
      </form></Form>}
  </section>;
}
