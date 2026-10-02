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
import {useCallback,useEffect,useRef,useState} from 'react';
import type {ChangeEvent,ReactElement} from 'react';

import type {AiAnalysisCandidate,AiAnalysisCandidateSummary,AiModuleName,AiReasoningStatus,BackgroundJob,DeckStyle,JsonObject,JsonValue,PresentationStyleCatalog,VisualStyle} from '../lib/api-types';
import {ApiPayloadError,isAiAnalysisCandidate,isAiAnalysisCandidateReview,isAiReasoningRunResult,isBackgroundJob,isDeck,isPresentationStyleCatalog,isWriteup,parseAiAnalysisCandidateList} from '../lib/api-validate';
import {ApiClient,ApiHttpError,errorMessage} from '../lib/api-client';
import {describeJob,waitForJob} from '../lib/jobs';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Download, FileText, Presentation} from 'lucide-react';
import {RecordPicker} from './presentation/record-picker';
import type {SelectedRef} from './presentation/record-picker';
import {DraftPreview} from './presentation/draft-preview';
import type {TraceHandler} from './presentation/draft-preview';

// onTraceRecord: opens the page's provenance drawer for a cited record (an
// evidence chip in a presentation draft's preview).
type Props={api:ApiClient,investigationId:string,status:AiReasoningStatus|null|undefined,onTraceRecord?:TraceHandler};

const MODULE_LABEL:Record<AiModuleName,string>={case_synthesis:'Case synthesis (TAS module 08)',hypothesis_test:'Hypothesis & contradiction test (TAS module 06)',presentation_draft:'Presentation draft (brief/deck from picked evidence)'};
const moduleLabel=(m:string):string=>(m in MODULE_LABEL?MODULE_LABEL[m as AiModuleName]:m);

// presentation_draft is app-local (backend/app/ai/presentation_modules), not
// vendored TAS content: it can run when the TAS spec isn't checked out, so
// callability is decided per module rather than from endpoints_callable alone.
export function moduleCallable(status:AiReasoningStatus|null|undefined,module:AiModuleName):boolean{
  if(!status||!status.enabled||!status.provider||!status.provider_key_configured)return false;
  if(module==='presentation_draft')return status.tas_spec.modules.presentation_draft?.available!==false;
  return Boolean(status.endpoints_callable);
}

// Endpoint 422s carry a structured detail ({message, invalid_citations|schema_errors});
// ApiHttpError flattens non-string details to JSON, which is what a reviewer needs to see.
const runFailureMessage=(error:unknown):string=>errorMessage(error,'Reasoning run failed');

const asObj=(v:JsonValue|undefined):JsonObject|null=>(typeof v==='object'&&v!==null&&!Array.isArray(v))?v:null;
const asArr=(v:JsonValue|undefined):JsonValue[]=>Array.isArray(v)?v:[];
const asStr=(v:JsonValue|undefined):string=>typeof v==='string'?v:(v===undefined||v===null?'':JSON.stringify(v));
const refLabel=(v:JsonValue):string=>{const o=asObj(v);return o?`${asStr(o.record_type)}:${asStr(o.record_id)}`:asStr(v)};

// Which computer reads the evidence the model is sent (Foundation Fixes fix 4).
// Which computer answers (Foundation Fixes fix 4): the settings page shows the same words.
export const whereModelRuns=(status:AiReasoningStatus):string=>status.runs_on_this_computer===true?' (runs on this computer)':status.runs_on_this_computer===false?' (runs on the provider\'s servers)':'';
const whereItRuns=whereModelRuns;

export function describeAiStatus(status:AiReasoningStatus|null|undefined):string{
  if(!status)return 'AI reasoning status unavailable from this backend.';
  if(!status.enabled)return 'AI reasoning is disabled on this deployment (ENABLE_AI_FEATURES is off). The core workbench does not need it.';
  if(!status.provider)return 'AI reasoning is enabled but no provider is selected (AI_PROVIDER must be anthropic, openai or ollama).';
  if(!status.provider_key_configured)return status.provider==='ollama'?'Ollama is selected but no model is chosen (OLLAMA_MODEL must name a model installed in Ollama).':`AI provider "${status.provider}" is selected but its API key is not configured.`;
  const draftAvailable=status.tas_spec.modules.presentation_draft?.available===true;
  if(!status.tas_spec.present)return draftAvailable?'The vendored TAS spec (backend/app/ai/tas_spec) is not checked out, so case synthesis and hypothesis tests cannot run. Presentation drafts do not use it and are available.':'The vendored TAS spec (backend/app/ai/tas_spec) is not checked out, so prompts cannot be built.';
  const missing=Object.entries(status.tas_spec.modules).filter(([,m])=>!m.available).map(([name])=>name);
  if(missing.length)return `TAS module file(s) missing from the vendored spec: ${missing.join(', ')}.`;
  return `Ready: provider ${status.provider}${status.model?`, model ${status.model}`:''}${whereItRuns(status)}, TAS spec v${status.tas_spec.version||'?'} vendored.`;
}

export function AiReasoningPanel({api,investigationId,status,onTraceRecord}:Props):ReactElement{
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
  const [selectedRefs,setSelectedRefs]=useState<SelectedRef[]>([]);
  const [promoteTitle,setPromoteTitle]=useState('');
  const [promoteStatus,setPromoteStatus]=useState('');
  const [promoted,setPromoted]=useState<{kind:'writeup'|'deck',id:string,title:string}|null>(null);
  // Deck look picked in the preview's style panel; sent with "Promote to deck".
  const [styleCatalog,setStyleCatalog]=useState<PresentationStyleCatalog|null>(null);
  const [deckStyle,setDeckStyle]=useState<DeckStyle>({theme:'dark_academia',fonts:'theme'});
  const [visualStyles,setVisualStyles]=useState<Record<string,VisualStyle>>({});
  const catalogRequested=useRef(false);

  // Belt and braces: the backend already folds enabled/provider/key/spec into
  // endpoints_callable, but never offer a run button on a disabled deployment.
  const callable=moduleCallable(status,module);
  useEffect(()=>{
    if(!moduleCallable(status,module)&&moduleCallable(status,'presentation_draft'))setModule('presentation_draft');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[status]);
  const anyCallable=(['case_synthesis','hypothesis_test','presentation_draft'] as AiModuleName[]).some(m=>moduleCallable(status,m));

  const loadQueue=useCallback(async()=>{
    if(!investigationId){setQueue([]);return}
    try{
      const params=filter==='all'?'':`?review_status=${filter}`;
      setQueue(await api.parsed(`/api/investigations/${investigationId}/ai-analysis-candidates${params}`,parseAiAnalysisCandidateList));
      setQueueStatus('');
    }catch(error){setQueue([]);setQueueStatus(errorMessage(error,'Could not load the AI review queue'))}
  },[api,investigationId,filter]);

  useEffect(()=>{setSelected(null);setNote('');setReviewStatus('');setPromoteStatus('');setPromoted(null);void loadQueue()},[loadQueue]);

  // The style catalogue is only needed once a presentation draft is open.
  useEffect(()=>{
    if(selected?.module!=='presentation_draft'||catalogRequested.current)return;
    catalogRequested.current=true;
    api.object('/api/presentation-styles','presentation styles',isPresentationStyleCatalog)
      .then(catalog=>{setStyleCatalog(catalog);setDeckStyle(catalog.defaults)})
      .catch(()=>{catalogRequested.current=false}); // the preview still works in the default look
  },[api,selected]);

  const open=async(id:string)=>{
    setPromoteStatus('');setPromoted(null);setPromoteTitle('');
    if(selected?.id!==id)setVisualStyles({});
    try{setSelected(await api.object(`/api/ai-analysis-candidates/${id}`,'AI analysis candidate',isAiAnalysisCandidate))}
    catch(error){setSelected(null);setReviewStatus(errorMessage(error,'Could not load the candidate'))}
  };

  // A run is a background job (Foundation Fixes fix 4). In developer mode the
  // answer already holds the result; in the Docker stack it is 202 with the
  // job, and the result (or the error the endpoint would have given) arrives
  // on the finished job.
  const startRun=async(endpoint:string,body:unknown)=>{
    const raw=await api.unknown(endpoint,{method:'POST',body});
    if(isAiReasoningRunResult(raw))return raw;
    const job=typeof raw==='object'&&raw!==null&&'job' in raw&&isBackgroundJob((raw as {job:unknown}).job)?(raw as {job:BackgroundJob}).job:null;
    if(!job)throw new ApiPayloadError(endpoint,'reasoning result has an unexpected shape');
    setRunStatus('Queued. The model runs in the background; you can keep working.');
    const done=await waitForJob(api,job.id,j=>setRunStatus(`Running in the background: ${describeJob(j)}`),{intervalMs:2000});
    if(done.status==='succeeded'&&isAiReasoningRunResult(done.result))return done.result;
    const failure=(typeof done.result==='object'&&done.result!==null?done.result:{}) as {status_code?:number,detail?:unknown};
    const detail=typeof failure.detail==='string'?failure.detail:failure.detail!==undefined?JSON.stringify(failure.detail):describeJob(done);
    throw new ApiHttpError(endpoint,failure.status_code??500,detail);
  };

  const run=async()=>{
    if(!investigationId)return;
    if(module==='presentation_draft'){
      if(!goal.trim()||selectedRefs.length===0)return;
      setRunning(true);setRunStatus('Running… the model output is validated against the picked evidence before it can be reviewed.');
      try{
        const body={goal:goal.trim(),record_refs:selectedRefs.map(({record_type,record_id})=>({record_type,record_id}))};
        const result=await startRun(`/api/investigations/${investigationId}/assistant/presentation-draft`,body);
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
      const result=await startRun(`/api/investigations/${investigationId}/assistant/${path}`,body);
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
        const styled=styleCatalog?{...body,style:deckStyle,visual_styles:visualStyles}:body;
        const row=await api.object(`/api/ai-analysis-candidates/${selected.id}/${path}`,'deck',isDeck,{method:'POST',body:styled});
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

  return <Card className="card" data-testid="ai-reasoning-panel"><CardHeader className="pb-3"><CardTitle>AI reasoning &amp; presentations</CardTitle>
    <CardDescription>Bounded reasoning over this investigation&apos;s own evidence, and briefs or decks drafted from evidence you pick. Every run is checked for invented citations and a malformed shape, then parked in a review queue. Accepting marks it as trusted analysis for reporters; it never creates or edits a canonical record.</CardDescription>
    <p className="muted text-sm" data-testid="ai-status">{describeAiStatus(status)}</p></CardHeader><CardContent>
    {!investigationId?<p className="muted">Select an investigation to run or review AI analysis.</p>:<>
      <div className="searchrow">
        <Select value={module} onValueChange={(v:string)=>setModule(v as AiModuleName)} disabled={!anyCallable||running}><SelectTrigger aria-label="Reasoning module" className="w-auto"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="case_synthesis">Case synthesis</SelectItem><SelectItem value="hypothesis_test">Hypothesis test</SelectItem><SelectItem value="presentation_draft">Presentation draft</SelectItem></SelectContent></Select>
        {module!=='presentation_draft'&&<>
          <Input aria-label="Question" value={question} onChange={(e:ChangeEvent<HTMLInputElement>)=>setQuestion(e.target.value)} placeholder="What does the evidence establish about …?" disabled={!callable||running} className="min-w-[12rem] flex-1"/>
          <Input aria-label="Max retrieval results" type="number" min={1} max={100} value={maxResults} onChange={(e:ChangeEvent<HTMLInputElement>)=>setMaxResults(Math.min(100,Math.max(1,Number(e.target.value)||30)))} className="w-20" disabled={!callable||running}/>
          <label className="muted flex items-center gap-1.5 text-sm"><input type="checkbox" className="accent-[hsl(var(--primary))]" checked={includeLeads} onChange={(e:ChangeEvent<HTMLInputElement>)=>setIncludeLeads(e.target.checked)} disabled={!callable||running}/> include external leads</label>
        </>}
        <Button onClick={run} disabled={!callable||running||(module==='presentation_draft'?(!goal.trim()||selectedRefs.length===0):!question.trim())}>{running?'Running…':'Run module'}</Button>
      </div>
      {module==='hypothesis_test'&&<Textarea className="mt-3" aria-label="Working theory" value={theory} onChange={(e:ChangeEvent<HTMLTextAreaElement>)=>setTheory(e.target.value)} placeholder="The working theory to test against the evidence (required for a hypothesis test)." disabled={!callable||running}/>}
      {module==='presentation_draft'&&<div className="mt-3 space-y-3">
        <Textarea aria-label="Goal" value={goal} onChange={(e:ChangeEvent<HTMLTextAreaElement>)=>setGoal(e.target.value)} rows={2} placeholder="What should this brief or deck accomplish? e.g. “Brief my editor on what we can and can’t say about the Bellcastle payment.”" disabled={!callable||running}/>
        <RecordPicker api={api} investigationId={investigationId} selected={selectedRefs} onChange={setSelectedRefs} disabled={!callable||running}/>
      </div>}
      {runStatus&&<p className="muted" data-testid="ai-run-status">{runStatus}</p>}
      <div className="twocol" style={isPresentationDraft?{gridTemplateColumns:'minmax(220px,0.55fr) minmax(0,2fr)'}:undefined}>
        <div>
          <div className="searchrow"><b>Review queue</b><select aria-label="Queue filter" className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground" value={filter} onChange={(e:ChangeEvent<HTMLSelectElement>)=>setFilter(e.target.value as typeof filter)}><option value="all">all</option><option value="proposed">proposed</option><option value="accepted">accepted</option><option value="rejected">rejected</option></select><Button size="sm" variant="outline" onClick={()=>void loadQueue()}>Refresh</Button></div>
          {queueStatus&&<p className="muted">{queueStatus}</p>}
          {!queue.length&&!queueStatus&&<p className="muted">No AI analysis candidates yet for this investigation.</p>}
          {queue.map(c=><div className="candidate" key={c.id} style={selected?.id===c.id?{outline:'2px solid hsl(var(--primary))',outlineOffset:2}:undefined} aria-current={selected?.id===c.id?'true':undefined}><b>{moduleLabel(c.module)}</b> <small>{c.review_status} · {c.checked_citation_count} citation(s) checked · {c.created_at.replace('T',' ').slice(0,16)}</small>
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
            {isPresentationDraft&&payload&&<div className="mt-3">
              <DraftPreview payload={payload} slides={selected.deck_preview||[]} citationDetails={selected.citation_details||[]} onTrace={onTraceRecord}
                catalog={styleCatalog} deckStyle={deckStyle} onDeckStyleChange={setDeckStyle}
                visualStyles={visualStyles} onVisualStyleChange={(section,style)=>setVisualStyles(prev=>({...prev,[section]:style}))}/>
            </div>}
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
              <Textarea className="mt-3" aria-label="Reviewer note" value={note} onChange={(e:ChangeEvent<HTMLTextAreaElement>)=>setNote(e.target.value)} placeholder="Reviewer note (why this is or is not trustworthy)."/>
              <div className="actions"><Button onClick={()=>void review('accept')}>Accept as trusted analysis</Button><Button variant="outline" onClick={()=>void review('reject')}>Reject</Button></div>
            </>:<p className="muted">Reviewed {selected.reviewed_at?selected.reviewed_at.replace('T',' ').slice(0,16):''}{selected.reviewer_note?` · ${selected.reviewer_note}`:''}</p>}
            {reviewStatus&&<p className="muted" data-testid="ai-review-status">{reviewStatus}</p>}
            {isPresentationDraft&&selected.review_status==='accepted'&&<div className="mt-4 rounded-lg border border-border bg-card p-4" data-testid="promote-panel">
              <div className="text-sm font-semibold text-foreground">Make it a document or a deck</div>
              <p className="mt-0.5 text-xs text-muted-foreground">Creates an editable write-up or deck from this reviewed draft. You can do both, more than once.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input aria-label="Promoted title" value={promoteTitle} onChange={(e:ChangeEvent<HTMLInputElement>)=>setPromoteTitle(e.target.value)} placeholder={asStr(payload?.title)||'Title (optional — defaults to the draft title)'} className="min-w-[14rem] flex-1"/>
                <Button type="button" size="sm" onClick={()=>void promote('writeup')}><FileText className="mr-1.5 h-4 w-4"/>Promote to write-up</Button>
                <Button type="button" size="sm" variant="outline" onClick={()=>void promote('deck')}><Presentation className="mr-1.5 h-4 w-4"/>Promote to deck</Button>
              </div>
              {promoteStatus&&<p className="mt-2 text-sm text-muted-foreground" data-testid="promote-status">{promoteStatus}</p>}
              {promoted&&<a data-testid="promote-download-link" href={`${api.baseUrl}/api/${promoted.kind==='writeup'?'writeups':'decks'}/${promoted.id}/export.${promoted.kind==='writeup'?'docx':'pptx'}`} className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Download className="h-4 w-4"/>Download {promoted.kind==='writeup'?'.docx':'.pptx'}</a>}
            </div>}
          </div>}
        </div>
      </div>
    </>}
  </CardContent></Card>;
}

export default AiReasoningPanel;
