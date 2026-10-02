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
// in plain words. Nothing is stored.
//
// The catalogue runs every query once, so it is asked for only when the
// builder is opened. ECharts loads on demand (next/dynamic), as on every
// other panel, so it never counts against the page's first load.
import {useMutation, useQuery} from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {chartFromPreview} from '../../components/presentation/chart-data';
import {ApiHttpError, errorMessage} from '../../lib/api-client';
import type {AiCitationRef} from '../../lib/api-types';
import {investigationVisualCatalogOptions, investigationVisualPreviewMutation} from '../../lib/generated/@tanstack/react-query.gen';
import type {ChartKind, CheckItemOut, VisualCatalogOut, VisualQueryOut, VisualQuestionOut, VisualSpec} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import type {ProvenanceRequest} from '../../lib/workbench-store';

const ChartFigure = dynamic(() => import('../../components/presentation/chart-visual').then(m => m.ChartFigure),
  {ssr: false, loading: () => <p className="muted">Loading chart…</p>});

/** What each kind is called on screen (backend/app/visuals/echarts.py KIND_LABELS). */
export const KIND_NAMES: Record<ChartKind, string> = {
  bar: 'Bar chart', column: 'Column chart', line: 'Line chart', area: 'Area chart', stacked_bar_100: '100% bar', donut: 'Donut',
  treemap: 'Treemap', histogram: 'Histogram', scatter: 'Scatter plot', timeline: 'Timeline', sankey: 'Flow diagram',
};

/** The catalogue names kinds as plain strings; only a kind the order slip knows is sent. */
const isChartKind = (value: string): value is ChartKind => Object.prototype.hasOwnProperty.call(KIND_NAMES, value);
const kindName = (value: string): string => (isChartKind(value) ? KIND_NAMES[value] : value);

/** The design rules by number, as the visuals design doc names them ("How
 * every chart gets checked"; the numbers never change). The checker's own
 * message says what is wrong with this chart; the name says which rule. */
export const RULE_NAMES: Record<number, string> = {
  0: 'The numbers drawn match the data',
  1: 'Bars and areas start at zero',
  2: 'No log scale on bars or areas, or on data with zero or negative values',
  3: 'Never show a negative value as a size',
  4: 'Stack only bars and areas; never total the same field twice',
  5: 'A donut has four slices at most, adding to 100%',
  6: 'No second value axis',
  7: 'No 3D, no upside-down axes, evenly spaced ticks',
  8: 'Never join unrelated categories with a line',
  9: 'Show amounts by position or length first; never an order in random colours',
  10: 'Eight colours at most; fold the rest into "Other"',
  11: 'Text and neighbouring colours have enough contrast',
  12: 'Never rely on colour alone',
  13: 'A title that states the finding, alt text, a description and a data table',
  14: 'Chart text at least 12 px',
  15: 'A source line; every value links to a record',
  16: 'Show how many records sit behind each value',
  17: 'Shaded maps show rates, in 3 to 7 steps',
  18: 'Large networks offer a grid view',
  19: 'Never add up different currencies',
  20: 'A value that rests on one record is flagged',
};

// A Radix select item cannot hold an empty value, so "the query's own
// choice" (the currency with the most payments) has a name of its own.
const QUERY_DEFAULT = '__default__';
// The catalogue's parameters by what they ask (backend/app/visuals/spec.py).
const PARAM_LABELS: Record<string, string> = {direction: 'Direction', granularity: 'Group dates by', currency: 'Currency'};

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

function RuleList({items, warning}: {items: CheckItemOut[], warning?: boolean}): ReactElement | null {
  if (!items.length) return null;
  return <ul className="rule-list" aria-label={warning ? 'Warnings' : 'Failed rules'}>
    {items.map((item, index) => <li key={`${item.rule}-${index}`}>
      <b>Rule {item.rule}{warning ? ' (warning)' : ''}</b> · {RULE_NAMES[item.rule] ?? 'Design rule'}: {item.message}
    </li>)}
  </ul>;
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
    setParams(Object.fromEntries(Object.entries(next?.params ?? {}).map(([key, param]) => [key, param.default ?? QUERY_DEFAULT])));
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
      <CardTitle>Chart builder</CardTitle>
      <CardDescription>Make a chart from this investigation&apos;s records without the AI: choose the question it answers, then the data. The Workbench supplies every number, draws the chart and checks it against the design rules.</CardDescription>
    </CardHeader>
    <CardContent>
      {!open ? <Button onClick={() => setOpen(true)} disabled={!investigationId}>Build a chart</Button> : <>
        {catalog.isPending && <p className="muted">Loading the data you can chart…</p>}
        {catalog.isError && <p className="muted">{errorMessage(catalog.error, 'Could not load the chart catalogue')}</p>}
        {catalog.data && <div className="chart-builder">
          <fieldset>
            <legend>1. What should the chart answer?</legend>
            <div className="searchrow" role="group" aria-label="Question">
              {questions.map(q => <Button key={q.id} variant={q.id === questionId ? 'default' : 'outline'} aria-pressed={q.id === questionId}
                disabled={!q.drawn_kinds.length} title={q.drawn_kinds.length ? q.description : `${q.description} Not drawn yet.`}
                onClick={() => chooseQuestion(q.id)}>{q.label}</Button>)}
            </div>
            {question && <p className="muted">{question.description}</p>}
          </fieldset>

          {question && <fieldset>
            <legend>2. Which data answers it?</legend>
            {queries.length === 0 ? <p className="muted">No data in the catalogue answers this question yet.</p> : <div className="searchrow">
              <Select value={queryName} onValueChange={name => chooseQuery(name)}>
                <SelectTrigger className="w-auto" aria-label="Data"><SelectValue placeholder="Choose the data"/></SelectTrigger>
                <SelectContent>{queries.map(q => <SelectItem key={q.name} value={q.name} disabled={!q.has_data}>
                  {q.label}{q.has_data ? ` · ${q.record_count} ${q.record_noun}` : ' · no records yet'}
                </SelectItem>)}</SelectContent>
              </Select>
              {query && Object.entries(query.params).map(([key, param]) => param.choices?.length
                ? <Select key={key} value={params[key] ?? param.default ?? ''} onValueChange={value => setParam(key, value)}>
                  <SelectTrigger className="w-auto" aria-label={PARAM_LABELS[key] ?? key} title={param.description}><SelectValue/></SelectTrigger>
                  <SelectContent>{param.choices.map(choice => <SelectItem key={choice} value={choice}>{choice}</SelectItem>)}</SelectContent>
                </Select>
                : query.currencies.length > 1 && <Select key={key} value={params[key] ?? QUERY_DEFAULT} onValueChange={value => setParam(key, value)}>
                  <SelectTrigger className="w-auto" aria-label={PARAM_LABELS[key] ?? key} title={param.description}><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={QUERY_DEFAULT}>Currency with the most payments</SelectItem>
                    {query.currencies.map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}
                  </SelectContent>
                </Select>)}
            </div>}
            {query && <p className="muted">{query.description}</p>}
          </fieldset>}

          {query && <fieldset>
            <legend>3. Which chart?</legend>
            {kinds.length === 0 ? <p className="muted">None of this question&apos;s charts can draw this data.</p>
              : <div className="searchrow" role="group" aria-label="Chart kind">
                {kinds.map((k, index) => <Button key={k} variant={k === kind ? 'default' : 'outline'} aria-pressed={k === kind}
                  onClick={() => { setKind(k); preview.reset(); }}>{kindName(k)}{index === 0 ? ' (suggested)' : ''}</Button>)}
              </div>}
            <div className="searchrow">
              <Input value={title} aria-label="Title" placeholder="A sentence that states the finding, e.g. Meridian received most of the money"
                onChange={(e: ChangeEvent<HTMLInputElement>) => { setTitle(e.target.value); preview.reset(); }}/>
              <Button onClick={() => spec && preview.mutate({path, body: spec})} disabled={!canPreview}>{preview.isPending ? 'Drawing…' : 'Preview chart'}</Button>
            </div>
          </fieldset>}

          {preview.isError && <p className="muted" role="alert">{problemText(preview.error)}</p>}
          {report && <section aria-label="Check report">
            {report.ok
              ? <p><Badge variant="outline">Passes the design checks</Badge> {report.checked_rules.length} rules were checked for this {kindName(kind).toLowerCase()}.</p>
              : <p><Badge variant="destructive">Fails {report.errors.length} design {report.errors.length === 1 ? 'rule' : 'rules'}</Badge> A chart that fails is not put in a draft or a deck until the order is fixed.</p>}
            <RuleList items={report.errors}/>
            <RuleList items={report.warnings} warning/>
          </section>}
          {drawn && <ChartFigure visual={drawn} renderCitations={refs => <span>{refs.map((ref, index) => {
            const request = traceRequest(ref, `${drawnTitle}: record ${index + 1}`);
            return request
              ? <Button key={`${ref.record_type}:${ref.record_id}`} size="sm" variant="outline" title={`Trace this ${ref.record_type.replace('_', ' ')}`}
                onClick={() => openProvenance(request)}>{index + 1}</Button>
              : <span key={`${ref.record_type}:${ref.record_id}`}>{index + 1} </span>;
          })}</span>}/>}
        </div>}
      </>}
    </CardContent>
  </Card>;
}
