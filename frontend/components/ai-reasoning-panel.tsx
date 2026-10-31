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
import type {ChangeEvent,ReactElement,ReactNode} from 'react';

import type {AiAnalysisCandidate,AiAnalysisCandidateSummary,AiModuleName,AiReasoningStatus,BackgroundJob,DeckStyle,JsonObject,JsonValue,PresentationStyleCatalog,VisualStyle} from '../lib/api-types';
import {ApiPayloadError,isAiAnalysisCandidate,isAiAnalysisCandidateReview,isAiReasoningRunResult,isBackgroundJob,isDeck,isPresentationStyleCatalog,isWriteup,parseAiAnalysisCandidateList} from '../lib/api-validate';
import {ApiClient,ApiHttpError,errorMessage} from '../lib/api-client';
import type {ChartRestyleOut} from '../lib/generated/types.gen';
import {timeWords} from '../lib/timestamps';
import {getAiAnalysisCandidateEndpoint,investigationVisualRestyle,listInvestigationAiAnalysisCandidates,presentationStyles,
  promoteAiAnalysisCandidateToDeckEndpoint,promoteAiAnalysisCandidateToWriteupEndpoint,reviewAiAnalysisCandidateEndpoint} from '../lib/generated/sdk.gen';
import type {ChartRestyleRequest} from '../lib/generated/types.gen';
import {narrowed} from '../lib/narrow';
import {describeJob,waitForJob} from '../lib/jobs';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Reveal} from '@/components/ui/reveal';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Download, FileText, Presentation} from 'lucide-react';
import {askBeforeYouRun} from '../features/ai/before-you-run';
import {RecordPicker} from './presentation/record-picker';
import type {SelectedRef} from './presentation/record-picker';
import {DraftPreview} from './presentation/draft-preview';
import type {DeckKind} from './presentation/draft-preview';
import type {TraceHandler} from './presentation/draft-preview';

// onTraceRecord: opens the page's provenance drawer for a cited record (an
// evidence chip in a presentation draft's preview).
type Props={api:ApiClient,investigationId:string,status:AiReasoningStatus|null|undefined,onTraceRecord?:TraceHandler,
  /** Drawn beside the empty state, to fill it (the workbench passes the case's claims a draft could test). */
  emptyAside?:ReactNode};

const MODULE_LABEL:Record<AiModuleName,string>={case_synthesis:'Case synthesis (TAS module 08)',hypothesis_test:'Hypothesis & contradiction test (TAS module 06)',presentation_draft:'Presentation draft (brief/deck from picked evidence)',
  research_vetting:'Research vetting (RAS modules 03 and 04)',quant_framing:'Rival explanations (QAS modules 01 and 03)',las_argument_check:'Logic check (LAS modules 01 and 02)',
  das_framing:'Decision framing (DAS module 01)',das_options:'Options and evidence (DAS module 02)',evidence_plan:'Evidence plan (EGS module 01)',
  ehs_harm_minimisation:'Harm assessment (EHS module 02)',ehs_public_interest:'Public interest (EHS module 01)'};
const moduleLabel=(m:string):string=>(m in MODULE_LABEL?MODULE_LABEL[m as AiModuleName]:m);

// presentation_draft is app-local (backend/app/ai/presentation_modules), not
// vendored suite content: it can run when the suite copy is missing, so
// callability is decided per module rather than from endpoints_callable alone.
export function moduleCallable(status:AiReasoningStatus|null|undefined,module:AiModuleName):boolean{
  if(!status||!status.enabled||!status.provider||!status.provider_key_configured)return false;
  if(module==='presentation_draft')return status.authority_suite.modules.presentation_draft?.available!==false;
  return Boolean(status.endpoints_callable);
}

// Endpoint 422s carry a structured detail ({message, invalid_citations|schema_errors});
// ApiHttpError flattens non-string details to JSON, which is what a reviewer needs to see.
const runFailureMessage=(error:unknown):string=>errorMessage(error,'Reasoning run failed');

const asObj=(v:JsonValue|undefined):JsonObject|null=>(typeof v==='object'&&v!==null&&!Array.isArray(v))?v:null;

// The writing check's practices in words (backend app/ai/writing_check.py).
const WRITING_PRACTICES:Record<string,string>={short_sentences:'Short sentences',likelihood:'Likelihood words (ICD 203)',headline:'Slide headline is a claim',main_point:'One main point',single_source:'Rests on one record'};

/** What the writing check found in a presentation draft: nothing is removed;
 *  each finding names the practice, where it is and what to do. */
export function WritingReport({report}:{report:JsonObject|null}):ReactElement|null{
  if(!report)return null;
  const findings=(Array.isArray(report.findings)?report.findings:[]).map(f=>asObj(f)).filter((f):f is JsonObject=>f!==null);
  return <details className="candidate" data-testid="writing-report" open={findings.length>0}>
    <summary><b>Writing check</b> · {findings.length===0?'nothing to look at':`${findings.length} thing${findings.length===1?'':'s'} to look at before accepting`}</summary>
    <ul className="mt-1 space-y-1">{findings.map((f,i)=><li key={i}>
      <b>{WRITING_PRACTICES[String(f.practice)]??String(f.practice)}</b> · {String(f.where??'')}: {String(f.message??'')}
      {typeof f.sentence==='string'&&f.sentence&&<div><small>“{f.sentence}”</small></div>}
    </li>)}</ul>
  </details>;
}
const asArr=(v:JsonValue|undefined):JsonValue[]=>Array.isArray(v)?v:[];
const asStr=(v:JsonValue|undefined):string=>typeof v==='string'?v:(v===undefined||v===null?'':JSON.stringify(v));
const refLabel=(v:JsonValue):string=>{const o=asObj(v);return o?`${asStr(o.record_type)}:${asStr(o.record_id)}`:asStr(v)};
const refs=(v:JsonValue|undefined):string=>asArr(v).map(refLabel).join(', ')||'none';
// The suite's fixed values, in words (systems/tas/EVALUATION/OUTPUT_SCHEMAS.md).
// Unknown values (older runs) are shown as sent.
export const words=(v:JsonValue|undefined):string=>{const s=asStr(v);return /^[A-Z_ ]+$/.test(s)?(s.charAt(0)+s.slice(1).toLowerCase()).replace(/_/g,' '):s};
/** A gap is a Gap record ({gap_id, unresolved_question, …}) since the suite; older runs sent a sentence. */
const gapText=(g:JsonValue):string=>{const o=asObj(g);if(!o)return asStr(g);
  const head=[asStr(o.gap_id),asStr(o.unresolved_question)].filter(Boolean).join(' · ');
  const need=asStr(o.needed_record_or_testimony);const on=asArr(o.bears_on).map(asStr).join(', ');
  return `${head}${need?` — needs ${need}`:''}${on?` (bears on ${on})`:''}`};
/** A contradiction side is {statement, evidence} since the suite; older runs sent a string plus a shared evidence list. */
const sideText=(v:JsonValue|undefined):string=>{const o=asObj(v);return o?`${asStr(o.statement)} [${refs(o.evidence)}]`:asStr(v)};

// Which computer reads the evidence the model is sent (Foundation Fixes fix 4).
// Which computer answers (Foundation Fixes fix 4): the settings page shows the same words.
export const whereModelRuns=(status:AiReasoningStatus):string=>status.runs_on_this_computer===true?' (runs on this computer)':status.runs_on_this_computer===false?' (runs on the provider\'s servers)':'';
const whereItRuns=whereModelRuns;

/** Supporting and contradicting evidence as counts (✓ 2 · ✕ 0); the record labels are revealed on them. */
function StanceCounts({supports,contradicts,more=''}:{supports:string[];contradicts:string[];more?:string}):ReactElement{
  return <Reveal detail={`Supports: ${supports.join(', ')||'none'} · Contradicts: ${contradicts.join(', ')||'none'}${more}`}>
    <small>✓ {supports.length} · ✕ {contradicts.length}</small></Reveal>;
}

export function describeAiStatus(status:AiReasoningStatus|null|undefined):string{
  if(!status)return 'AI reasoning status unavailable from this backend.';
  if(!status.enabled)return 'AI reasoning is disabled on this deployment (ENABLE_AI_FEATURES is off). The core workbench does not need it.';
  if(!status.provider)return 'AI reasoning is enabled but no provider is selected (AI_PROVIDER must be anthropic, openai or ollama).';
  if(!status.provider_key_configured)return status.provider==='ollama'?'Ollama is selected but no model is chosen (OLLAMA_MODEL must name a model installed in Ollama).':`AI provider "${status.provider}" is selected but its API key is not configured.`;
  const suite=status.authority_suite;
  const draftAvailable=suite.modules.presentation_draft?.available===true;
  if(!suite.present)return draftAvailable?'The Authority System Suite copy (backend/app/ai/authority_suite) is missing, so case synthesis and hypothesis tests cannot run. Presentation drafts do not use it and are available.':'The Authority System Suite copy (backend/app/ai/authority_suite) is missing, so prompts cannot be built.';
  const missing=Object.entries(suite.modules).filter(([,m])=>!m.available).map(([name])=>name);
  if(missing.length)return `Module file(s) missing from the Authority System Suite copy: ${missing.join(', ')}.`;
  return `Ready: provider ${status.provider}${status.model?`, model ${status.model}`:''}${whereItRuns(status)}, Authority System Suite (TAS v${suite.tas_version||'?'}).`;
}

/** The AI's state in two words, for the panel's status mark; the full sentence (describeAiStatus) is revealed on it.
 *  Null when the state needs its sentence on screen (a suite file missing: something to fix in the suite). */
export function aiStateWord(status:AiReasoningStatus|null|undefined):string|null{
  if(!status)return 'AI state unknown';
  if(!status.enabled)return 'AI is off';
  if(!status.provider||!status.provider_key_configured)return 'No model chosen';
  return null;
}

export function AiReasoningPanel({api,investigationId,status,onTraceRecord,emptyAside}:Props):ReactElement{
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
  // Duarte's two kinds of deck: to present, or a slidedoc to read alone.
  const [deckKind,setDeckKind]=useState<DeckKind>('presenting');
  const catalogRequested=useRef(false);
  // A checked chart in the draft, drawn again and checked again by the
  // backend in the style and theme picked (POST .../visuals/restyle), by
  // section index; the key of the last request per section drops a reply
  // that a newer pick has overtaken.
  const [chartLooks,setChartLooks]=useState<Record<string,ChartRestyleOut>>({});
  const [chartProblems,setChartProblems]=useState<Record<string,string>>({});
  const lookKeys=useRef<Record<string,string>>({});

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
      const listed=(await listInvestigationAiAnalysisCandidates({path:{investigation_id:investigationId},query:filter==='all'?{}:{review_status:filter},throwOnError:true})).data;
      setQueue(parseAiAnalysisCandidateList(listed,'/api/investigations/{investigation_id}/ai-analysis-candidates'));
      setQueueStatus('');
    }catch(error){setQueue([]);setQueueStatus(errorMessage(error,'Could not load the AI review queue'))}
  },[investigationId,filter]);

  useEffect(()=>{setSelected(null);setNote('');setReviewStatus('');setPromoteStatus('');setPromoted(null);void loadQueue()},[loadQueue]);

  // The style catalogue is only needed once a presentation draft is open.
  useEffect(()=>{
    if(selected?.module!=='presentation_draft'||catalogRequested.current)return;
    catalogRequested.current=true;
    presentationStyles({throwOnError:true})
      .then(({data})=>narrowed(data,isPresentationStyleCatalog,'/api/presentation-styles','presentation styles'))
      .then(catalog=>{setStyleCatalog(catalog);setDeckStyle(catalog.defaults)})
      .catch(()=>{catalogRequested.current=false}); // the preview still works in the default look
  },[selected]);

  // Every chart is asked for again when its style or the deck's theme
  // changes; the reply shows on the slide and in the style panel, with its
  // check report. Nothing is stored: promotion sends the styles, and the
  // deck checks its charts once more itself.
  useEffect(()=>{
    if(selected?.module!=='presentation_draft'||!styleCatalog||!investigationId)return;
    const candidateId=selected.id;
    asArr(selected.payload?.sections).forEach((raw,index)=>{
      const chart=asObj(asObj(raw)?.visual);
      if(!chart||chart.type!=='chart')return;
      const section=String(index);
      const style=visualStyles[section]??null;
      const key=JSON.stringify([candidateId,style,deckStyle]);
      if(lookKeys.current[section]===key)return;
      lookKeys.current[section]=key;
      const latest=()=>lookKeys.current[section]===key;
      investigationVisualRestyle({path:{investigation_id:investigationId},body:{chart,style,deck_style:deckStyle} as ChartRestyleRequest,throwOnError:true})
        .then(({data:look})=>{
          if(!latest())return;
          setChartLooks(prev=>({...prev,[section]:look}));
          setChartProblems(prev=>Object.fromEntries(Object.entries(prev).filter(([k])=>k!==section)));
        })
        .catch((error:unknown)=>{
          // A 422's detail says in plain words why the chart cannot be drawn this way; the slide keeps its last drawing.
          if(latest())setChartProblems(prev=>({...prev,[section]:error instanceof ApiHttpError?error.detail:errorMessage(error,'Could not draw this chart in that style')}));
        });
    });
  },[investigationId,selected,styleCatalog,deckStyle,visualStyles]);

  const open=async(id:string)=>{
    setPromoteStatus('');setPromoted(null);setPromoteTitle('');
    if(selected?.id!==id){setVisualStyles({});setChartLooks({});setChartProblems({});lookKeys.current={}}
    try{
      const candidate=(await getAiAnalysisCandidateEndpoint({path:{candidate_id:id},throwOnError:true})).data;
      setSelected(narrowed(candidate,isAiAnalysisCandidate,'/api/ai-analysis-candidates/{candidate_id}','AI analysis candidate'));
    }
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
    // Case synthesis and theory tests go through Before you run (Act › AI runs): the plan, the settings and what
    // leaves the computer are seen before anything is sent. Nothing runs from here.
    if(module!=='case_synthesis'&&module!=='hypothesis_test')return;
    setRunStatus('');
    askBeforeYouRun(investigationId,{module,question:question.trim(),theory:module==='hypothesis_test'?theory.trim():'',maxResults,includeLeads});
  };

  const review=async(decision:'accept'|'reject')=>{
    if(!selected)return;
    try{
      const reply=(await reviewAiAnalysisCandidateEndpoint({path:{candidate_id:selected.id},body:{decision,note:note.trim()||null},throwOnError:true})).data;
      const result=narrowed(reply,isAiAnalysisCandidateReview,'/api/ai-analysis-candidates/{candidate_id}/review','candidate review');
      setReviewStatus(`Recorded: ${result.review_status}.`);
      await loadQueue();
      await open(selected.id);
    }catch(error){setReviewStatus(errorMessage(error,'Review failed'))}
  };

  const promote=async(kind:'writeup'|'deck')=>{
    if(!selected)return;
    setPromoteStatus('Promoting…');
    try{
      const body=promoteTitle.trim()?{title:promoteTitle.trim()}:{};
      const path={candidate_id:selected.id};
      if(kind==='writeup'){
        const made=(await promoteAiAnalysisCandidateToWriteupEndpoint({path,body,throwOnError:true})).data;
        const row=narrowed(made,isWriteup,'/api/ai-analysis-candidates/{candidate_id}/promote-to-writeup','write-up');
        setPromoteStatus(`Promoted to write-up "${row.title}" (${row.word_count} word(s), status ${row.status}).`);
        setPromoted({kind:'writeup',id:row.id,title:row.title});
      }else{
        const styled={...(styleCatalog?{...body,style:deckStyle,visual_styles:visualStyles}:body),deck_kind:deckKind};
        const made=(await promoteAiAnalysisCandidateToDeckEndpoint({path,body:styled,throwOnError:true})).data;
        const row=narrowed(made,isDeck,'/api/ai-analysis-candidates/{candidate_id}/promote-to-deck','deck');
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
  const replies=asArr(payload?.right_of_reply_needed);
  const isPresentationDraft=selected?.module==='presentation_draft';

  // The panel's explanation is revealed on its title. The AI's state is the AI mark with its sentence on reveal: lit when
  // ready, hollow and grey when off or with no model chosen (a calm state, DECISIONS_LOG 27, as on AI runs), with
  // Settings beside it. Any other state (a missing suite file) blocks a run and stays written out.
  const aiStatus=describeAiStatus(status);
  const offWord=aiStateWord(status);
  const empty=Boolean(investigationId)&&!queue.length&&!queueStatus&&filter==='all'&&!selected;
  return <Card className="card" data-testid="ai-reasoning-panel"><CardHeader className="pb-3"><CardTitle>
    <Reveal detail="Bounded reasoning over this investigation’s own evidence, and briefs or decks drafted from evidence you pick. Every run is checked for invented citations and a malformed shape, then parked in a review queue. Accepting marks it as trusted analysis for reporters; it never creates or edits a canonical record.">
      <span>AI reasoning &amp; presentations</span></Reveal></CardTitle>
    <p className="muted text-sm" data-testid="ai-status">{aiStatus.startsWith('Ready:')?<Reveal label="AI ready" detail={aiStatus}><span className="ai-notice" aria-hidden="true">AI ✓</span></Reveal>
      :offWord?<span className="ai-drafts-off"><Reveal label={offWord} detail={<><b>{offWord}</b> · nothing runs or leaves this computer; drafts already made stay here to review.<span className="rv-row">{aiStatus}</span></>}>
          <span className="ai-notice ai-notice-off" aria-hidden="true">AI</span></Reveal>
        <Reveal tabbable={false} detail="Turn AI on in Settings › AI and research"><a href="/settings#ai" className="ai-drafts-settings" aria-label="Settings › AI and research">Settings ›</a></Reveal></span>
      :aiStatus}</p></CardHeader><CardContent>
    {!investigationId?<p className="muted">Select an investigation to run or review AI analysis.</p>:<>
      {anyCallable&&<><div className="searchrow">
        <Select value={module} onValueChange={(v:string)=>setModule(v as AiModuleName)} disabled={!anyCallable||running}><SelectTrigger aria-label="Reasoning module" className="w-auto"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="case_synthesis">Case synthesis</SelectItem><SelectItem value="hypothesis_test">Hypothesis test</SelectItem><SelectItem value="presentation_draft">Presentation draft</SelectItem></SelectContent></Select>
        {module!=='presentation_draft'&&<>
          <Input aria-label="Question" value={question} onChange={(e:ChangeEvent<HTMLInputElement>)=>setQuestion(e.target.value)} placeholder="What does the evidence establish about …?" disabled={!callable||running} className="min-w-[12rem] flex-1"/>
          <Input aria-label="Max retrieval results" type="number" min={1} max={100} value={maxResults} onChange={(e:ChangeEvent<HTMLInputElement>)=>setMaxResults(Math.min(100,Math.max(1,Number(e.target.value)||30)))} className="w-20" style={{flex:'0 0 5rem',width:'5rem',minWidth:0}} disabled={!callable||running}/>
          <label className="muted flex items-center gap-1.5 text-sm" style={{whiteSpace:'nowrap'}}><input type="checkbox" className="accent-[hsl(var(--primary))]" style={{flex:'none'}} checked={includeLeads} onChange={(e:ChangeEvent<HTMLInputElement>)=>setIncludeLeads(e.target.checked)} disabled={!callable||running}/> include external leads</label>
        </>}
        <Button onClick={run} disabled={!callable||running||(module==='presentation_draft'?(!goal.trim()||selectedRefs.length===0):!question.trim())}>{running?'Running…':'Run module'}</Button>
      </div>
      {module==='hypothesis_test'&&<Textarea className="mt-3" aria-label="Working theory" value={theory} onChange={(e:ChangeEvent<HTMLTextAreaElement>)=>setTheory(e.target.value)} placeholder="The working theory to test against the evidence (required for a hypothesis test)." disabled={!callable||running}/>}
      {module==='presentation_draft'&&<div className="mt-3 space-y-3">
        <Textarea aria-label="Goal" value={goal} onChange={(e:ChangeEvent<HTMLTextAreaElement>)=>setGoal(e.target.value)} rows={2} placeholder="What should this brief or deck accomplish? e.g. “Brief my editor on what we can and can’t say about the Bellcastle payment.”" disabled={!callable||running}/>
        <RecordPicker investigationId={investigationId} selected={selectedRefs} onChange={setSelectedRefs} disabled={!callable||running}/>
      </div>}</>}
      {runStatus&&<p className="muted" data-testid="ai-run-status">{runStatus}</p>}
      {empty?<div className="ai-drafts-empty">
        <section className="ai-drafts-what" aria-label="What a draft is">
          <p className="ai-drafts-empty-head">No drafts yet</p>
          {/* What a draft is, as its path: each step a mark with one word, what happens there on reveal. */}
          <ol className="ai-drafts-flow">
            <li><Reveal detail="You ask a question in Ask the case, and see what the run will read and send before it starts."><span><i aria-hidden="true">?</i><b>Ask</b></span></Reveal></li>
            <li><Reveal detail="The answer lands here as a draft. Every citation is checked against the case’s records, and an answer that invents one is turned away."><span><i className="ai-notice" aria-hidden="true">AI</i><b>Draft</b></span></Reveal></li>
            <li><Reveal detail="You read it with its citations and accept or reject it. Nothing joins the case until you accept it, and accepting never edits a record."><span><i aria-hidden="true">✓</i><b>You decide</b></span></Reveal></li>
          </ol>
          <a href="#ai-runs" className="ai-drafts-ask">Ask the case</a>
        </section>
        {emptyAside}
      </div>:<div className="twocol" style={isPresentationDraft?{gridTemplateColumns:'minmax(220px,0.55fr) minmax(0,2fr)'}:undefined}>
        <div>
          {(queue.length>0||filter!=='all'||queueStatus)&&<div className="searchrow"><b>Review queue</b><select aria-label="Queue filter" className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground" value={filter} onChange={(e:ChangeEvent<HTMLSelectElement>)=>setFilter(e.target.value as typeof filter)}><option value="all">all</option><option value="proposed">proposed</option><option value="accepted">accepted</option><option value="rejected">rejected</option></select><Button size="sm" variant="outline" onClick={()=>void loadQueue()}>Refresh</Button></div>}
          {queueStatus&&<p className="muted">{queueStatus}</p>}
          {!queue.length&&!queueStatus&&filter!=='all'&&<p className="muted">No {filter} drafts.</p>}
          {queue.map(c=><div className="candidate" key={c.id} style={selected?.id===c.id?{outline:'2px solid hsl(var(--primary))',outlineOffset:2}:undefined} aria-current={selected?.id===c.id?'true':undefined}><Reveal detail={`${c.checked_citation_count} citation(s) checked · ${timeWords(c.created_at)}`}><b>{moduleLabel(c.module)}</b></Reveal> <small>{c.review_status}</small>
            <div>{asStr(c.request.question??'')||<i>no question recorded</i>}</div>
            {c.reviewer_note&&<small>{c.reviewer_note}</small>}
            <div className="actions"><Button size="sm" variant="outline" onClick={()=>{setReviewStatus('');setNote('');void open(c.id)}}>Open</Button></div>
          </div>)}
        </div>
        <div>
          {!selected?(queue.length?<p className="muted">Open a draft to read its claims and citations.</p>:null):<div data-testid="ai-candidate-detail">
            <h2 style={{fontSize:20}}>{moduleLabel(selected.module)} · {selected.review_status}</h2>
            <div className="muted"><b>{isPresentationDraft?'Goal:':'Question:'}</b> {asStr(selected.request.question??'')}{selected.request.working_theory?<><br/><b>Working theory:</b> {asStr(selected.request.working_theory)}</>:null}</div>
            {payload&&'executive_summary' in payload&&<p><b>Summary:</b> {asStr(payload.executive_summary)}</p>}
            {payload&&'scope_and_limitations' in payload&&<p className="muted"><b>Scope & limitations:</b> {asStr(payload.scope_and_limitations)}</p>}
            {isPresentationDraft&&payload&&<div className="mt-3">
              <WritingReport report={selected.trace?asObj(selected.trace.writing_check):null}/>
              <DraftPreview payload={payload} slides={selected.deck_preview||[]} citationDetails={selected.citation_details||[]} onTrace={onTraceRecord} howWeKnow={selected.how_we_know} deckKind={deckKind}
                catalog={styleCatalog} deckStyle={deckStyle} onDeckStyleChange={setDeckStyle}
                visualStyles={visualStyles} onVisualStyleChange={(section,style)=>setVisualStyles(prev=>({...prev,[section]:style}))}
                chartLooks={chartLooks} chartProblems={chartProblems}/>
            </div>}
            {claims.map((raw,i)=>{const cl=asObj(raw);if(!cl)return null;return <div className="candidate" key={asStr(cl.claim_id)||String(i)}>
              <Reveal detail={`${words(cl.classification)} · ${cl.confidence_term?`${words(cl.confidence_term)} · `:''}confidence ${words(cl.confidence)}`}><b>{asStr(cl.claim_id)||`Claim ${i+1}`}</b></Reveal>
              <div>{asStr(cl.claim)}</div>
              {asStr(cl.warrant)&&<div><b>Warrant:</b> {asStr(cl.warrant)}</div>}
              {asStr(cl.confidence_basis)&&<div><b>Why this confidence:</b> {asStr(cl.confidence_basis)}</div>}
              <StanceCounts supports={asArr(cl.supporting_evidence).map(refLabel)} contradicts={asArr(cl.contradicting_evidence).map(refLabel)}/>
            </div>})}
            {hypotheses.map((raw,i)=>{const h=asObj(raw);if(!h)return null;return <div className="candidate" key={asStr(h.hypothesis_id)||String(i)}>
              <Reveal detail={[h.kind?words(h.kind):'',typeof h.viable==='boolean'?(h.viable?'still viable':'no longer viable'):'',asStr(h.diagnostic_value)].filter(Boolean).join(' · ')}><b>{asStr(h.hypothesis_id)||`Hypothesis ${i+1}`}</b></Reveal>
              {typeof h.viable==='boolean'&&<span aria-hidden="true" className={h.viable?'text-[var(--status-supported)]':'text-muted-foreground'}> {h.viable?'●':'○'}</span>}
              <div>{asStr(h.hypothesis)}</div>
              {asStr(h.assessment)&&<div><b>Assessment:</b> {asStr(h.assessment)}</div>}
              {asArr(h.falsifiers).length>0&&<div><b>Falsifiers:</b> {asArr(h.falsifiers).map(asStr).join(' · ')}</div>}
              {asArr(h.missing_records).length>0&&<div><b>Missing records:</b> {asArr(h.missing_records).map(asStr).join(' · ')}</div>}
              <StanceCounts supports={asArr(h.supporting_evidence).map(refLabel)} contradicts={asArr(h.contradicting_evidence).map(refLabel)}
                more={`${asArr(h.ambiguous_evidence).length?` · Ambiguous: ${refs(h.ambiguous_evidence)}`:''}${asArr(h.non_diagnostic_evidence).length?` · Fits every hypothesis (not counted): ${refs(h.non_diagnostic_evidence)}`:''}`}/>
            </div>})}
            {conflicts.map((raw,i)=>{const c=asObj(raw);if(!c)return null;return <div className="candidate" key={asStr(c.conflict_id)||String(i)}>
              <Reveal detail={`${words(c.conflict_type)} · ${'resolution' in c?(c.resolution===null?'open':asStr(c.resolution)):asStr(c.resolution_status)}`}><b>{asStr(c.conflict_id)||`Conflict ${i+1}`}</b></Reveal>
              <div>A: {sideText(c.statement_a)}</div><div>B: {sideText(c.statement_b)}</div>
              {asStr(c.same_proposition_basis)&&<small>Same proposition? {asStr(c.same_proposition_basis)}</small>}
              {asArr(c.evidence).length>0&&<small>Evidence: {refs(c.evidence)}</small>}
            </div>})}
            {payload&&'conclusion' in payload&&<p><b>Conclusion:</b> {asStr(payload.conclusion)}</p>}
            {payload&&asStr(payload.most_likely_failure)&&<p><b>Most likely way this is wrong:</b> {asStr(payload.most_likely_failure)}</p>}
            {replies.length>0&&<div data-testid="right-of-reply"><Reveal detail="A person makes the approach and records the answer; the AI never does."><b>Right of reply needed before publishing:</b></Reveal><ul>{replies.map((raw,i)=>{const r=asObj(raw);if(!r)return null;
              return <li key={i}>{asStr(r.subject)} · on {asArr(r.claim_ids).map(asStr).join(', ')||'—'}{asStr(r.what_will_be_said)?`: ${asStr(r.what_will_be_said)}`:''}
                {asArr(r.draft_questions).length>0&&<div><small>Questions a person could ask: {asArr(r.draft_questions).map(asStr).join(' · ')}</small></div>}</li>})}</ul>
              </div>}
            {gaps.length>0&&<div><b>Investigative gaps:</b><ul>{gaps.map((g,i)=><li key={i}>{gapText(g)}</li>)}</ul></div>}
            <details><summary className="muted">Checked against {selected.checked_citation_ids.length} citation id(s) · raw payload</summary><pre style={{whiteSpace:'pre-wrap',fontSize:12}}>{JSON.stringify(payload,null,2)}</pre></details>
            {selected.trace&&<details data-testid="ai-trace"><summary className="muted">What the model was sent · {asStr(selected.trace.response&&asObj(selected.trace.response)?.model)}{selected.trace.response&&asObj(selected.trace.response)?.truncated?' · truncated':''}</summary>
              <div className="muted"><b>System prompt</b></div><pre style={{whiteSpace:'pre-wrap',fontSize:11,maxHeight:300,overflowY:'auto'}}>{asStr(selected.trace.system_prompt)}</pre>
              <div className="muted"><b>User prompt (retrieval packet)</b></div><pre style={{whiteSpace:'pre-wrap',fontSize:11,maxHeight:300,overflowY:'auto'}}>{asStr(selected.trace.user_prompt)}</pre>
            </details>}
            {selected.review_status==='proposed'?<>
              <Textarea className="mt-3" aria-label="Reviewer note" value={note} onChange={(e:ChangeEvent<HTMLTextAreaElement>)=>setNote(e.target.value)} placeholder="Reviewer note (why this is or is not trustworthy)."/>
              <div className="actions"><Button onClick={()=>void review('accept')}>Accept as trusted analysis</Button><Button variant="outline" onClick={()=>void review('reject')}>Reject</Button></div>
            </>:<p className="muted">Reviewed {selected.reviewed_at?timeWords(selected.reviewed_at):''}{selected.reviewer_note?` · ${selected.reviewer_note}`:''}</p>}
            {reviewStatus&&<p className="muted" data-testid="ai-review-status">{reviewStatus}</p>}
            {isPresentationDraft&&selected.review_status==='accepted'&&<div className="mt-4 rounded-lg border border-border bg-card p-4" data-testid="promote-panel">
              <div className="text-sm font-semibold text-foreground"><Reveal detail="Creates an editable write-up or deck from this reviewed draft. You can do both, more than once."><span>Make it a document or a deck</span></Reveal></div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input aria-label="Promoted title" value={promoteTitle} onChange={(e:ChangeEvent<HTMLInputElement>)=>setPromoteTitle(e.target.value)} placeholder={asStr(payload?.title)||'Title (optional — defaults to the draft title)'} className="min-w-[14rem] flex-1"/>
                <Button type="button" size="sm" onClick={()=>void promote('writeup')}><FileText className="mr-1.5 h-4 w-4"/>Promote to write-up</Button>
                <select aria-label="Kind of deck" className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground" value={deckKind} onChange={(e:ChangeEvent<HTMLSelectElement>)=>setDeckKind(e.target.value as DeckKind)}>
                  <option value="presenting">Deck to present (prose in the notes)</option>
                  <option value="slidedoc">Slidedoc to read alone (prose on the slides)</option>
                </select>
                <Button type="button" size="sm" variant="outline" onClick={()=>void promote('deck')}><Presentation className="mr-1.5 h-4 w-4"/>Promote to deck</Button>
              </div>
              {promoteStatus&&<p className="mt-2 text-sm text-muted-foreground" data-testid="promote-status">{promoteStatus}</p>}
              {promoted&&<a data-testid="promote-download-link" href={`${api.baseUrl}/api/${promoted.kind==='writeup'?'writeups':'decks'}/${promoted.id}/export.${promoted.kind==='writeup'?'docx':'pptx'}`} className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Download className="h-4 w-4"/>Download {promoted.kind==='writeup'?'.docx':'.pptx'}</a>}
            </div>}
          </div>}
        </div>
      </div>}
    </>}
  </CardContent></Card>;
}

export default AiReasoningPanel;
