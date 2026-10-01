'use client';
// Reviewer-facing surface for the TAS reasoning layer (issue #36 follow-up).
//
// Everything an LLM produces here lands as an AIAnalysisCandidate in a review
// queue; nothing on this panel writes to canonical records. The panel only
// (1) runs Case Synthesis / Hypothesis Test through the citation- and
// schema-gated backend endpoints, (2) lists the resulting queue, (3) shows one
// candidate's claims with the exact citation ids it was checked against, and
// (4) records the human accept/reject decision. Kept out of app/page.tsx so
// the flow can be rendered and tested on its own (STRUCT-0015 remainder).
import {useCallback,useEffect,useState} from 'react';
import type {ChangeEvent,ReactElement} from 'react';

import type {AiAnalysisCandidate,AiAnalysisCandidateSummary,AiModuleName,AiReasoningStatus,JsonObject,JsonValue,SearchResult} from '../lib/api-types';
import {isAiAnalysisCandidate,isAiAnalysisCandidateReview,isAiReasoningRunResult,isDeck,isWriteup,parseAiAnalysisCandidateList,parseSearchBody} from '../lib/api-validate';
import {ApiClient,errorMessage} from '../lib/api-client';
import {Button} from '@/components/ui/button';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';

type Props={api:ApiClient,investigationId:string,status:AiReasoningStatus|null|undefined};

const MODULE_LABEL:Record<AiModuleName,string>={case_synthesis:'Case synthesis (TAS module 08)',hypothesis_test:'Hypothesis & contradiction test (TAS module 06)',presentation_draft:'Presentation draft (brief/deck from picked evidence)'};
const moduleLabel=(m:string):string=>(m in MODULE_LABEL?MODULE_LABEL[m as AiModuleName]:m);

// presentation_draft's record picker only offers types the backend will
// actually accept as a record_ref (app/services/assistant_context.py's
// SELECTABLE_RECORD_TYPES); search's own hit type for a reporting task is
// "reporting_task" (matching app/services/search.py), translated to the
// reporter-facing "task" spelling everywhere else in this app uses.
const SELECTABLE_SEARCH_TYPES=new Set(['entity','claim','evidence','relationship','source','document','lead','reporting_task']);
const toRecordType=(hitType:string):string=>hitType==='reporting_task'?'task':hitType;
type SelectedRef={record_type:string,record_id:string,label:string};

// Endpoint 422s carry a structured detail ({message, invalid_citations|schema_errors});
// ApiHttpError flattens non-string details to JSON, which is what a reviewer needs to see.
const runFailureMessage=(error:unknown):string=>errorMessage(error,'Reasoning run failed');

const asObj=(v:JsonValue|undefined):JsonObject|null=>(typeof v==='object'&&v!==null&&!Array.isArray(v))?v:null;
const asArr=(v:JsonValue|undefined):JsonValue[]=>Array.isArray(v)?v:[];
const asStr=(v:JsonValue|undefined):string=>typeof v==='string'?v:(v===undefined||v===null?'':JSON.stringify(v));
const refLabel=(v:JsonValue):string=>{const o=asObj(v);return o?`${asStr(o.record_type)}:${asStr(o.record_id)}`:asStr(v)};

export function describeAiStatus(status:AiReasoningStatus|null|undefined):string{
  if(!status)return 'AI reasoning status unavailable from this backend.';
  if(!status.enabled)return 'AI reasoning is disabled on this deployment (ENABLE_AI_FEATURES is off). The core workbench does not need it.';
  if(!status.provider)return 'AI reasoning is enabled but no provider is selected (AI_PROVIDER must be anthropic or openai).';
  if(!status.provider_key_configured)return `AI provider "${status.provider}" is selected but its API key is not configured.`;
  if(!status.tas_spec.present)return 'The vendored TAS spec (backend/app/ai/tas_spec) is not checked out, so prompts cannot be built.';
  const missing=Object.entries(status.tas_spec.modules).filter(([,m])=>!m.available).map(([name])=>name);
  if(missing.length)return `TAS module file(s) missing from the vendored spec: ${missing.join(', ')}.`;
  return `Ready: provider ${status.provider}, TAS spec v${status.tas_spec.version||'?'} vendored.`;
}

export function AiReasoningPanel({api,investigationId,status}:Props):ReactElement{
  const [module,setModule]=useState<AiModuleName>('case_synthesis');
  const [question,setQuestion]=useState('');
  const [theory,setTheory]=useState('');
  const [maxResults,setMaxResults]=useState(30);
  const [includeLeads,setIncludeLeads]=useState(true);
  const [running,setRunning]=useState(false);
  const [runStatus,setRunStatus]=useState('');
  const [filter,setFilter]=useState<'all'|'proposed'|'accepted'|'rejected'>('all');
  const [queue,setQueue]=useState<AiAnalysisCandidateSummary[]>([]);
  const [queueStatus,setQueueStatus]=useState('');
  const [selected,setSelected]=useState<AiAnalysisCandidate|null>(null);
  const [note,setNote]=useState('');
  const [reviewStatus,setReviewStatus]=useState('');
  const [goal,setGoal]=useState('');
  const [recordQuery,setRecordQuery]=useState('');
  const [recordResults,setRecordResults]=useState<SearchResult[]>([]);
  const [recordSearchStatus,setRecordSearchStatus]=useState('');
  const [selectedRefs,setSelectedRefs]=useState<SelectedRef[]>([]);
  const [promoteTitle,setPromoteTitle]=useState('');
  const [promoteStatus,setPromoteStatus]=useState('');
  const [promoted,setPromoted]=useState<{kind:'writeup'|'deck',id:string,title:string}|null>(null);

  // Belt and braces: the backend already folds enabled/provider/key/spec into
  // endpoints_callable, but never offer a run button on a disabled deployment.
  const callable=Boolean(status&&status.enabled&&status.endpoints_callable);

  const loadQueue=useCallback(async()=>{
    if(!investigationId){setQueue([]);return}
    try{
      const params=filter==='all'?'':`?review_status=${filter}`;
      setQueue(await api.parsed(`/api/investigations/${investigationId}/ai-analysis-candidates${params}`,parseAiAnalysisCandidateList));
      setQueueStatus('');
    }catch(error){setQueue([]);setQueueStatus(errorMessage(error,'Could not load the AI review queue'))}
  },[api,investigationId,filter]);

  useEffect(()=>{setSelected(null);setNote('');setReviewStatus('');setPromoteStatus('');setPromoted(null);void loadQueue()},[loadQueue]);

  const open=async(id:string)=>{
    setPromoteStatus('');setPromoted(null);setPromoteTitle('');
    try{setSelected(await api.object(`/api/ai-analysis-candidates/${id}`,'AI analysis candidate',isAiAnalysisCandidate))}
    catch(error){setSelected(null);setReviewStatus(errorMessage(error,'Could not load the candidate'))}
  };

  const searchRecords=async()=>{
    if(!investigationId||!recordQuery.trim())return;
    setRecordSearchStatus('Searching…');
    try{
      const params=new URLSearchParams({q:recordQuery.trim(),investigation_id:investigationId,limit:'25'});
      const body=await api.parsed(`/api/search?${params.toString()}`,parseSearchBody);
      const hits=body.results.filter(r=>SELECTABLE_SEARCH_TYPES.has(r.type));
      setRecordResults(hits);
      setRecordSearchStatus(hits.length?'':'No matching claims, evidence, entities, leads, tasks, sources, documents, or relationships found.');
    }catch(error){setRecordResults([]);setRecordSearchStatus(errorMessage(error,'Search failed'))}
  };

  const addRef=(hit:SearchResult):void=>{
    const record_type=toRecordType(hit.type);
    setSelectedRefs(prev=>prev.some(r=>r.record_type===record_type&&r.record_id===hit.id)?prev:[...prev,{record_type,record_id:hit.id,label:hit.title}]);
  };
  const removeRef=(record_type:string,record_id:string):void=>{
    setSelectedRefs(prev=>prev.filter(r=>!(r.record_type===record_type&&r.record_id===record_id)));
  };

  const run=async()=>{
    if(!investigationId)return;
    if(module==='presentation_draft'){
      if(!goal.trim()||selectedRefs.length===0)return;
      setRunning(true);setRunStatus('Running… the model output is validated against the picked evidence before it can be reviewed.');
      try{
        const body={goal:goal.trim(),record_refs:selectedRefs.map(({record_type,record_id})=>({record_type,record_id}))};
        const result=await api.object(`/api/investigations/${investigationId}/assistant/presentation-draft`,'reasoning result',isAiReasoningRunResult,{method:'POST',body});
        setRunStatus(`Proposed for review (candidate ${result.candidate_id}). Nothing has been written to the investigation.`);
        await loadQueue();
        await open(result.candidate_id);
      }catch(error){setRunStatus(runFailureMessage(error));await loadQueue()}
      finally{setRunning(false)}
      return;
    }
    if(!question.trim())return;
    if(module==='hypothesis_test'&&!theory.trim()){setRunStatus('A working theory is required for a hypothesis test.');return}
    setRunning(true);setRunStatus('Running… the model output is validated against the retrieval packet before it can be reviewed.');
    try{
      const body:Record<string,unknown>={question:question.trim(),max_results:maxResults,include_external_leads:includeLeads};
      if(module==='hypothesis_test')body.working_theory=theory.trim();
      const path=module==='case_synthesis'?'case-synthesis':'hypothesis-test';
      const result=await api.object(`/api/investigations/${investigationId}/assistant/${path}`,'reasoning result',isAiReasoningRunResult,{method:'POST',body});
      setRunStatus(`Proposed for review (candidate ${result.candidate_id}). Nothing has been written to the investigation.`);
      await loadQueue();
      await open(result.candidate_id);
    }catch(error){setRunStatus(runFailureMessage(error));await loadQueue()}
    finally{setRunning(false)}
  };

  const review=async(decision:'accept'|'reject')=>{
    if(!selected)return;
    try{
      const result=await api.object(`/api/ai-analysis-candidates/${selected.id}/review`,'candidate review',isAiAnalysisCandidateReview,{method:'POST',body:{decision,note:note.trim()||null}});
      setReviewStatus(`Recorded: ${result.review_status}.`);
      await loadQueue();
      await open(selected.id);
    }catch(error){setReviewStatus(errorMessage(error,'Review failed'))}
  };

  const promote=async(kind:'writeup'|'deck')=>{
    if(!selected)return;
    setPromoteStatus('Promoting…');
    try{
      const path=kind==='writeup'?'promote-to-writeup':'promote-to-deck';
      const body=promoteTitle.trim()?{title:promoteTitle.trim()}:{};
      if(kind==='writeup'){
        const row=await api.object(`/api/ai-analysis-candidates/${selected.id}/${path}`,'write-up',isWriteup,{method:'POST',body});
        setPromoteStatus(`Promoted to write-up "${row.title}" (${row.word_count} word(s), status ${row.status}).`);
        setPromoted({kind:'writeup',id:row.id,title:row.title});
      }else{
        const row=await api.object(`/api/ai-analysis-candidates/${selected.id}/${path}`,'deck',isDeck,{method:'POST',body});
        setPromoteStatus(`Promoted to deck "${row.title}" (${row.slide_count} slide(s)).`);
        setPromoted({kind:'deck',id:row.id,title:row.title});
      }
    }catch(error){setPromoteStatus(errorMessage(error,'Promotion failed'));setPromoted(null)}
  };

  const payload=selected?.payload??null;
  const claims=asArr(payload?.claims);
  const hypotheses=asArr(payload?.hypothesis_matrix);
  const conflicts=asArr(payload?.contradiction_log);
  const gaps=asArr(payload?.investigative_gaps);
  const isPresentationDraft=selected?.module==='presentation_draft';
  const sections=asArr(payload?.sections);
  const openQuestions=asArr(payload?.open_questions);

  return <section className="card" data-testid="ai-reasoning-panel"><h3>AI reasoning (Topic Authority System)</h3>
    <p className="muted">Bounded reasoning over this investigation&apos;s own evidence. Every run is checked for invented citations and a malformed shape, then parked in a review queue. Accepting marks it as trusted analysis for reporters; it never creates or edits a canonical record.</p>
    <p className="muted" data-testid="ai-status">{describeAiStatus(status)}</p>
    {!investigationId?<p className="muted">Select an investigation to run or review AI analysis.</p>:<>
      <div className="searchrow">
        <Select value={module} onValueChange={(v:string)=>setModule(v as AiModuleName)} disabled={!callable||running}><SelectTrigger aria-label="Reasoning module" className="w-auto"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="case_synthesis">Case synthesis</SelectItem><SelectItem value="hypothesis_test">Hypothesis test</SelectItem><SelectItem value="presentation_draft">Presentation draft</SelectItem></SelectContent></Select>
        {module!=='presentation_draft'&&<>
          <input aria-label="Question" value={question} onChange={(e:ChangeEvent<HTMLInputElement>)=>setQuestion(e.target.value)} placeholder="What does the evidence establish about …?" disabled={!callable||running}/>
          <input aria-label="Max retrieval results" type="number" min={1} max={100} value={maxResults} onChange={(e:ChangeEvent<HTMLInputElement>)=>setMaxResults(Math.min(100,Math.max(1,Number(e.target.value)||30)))} style={{width:80}} disabled={!callable||running}/>
          <label className="muted"><input type="checkbox" checked={includeLeads} onChange={(e:ChangeEvent<HTMLInputElement>)=>setIncludeLeads(e.target.checked)} disabled={!callable||running}/> include external leads</label>
        </>}
        <Button onClick={run} disabled={!callable||running||(module==='presentation_draft'?(!goal.trim()||selectedRefs.length===0):!question.trim())}>{running?'Running…':'Run module'}</Button>
      </div>
      {module==='hypothesis_test'&&<textarea aria-label="Working theory" value={theory} onChange={(e:ChangeEvent<HTMLTextAreaElement>)=>setTheory(e.target.value)} placeholder="The working theory to test against the evidence (required for a hypothesis test)." disabled={!callable||running}/>}
      {module==='presentation_draft'&&<div data-testid="presentation-record-picker">
        <textarea aria-label="Goal" value={goal} onChange={(e:ChangeEvent<HTMLTextAreaElement>)=>setGoal(e.target.value)} placeholder="What should this brief/deck accomplish, using only the evidence you pick below?" disabled={!callable||running}/>
        <div className="searchrow">
          <input aria-label="Search records to add" value={recordQuery} onChange={(e:ChangeEvent<HTMLInputElement>)=>setRecordQuery(e.target.value)} placeholder="Search claims, evidence, entities, leads, tasks…" disabled={!callable||running}/>
          <Button type="button" size="sm" variant="outline" onClick={()=>void searchRecords()} disabled={!callable||running||!recordQuery.trim()}>Search</Button>
        </div>
        {recordSearchStatus&&<p className="muted">{recordSearchStatus}</p>}
        {recordResults.map(hit=>{
          const record_type=toRecordType(hit.type);
          const already=selectedRefs.some(r=>r.record_type===record_type&&r.record_id===hit.id);
          return <div className="candidate" key={`${hit.type}:${hit.id}`}>
            <span>{hit.title} <small className="muted">({record_type})</small></span>
            <div className="actions"><Button type="button" size="sm" variant="outline" disabled={already||!callable||running} onClick={()=>addRef(hit)}>{already?'Added':'Add'}</Button></div>
          </div>;
        })}
        <div className="muted">Selected evidence ({selectedRefs.length}) — the draft can only cite what you pick here:</div>
        {selectedRefs.length===0?<p className="muted">No records selected yet.</p>:<ul>{selectedRefs.map(r=><li key={`${r.record_type}:${r.record_id}`}>{r.label} <small className="muted">({r.record_type})</small> <Button type="button" size="sm" variant="outline" disabled={!callable||running} onClick={()=>removeRef(r.record_type,r.record_id)}>Remove</Button></li>)}</ul>}
      </div>}
      {runStatus&&<p className="muted" data-testid="ai-run-status">{runStatus}</p>}
      <div className="twocol">
        <div>
          <div className="searchrow"><b>Review queue</b><select aria-label="Queue filter" value={filter} onChange={(e:ChangeEvent<HTMLSelectElement>)=>setFilter(e.target.value as typeof filter)}><option value="all">all</option><option value="proposed">proposed</option><option value="accepted">accepted</option><option value="rejected">rejected</option></select><Button size="sm" variant="outline" onClick={()=>void loadQueue()}>Refresh</Button></div>
          {queueStatus&&<p className="muted">{queueStatus}</p>}
          {!queue.length&&!queueStatus&&<p className="muted">No AI analysis candidates yet for this investigation.</p>}
          {queue.map(c=><div className="candidate" key={c.id}><b>{moduleLabel(c.module)}</b> <small>{c.review_status} · {c.checked_citation_count} citation(s) checked · {c.created_at.replace('T',' ').slice(0,16)}</small>
            <div>{asStr(c.request.question??'')||<i>no question recorded</i>}</div>
            {c.reviewer_note&&<small>{c.reviewer_note}</small>}
            <div className="actions"><Button size="sm" variant="outline" onClick={()=>{setReviewStatus('');setNote('');void open(c.id)}}>Open</Button></div>
          </div>)}
        </div>
        <div>
          {!selected?<p className="muted">Open a candidate to read its claims and citations.</p>:<div data-testid="ai-candidate-detail">
            <h2 style={{fontSize:20}}>{moduleLabel(selected.module)} · {selected.review_status}</h2>
            <div className="muted"><b>{isPresentationDraft?'Goal:':'Question:'}</b> {asStr(selected.request.question??'')}{selected.request.working_theory?<><br/><b>Working theory:</b> {asStr(selected.request.working_theory)}</>:null}</div>
            {payload&&'executive_summary' in payload&&<p><b>Summary:</b> {asStr(payload.executive_summary)}</p>}
            {payload&&'scope_and_limitations' in payload&&<p className="muted"><b>Scope & limitations:</b> {asStr(payload.scope_and_limitations)}</p>}
            {isPresentationDraft&&payload&&<>
              {asStr(payload.title)&&<h3 style={{fontSize:16}}>{asStr(payload.title)}</h3>}
              {asStr(payload.goal_restated)&&<p className="muted"><b>Goal (as understood):</b> {asStr(payload.goal_restated)}</p>}
              {asStr(payload.executive_takeaway)&&<p><b>Executive takeaway:</b> {asStr(payload.executive_takeaway)}</p>}
              {sections.map((raw,i)=>{const s=asObj(raw);if(!s)return null;return <div className="candidate" key={asStr(s.heading)||String(i)}>
                <b>{asStr(s.heading)||`Section ${i+1}`}</b>
                <div>{asStr(s.body)}</div>
                {asArr(s.key_points).length>0&&<ul>{asArr(s.key_points).map((kp,j)=><li key={j}>{asStr(kp)}</li>)}</ul>}
                <small>Evidence: {asArr(s.evidence).map(refLabel).join(', ')||'none'}</small>
              </div>})}
              {openQuestions.length>0&&<div><b>Open questions:</b><ul>{openQuestions.map((q,i)=><li key={i}>{asStr(q)}</li>)}</ul></div>}
            </>}
            {claims.map((raw,i)=>{const cl=asObj(raw);if(!cl)return null;return <div className="candidate" key={asStr(cl.claim_id)||String(i)}>
              <b>{asStr(cl.claim_id)||`Claim ${i+1}`}</b> <small>{asStr(cl.classification)} · confidence {asStr(cl.confidence)}</small>
              <div>{asStr(cl.claim)}</div>
              {asStr(cl.warrant)&&<div><b>Warrant:</b> {asStr(cl.warrant)}</div>}
              <small>Supports: {asArr(cl.supporting_evidence).map(refLabel).join(', ')||'none'} · Contradicts: {asArr(cl.contradicting_evidence).map(refLabel).join(', ')||'none'}</small>
            </div>})}
            {hypotheses.map((raw,i)=>{const h=asObj(raw);if(!h)return null;return <div className="candidate" key={asStr(h.hypothesis_id)||String(i)}>
              <b>{asStr(h.hypothesis_id)||`Hypothesis ${i+1}`}</b> <small>{asStr(h.diagnostic_value)}</small>
              <div>{asStr(h.hypothesis)}</div>
              {asStr(h.assessment)&&<div><b>Assessment:</b> {asStr(h.assessment)}</div>}
              {asArr(h.falsifiers).length>0&&<div><b>Falsifiers:</b> {asArr(h.falsifiers).map(asStr).join(' · ')}</div>}
              {asArr(h.missing_records).length>0&&<div><b>Missing records:</b> {asArr(h.missing_records).map(asStr).join(' · ')}</div>}
              <small>Supports: {asArr(h.supporting_evidence).map(refLabel).join(', ')||'none'} · Contradicts: {asArr(h.contradicting_evidence).map(refLabel).join(', ')||'none'}</small>
            </div>})}
            {conflicts.map((raw,i)=>{const c=asObj(raw);if(!c)return null;return <div className="candidate" key={asStr(c.conflict_id)||String(i)}>
              <b>{asStr(c.conflict_id)||`Conflict ${i+1}`}</b> <small>{asStr(c.conflict_type)} · {asStr(c.resolution_status)}</small>
              <div>A: {asStr(c.statement_a)}</div><div>B: {asStr(c.statement_b)}</div>
              <small>Evidence: {asArr(c.evidence).map(refLabel).join(', ')||'none'}</small>
            </div>})}
            {payload&&'conclusion' in payload&&<p><b>Conclusion:</b> {asStr(payload.conclusion)}</p>}
            {gaps.length>0&&<div><b>Investigative gaps:</b><ul>{gaps.map((g,i)=><li key={i}>{asStr(g)}</li>)}</ul></div>}
            <details><summary className="muted">Checked against {selected.checked_citation_ids.length} citation id(s) · raw payload</summary><pre style={{whiteSpace:'pre-wrap',fontSize:12}}>{JSON.stringify(payload,null,2)}</pre></details>
            {selected.trace&&<details data-testid="ai-trace"><summary className="muted">What the model was sent · {asStr(selected.trace.response&&asObj(selected.trace.response)?.model)}{selected.trace.response&&asObj(selected.trace.response)?.truncated?' · truncated':''}</summary>
              <div className="muted"><b>System prompt</b></div><pre style={{whiteSpace:'pre-wrap',fontSize:11,maxHeight:300,overflowY:'auto'}}>{asStr(selected.trace.system_prompt)}</pre>
              <div className="muted"><b>User prompt (retrieval packet)</b></div><pre style={{whiteSpace:'pre-wrap',fontSize:11,maxHeight:300,overflowY:'auto'}}>{asStr(selected.trace.user_prompt)}</pre>
            </details>}
            {selected.review_status==='proposed'?<>
              <textarea aria-label="Reviewer note" value={note} onChange={(e:ChangeEvent<HTMLTextAreaElement>)=>setNote(e.target.value)} placeholder="Reviewer note (why this is or is not trustworthy)."/>
              <div className="actions"><Button onClick={()=>void review('accept')}>Accept as trusted analysis</Button><Button variant="outline" onClick={()=>void review('reject')}>Reject</Button></div>
            </>:<p className="muted">Reviewed {selected.reviewed_at?selected.reviewed_at.replace('T',' ').slice(0,16):''}{selected.reviewer_note?` · ${selected.reviewer_note}`:''}</p>}
            {reviewStatus&&<p className="muted" data-testid="ai-review-status">{reviewStatus}</p>}
            {isPresentationDraft&&selected.review_status==='accepted'&&<div className="card" data-testid="promote-panel">
              <b>Promote to a reporter-editable artifact</b>
              <div className="searchrow">
                <input aria-label="Promoted title" value={promoteTitle} onChange={(e:ChangeEvent<HTMLInputElement>)=>setPromoteTitle(e.target.value)} placeholder={asStr(payload?.title)||'Title (optional — defaults to the draft title)'}/>
                <Button type="button" size="sm" onClick={()=>void promote('writeup')}>Promote to write-up</Button>
                <Button type="button" size="sm" variant="outline" onClick={()=>void promote('deck')}>Promote to deck</Button>
              </div>
              {promoteStatus&&<p className="muted" data-testid="promote-status">{promoteStatus}</p>}
              {promoted&&<a data-testid="promote-download-link" href={`${api.baseUrl}/api/${promoted.kind==='writeup'?'writeups':'decks'}/${promoted.id}/export.${promoted.kind==='writeup'?'docx':'pptx'}`}>Download {promoted.kind==='writeup'?'.docx':'.pptx'}</a>}
            </div>}
          </div>}
        </div>
      </div>
    </>}
  </section>;
}

export default AiReasoningPanel;
