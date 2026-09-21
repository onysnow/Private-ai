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

import type {AiAnalysisCandidate,AiAnalysisCandidateSummary,AiModuleName,AiReasoningStatus,JsonObject,JsonValue} from '../lib/api-types';
import {isAiAnalysisCandidate,isAiAnalysisCandidateReview,isAiReasoningRunResult,parseAiAnalysisCandidateList} from '../lib/api-validate';
import {ApiClient,errorMessage} from '../lib/api-client';
import {Button} from '@/components/ui/button';

type Props={api:ApiClient,investigationId:string,status:AiReasoningStatus|null|undefined};

const MODULE_LABEL:Record<AiModuleName,string>={case_synthesis:'Case synthesis (TAS module 08)',hypothesis_test:'Hypothesis & contradiction test (TAS module 06)'};
const moduleLabel=(m:string):string=>(m in MODULE_LABEL?MODULE_LABEL[m as AiModuleName]:m);

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

  useEffect(()=>{setSelected(null);setNote('');setReviewStatus('');void loadQueue()},[loadQueue]);

  const open=async(id:string)=>{
    try{setSelected(await api.object(`/api/ai-analysis-candidates/${id}`,'AI analysis candidate',isAiAnalysisCandidate))}
    catch(error){setSelected(null);setReviewStatus(errorMessage(error,'Could not load the candidate'))}
  };

  const run=async()=>{
    if(!investigationId||!question.trim())return;
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

  const payload=selected?.payload??null;
  const claims=asArr(payload?.claims);
  const hypotheses=asArr(payload?.hypothesis_matrix);
  const conflicts=asArr(payload?.contradiction_log);
  const gaps=asArr(payload?.investigative_gaps);

  return <section className="card" data-testid="ai-reasoning-panel"><h3>AI reasoning (Topic Authority System)</h3>
    <p className="muted">Bounded reasoning over this investigation&apos;s own evidence. Every run is checked for invented citations and a malformed shape, then parked in a review queue. Accepting marks it as trusted analysis for reporters; it never creates or edits a canonical record.</p>
    <p className="muted" data-testid="ai-status">{describeAiStatus(status)}</p>
    {!investigationId?<p className="muted">Select an investigation to run or review AI analysis.</p>:<>
      <div className="searchrow">
        <select aria-label="Reasoning module" value={module} onChange={(e:ChangeEvent<HTMLSelectElement>)=>setModule(e.target.value as AiModuleName)} disabled={!callable||running}><option value="case_synthesis">Case synthesis</option><option value="hypothesis_test">Hypothesis test</option></select>
        <input aria-label="Question" value={question} onChange={(e:ChangeEvent<HTMLInputElement>)=>setQuestion(e.target.value)} placeholder="What does the evidence establish about …?" disabled={!callable||running}/>
        <input aria-label="Max retrieval results" type="number" min={1} max={100} value={maxResults} onChange={(e:ChangeEvent<HTMLInputElement>)=>setMaxResults(Math.min(100,Math.max(1,Number(e.target.value)||30)))} style={{width:80}} disabled={!callable||running}/>
        <label className="muted"><input type="checkbox" checked={includeLeads} onChange={(e:ChangeEvent<HTMLInputElement>)=>setIncludeLeads(e.target.checked)} disabled={!callable||running}/> include external leads</label>
        <Button onClick={run} disabled={!callable||running||!question.trim()}>{running?'Running…':'Run module'}</Button>
      </div>
      {module==='hypothesis_test'&&<textarea aria-label="Working theory" value={theory} onChange={(e:ChangeEvent<HTMLTextAreaElement>)=>setTheory(e.target.value)} placeholder="The working theory to test against the evidence (required for a hypothesis test)." disabled={!callable||running}/>}
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
            <div className="muted"><b>Question:</b> {asStr(selected.request.question??'')}{selected.request.working_theory?<><br/><b>Working theory:</b> {asStr(selected.request.working_theory)}</>:null}</div>
            {payload&&'executive_summary' in payload&&<p><b>Summary:</b> {asStr(payload.executive_summary)}</p>}
            {payload&&'scope_and_limitations' in payload&&<p className="muted"><b>Scope & limitations:</b> {asStr(payload.scope_and_limitations)}</p>}
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
            {selected.review_status==='proposed'?<>
              <textarea aria-label="Reviewer note" value={note} onChange={(e:ChangeEvent<HTMLTextAreaElement>)=>setNote(e.target.value)} placeholder="Reviewer note (why this is or is not trustworthy)."/>
              <div className="actions"><Button onClick={()=>void review('accept')}>Accept as trusted analysis</Button><Button variant="outline" onClick={()=>void review('reject')}>Reject</Button></div>
            </>:<p className="muted">Reviewed {selected.reviewed_at?selected.reviewed_at.replace('T',' ').slice(0,16):''}{selected.reviewer_note?` · ${selected.reviewer_note}`:''}</p>}
            {reviewStatus&&<p className="muted" data-testid="ai-review-status">{reviewStatus}</p>}
          </div>}
        </div>
      </div>
    </>}
  </section>;
}

export default AiReasoningPanel;
