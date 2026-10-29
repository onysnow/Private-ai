'use client';
// The chart builder: a reporter makes a checked chart from the
// investigation's own records, with no AI involved (visuals pass 3). It
// writes the same order slip the AI writes (backend/app/visuals/spec.py),
// chosen the way the AI is told to choose (PRESENTATION_DRAFT.md): first the
// question the chart answers (the Financial Times' Visual Vocabulary), then
// the data that answers it -- only the queries that hold that relationship,
// from GET /api/investigations/{id}/visuals/catalog, which says which have
// records -- then one of the kinds that answer the question and can draw
// that data. POST /api/investigations/{id}/visuals/preview cooks every value
// from the records, draws the chart and checks it against the design rules;
// the panel shows the chart, its words and every rule it fails, by number,
// in plain words. A chart that passes can be kept in a deck or a write-up
// (keep-chart.tsx); the server draws and checks it again when it is kept.
//
// The catalogue runs every query once, so it is asked for only when the
// builder is opened. ECharts loads on demand (next/dynamic), as on every
// other panel, so it never counts against the page's first load.
import {useMutation, useQuery} from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Reveal} from '@/components/ui/reveal';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {chartFromPreview, isChartKind, kindName} from '../../components/presentation/chart-data';
import {ChartFrame} from '../../components/charts/chart-frame';
import {CheckReportView} from '../../components/presentation/check-report';
import {ApiHttpError, errorMessage} from '../../lib/api-client';
import type {AiCitationRef} from '../../lib/api-types';
import {investigationVisualCatalogOptions, investigationVisualPreviewMutation} from '../../lib/generated/@tanstack/react-query.gen';
import type {VisualCatalogOut, VisualQueryOut, VisualQuestionOut, VisualSpec} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import type {ProvenanceRequest} from '../../lib/workbench-store';
import {KeepChart} from './keep-chart';

const ChartFigure = dynamic(() => import('../../components/presentation/chart-visual').then(m => m.ChartFigure),
  {ssr: false, loading: () => <p className="muted">Loading chart…</p>});

// A Radix select item cannot hold an empty value, so "the query's own
// choice" (the currency with the most payments) has a name of its own.
const QUERY_DEFAULT = '__default__';
// The catalogue's parameters by what they ask (backend/app/visuals/spec.py).
const PARAM_LABELS: Record<string, string> = {direction: 'Direction', granularity: 'Group dates by', currency: 'Currency',
  before: 'Before (the earlier picture)', after: 'After (the later picture)'};

type Props = {investigationId: string};

/** The kinds the builder suggests: the question's kinds, best first, that can draw this query's rows. */
export function suggestedKinds(question: VisualQuestionOut | undefined, query: VisualQueryOut | undefined): string[] {
  if (!question || !query) return [];
  return question.drawn_kinds.filter(kind => query.kinds.includes(kind));
}

/** The queries that answer a question, in the catalogue's order. */
export function queriesFor(catalog: VisualCatalogOut | undefined, question: VisualQuestionOut | undefined): VisualQueryOut[] {
  if (!catalog || !question) return [];
  return catalog.queries.filter(q => question.queries.includes(q.name));
}

/** What the provenance panel is asked to follow for one of a value's records. */
export function traceRequest(ref: AiCitationRef, label: string): ProvenanceRequest | null {
  const base = {title: label, kind: ref.record_type.replace('_', ' ')};
  switch (ref.record_type) {
    case 'relationship': case 'lead': case 'task': return {...base, traceRecordType: ref.record_type, acceptedRecordId: ref.record_id};
    case 'claim': case 'evidence': return {...base, acceptedRecordType: ref.record_type, acceptedRecordId: ref.record_id};
    case 'entity': return {...base, entityId: ref.record_id};
    case 'document': return {...base, documentId: ref.record_id};
    case 'source': return {...base, sourceId: ref.record_id};
    default: return null;   // a timeline event has no trace of its own yet
  }
}

function problemText(error: unknown): string {
  // A kind that cannot draw the data, or an order the server refuses, comes
  // back as a 422 whose detail is the plain-words reason.
  return error instanceof ApiHttpError ? error.detail : errorMessage(error, 'Could not draw the chart');
}

export function ChartBuilderPanel({investigationId}: Props): ReactElement {
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  const [open, setOpen] = useState(false);
  const [questionId, setQuestionId] = useState('');
  const [queryName, setQueryName] = useState('');
  const [params, setParams] = useState<Record<string, string>>({});
  const [kind, setKind] = useState('');
  const [title, setTitle] = useState('');

  const path = {investigation_id: investigationId};
  const catalog = useQuery({...investigationVisualCatalogOptions({path}), enabled: open && Boolean(investigationId)});
  const preview = useMutation({...investigationVisualPreviewMutation()});

  const questions = catalog.data?.questions ?? [];
  const question = questions.find(q => q.id === questionId);
  const queries = queriesFor(catalog.data, question);
  const query = queries.find(q => q.name === queryName);
  const kinds = suggestedKinds(question, query);

  // Each choice clears the ones after it and the last preview, so what is
  // on screen always belongs to what is chosen.
  const chooseQuery = (name: string, among: VisualQueryOut[] = queries, within: VisualQuestionOut | undefined = question) => {
    const next = among.find(q => q.name === name);
    setQueryName(name);
    const picks = next?.picks ?? [];
    setParams(Object.fromEntries(Object.entries(next?.params ?? {}).map(([key, param]) => [key,
      // Two pictures to compare start as the earliest and the latest; either can be changed.
      key === 'before' && picks.length > 1 ? picks[0].evidence_id
        : key === 'after' && picks.length > 1 ? picks[picks.length - 1].evidence_id : param.default ?? QUERY_DEFAULT])));
    setKind(suggestedKinds(within, next)[0] ?? '');
    preview.reset();
  };
  const chooseQuestion = (id: string) => {
    const next = questions.find(q => q.id === id);
    setQuestionId(id);
    const among = queriesFor(catalog.data, next);
    chooseQuery((among.find(q => q.has_data) ?? among[0])?.name ?? '', among, next);
  };
  const setParam = (key: string, value: string) => { setParams(current => ({...current, [key]: value})); preview.reset(); };

  const order = (): VisualSpec | null => {
    if (!question || !query || !isChartKind(kind)) return null;
    const chosen = Object.fromEntries(Object.entries(params).filter(([, value]) => value && value !== QUERY_DEFAULT));
    return {kind, question: question.id, title: title.trim(), query: {name: query.name, params: chosen}};
  };
  const spec = order();
  // The title states the finding in words (rule 13 judges it); the server
  // refuses a title with no words at all, so the button waits for one.
  const canPreview = Boolean(spec && query?.has_data && /[A-Za-z]/.test(title)) && !preview.isPending;
  const drawn = preview.data ? chartFromPreview(preview.data) : null;
  const drawnTitle = typeof drawn?.spec.title === 'string' ? drawn.spec.title : 'Chart';
  const report = preview.data?.report;

  return <Card className="card">
    <CardHeader className="pb-3">
      <CardTitle><Reveal detail="Make a chart from this investigation’s records without the AI: choose the question it answers, then the data. The Workbench supplies every number, draws the chart and checks it against the design rules.">
        <span>Chart builder</span></Reveal></CardTitle>
    </CardHeader>
    <CardContent>
      {!open ? <Button onClick={() => setOpen(true)} disabled={!investigationId}>Build a chart</Button> : <>
        {catalog.isPending && <p className="muted">Loading the data you can chart…</p>}
        {catalog.isError && <p className="muted">{errorMessage(catalog.error, 'Could not load the chart catalogue')}</p>}
        {catalog.data && <div className="chart-builder">
          <fieldset>
            <legend>1. What should the chart answer?</legend>
            <div className="searchrow" role="group" aria-label="Question">
              {/* What each question means is revealed on its button. */}
              {questions.map(q => <Reveal key={q.id} tabbable={false} detail={q.drawn_kinds.length ? q.description : `${q.description} Not drawn yet.`}>
                <Button variant={q.id === questionId ? 'default' : 'outline'} aria-pressed={q.id === questionId}
                disabled={!q.drawn_kinds.length} onClick={() => chooseQuestion(q.id)}>{q.label}</Button></Reveal>)}
            </div>
          </fieldset>

          {question && <fieldset>
            <legend>{query ? <Reveal detail={query.description}><span>2. Which data answers it?</span></Reveal> : '2. Which data answers it?'}</legend>
            {queries.length === 0 ? <p className="muted">No data in the catalogue answers this question yet.</p> : <div className="searchrow">
              <Select value={queryName} onValueChange={name => chooseQuery(name)}>
                <SelectTrigger className="w-auto" aria-label="Data"><SelectValue placeholder="Choose the data"/></SelectTrigger>
                <SelectContent>{queries.map(q => <SelectItem key={q.name} value={q.name} disabled={!q.has_data}>
                  {q.label}{q.has_data ? ` · ${q.record_count} ${q.record_noun}` : ' · no records yet'}
                </SelectItem>)}</SelectContent>
              </Select>
              {query && (query.picks ?? []).length > 1 && ['before', 'after'].map(key => <Select key={key} value={params[key] ?? ''}
                onValueChange={value => setParam(key, value)}>
                <Reveal tabbable={false} detail={query.params[key]?.description ?? PARAM_LABELS[key]}><SelectTrigger className="w-auto" aria-label={PARAM_LABELS[key]}><SelectValue/></SelectTrigger></Reveal>
                <SelectContent>{(query.picks ?? []).map(pick => <SelectItem key={pick.evidence_id} value={pick.evidence_id}>
                  {pick.caption} · taken {pick.taken}</SelectItem>)}</SelectContent>
              </Select>)}
              {query && !(query.picks ?? []).length && Object.entries(query.params).map(([key, param]) => param.choices?.length
                ? <Select key={key} value={params[key] ?? param.default ?? ''} onValueChange={value => setParam(key, value)}>
                  <Reveal tabbable={false} detail={param.description}><SelectTrigger className="w-auto" aria-label={PARAM_LABELS[key] ?? key}><SelectValue/></SelectTrigger></Reveal>
                  <SelectContent>{param.choices.map(choice => <SelectItem key={choice} value={choice}>{choice}</SelectItem>)}</SelectContent>
                </Select>
                : query.currencies.length > 1 && <Select key={key} value={params[key] ?? QUERY_DEFAULT} onValueChange={value => setParam(key, value)}>
                  <Reveal tabbable={false} detail={param.description}><SelectTrigger className="w-auto" aria-label={PARAM_LABELS[key] ?? key}><SelectValue/></SelectTrigger></Reveal>
                  <SelectContent>
                    <SelectItem value={QUERY_DEFAULT}>Currency with the most payments</SelectItem>
                    {query.currencies.map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}
                  </SelectContent>
                </Select>)}
            </div>}
          </fieldset>}

          {query && <fieldset>
            <legend>3. Which chart?</legend>
            {kinds.length === 0 ? <p className="muted">None of this question&apos;s charts can draw this data.</p>
              : <div className="searchrow" role="group" aria-label="Chart kind">
                {/* The suggested kind carries a star, named on reveal. */}
                {kinds.map((k, index) => {
                  const button = <Button key={k} variant={k === kind ? 'default' : 'outline'} aria-pressed={k === kind}
                    onClick={() => { setKind(k); preview.reset(); }}>{kindName(k)}{index === 0 && <><span className="sr-only"> (suggested)</span><span aria-hidden="true"> ★</span></>}</Button>;
                  return index === 0 ? <Reveal key={k} tabbable={false} describe={false} detail="Suggested for this data">{button}</Reveal> : button;
                })}
              </div>}
            <div className="searchrow">
              <Input value={title} aria-label="Title" placeholder="A sentence that states the finding, e.g. Meridian received most of the money"
                onChange={(e: ChangeEvent<HTMLInputElement>) => { setTitle(e.target.value); preview.reset(); }}/>
              <Button onClick={() => spec && preview.mutate({path, body: spec})} disabled={!canPreview}>{preview.isPending ? 'Drawing…' : 'Preview chart'}</Button>
            </div>
          </fieldset>}

          {preview.isError && <p className="muted" role="alert">{problemText(preview.error)}</p>}
          {report && <CheckReportView report={report} kindName={kindName(kind)}/>}
          {drawn && <ChartFrame kind="built-chart" title={drawnTitle} question={`${kindName(drawn.spec.kind as string)}, drawn from this investigation's records and checked against the design rules.`}
            rule={{label: 'What it shows:', text: drawn.text.description}}
            footer={<><span>{drawn.text.source_line}</span><Reveal label="Tracing a value" detail="Click a bar, slice or point to trace its value to a record; the numbered buttons in the data table trace each one."><span aria-hidden="true">ⓘ</span></Reveal></>}>
            <div style={{padding: '12px 16px'}}>
            <ChartFigure visual={drawn} onPick={row => {
              // A bar, slice or point traces the first record behind its value; the table lists them all.
              const request = row.record_refs[0] ? traceRequest(row.record_refs[0], `${drawnTitle}: ${row.label}`) : null;
              if (request) openProvenance(request);
            }} renderCitations={refs => <span>{refs.map((ref, index) => {
            const request = traceRequest(ref, `${drawnTitle}: record ${index + 1}`);
            return request
              ? <Reveal key={`${ref.record_type}:${ref.record_id}`} tabbable={false} detail={`Trace this ${ref.record_type.replace('_', ' ')}`}>
                <Button size="sm" variant="outline" onClick={() => openProvenance(request)}>{index + 1}</Button></Reveal>
              : <span key={`${ref.record_type}:${ref.record_id}`}>{index + 1} </span>;
          })}</span>}/>
            </div>
          </ChartFrame>}
          {drawn && report?.ok && spec && <KeepChart investigationId={investigationId} spec={spec}/>}
        </div>}
      </>}
    </CardContent>
  </Card>;
}
