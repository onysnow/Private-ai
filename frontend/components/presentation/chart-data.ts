// Reading a checked chart (backend/app/visuals; docs/visuals/README.md) into
// the shape the preview draws, wherever it comes from: a draft or a deck
// stores it as untyped JSON, and the chart builder gets it from
// POST /api/investigations/{id}/visuals/preview. One reader for both, so a
// chart the builder previews is drawn exactly as the same chart in a draft.
// No React and no ECharts here: the builder's panel imports this without
// pulling either into the page's first load.
import type {AiCitationRef, ChartVisual, JsonObject, JsonValue} from '../../lib/api-types';
import type {ChartKind, VisualPreviewOut} from '../../lib/generated/types.gen';

/** What each kind is called on screen (backend/app/visuals/echarts.py KIND_LABELS). */
export const KIND_NAMES: Record<ChartKind, string> = {
  bar: 'Bar chart', column: 'Column chart', line: 'Line chart', area: 'Area chart', stacked_bar_100: '100% bar', donut: 'Donut',
  treemap: 'Treemap', histogram: 'Histogram', scatter: 'Scatter plot', timeline: 'Timeline', sankey: 'Flow diagram',
};

/** Kinds come as plain strings from the catalogue and stored charts; only a kind the order slip knows counts. */
export const isChartKind = (value: string): value is ChartKind => Object.prototype.hasOwnProperty.call(KIND_NAMES, value);
export const kindName = (value: string): string => (isChartKind(value) ? KIND_NAMES[value] : value);

export const isObj = (v: JsonValue | undefined): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);
export const str = (v: JsonValue | undefined): string => (typeof v === 'string' ? v : '');
export const refs = (v: JsonValue | undefined): AiCitationRef[] => (Array.isArray(v) ? v.filter(isObj).filter(r => typeof r.record_type === 'string' && typeof r.record_id === 'string').map(r => ({record_type: r.record_type as string, record_id: r.record_id as string})) : []);

/** A chart is stored resolved (backend app/ai/chart_check.py): its rows,
 * the checked drawing and its words. Anything less is not drawn. */
export function asChart(v: JsonObject): ChartVisual | null {
  const data = v.data, option = v.option, text = v.text, spec = v.spec;
  if (!isObj(data) || !Array.isArray(data.rows) || !isObj(option) || !isObj(text) || !isObj(spec)) return null;
  const table = isObj(text.data_table) ? text.data_table : null;
  if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) return null;
  const rows = data.rows.filter(isObj).filter(r => typeof r.label === 'string' && typeof r.value === 'number')
    .map(r => ({...r, label: r.label as string, value: r.value as number, record_refs: refs(r.record_refs), record_count: typeof r.record_count === 'number' ? r.record_count : 0}));
  const tableRows = table.rows.filter(isObj).filter(r => typeof r.label === 'string' && typeof r.value === 'number')
    .map(r => ({label: r.label as string, value: r.value as number, formatted: str(r.formatted), record_count: typeof r.record_count === 'number' ? r.record_count : 0, record_refs: refs(r.record_refs),
      // Only the kinds that write them: a part's share, a scatter plot's second number.
      ...(typeof r.share === 'number' ? {share: r.share} : {}),
      ...(typeof r.x === 'number' ? {x: r.x} : {}),
      ...(typeof r.x_formatted === 'string' ? {x_formatted: r.x_formatted} : {})}));
  // What a deck slide shows for a kind PowerPoint cannot hold natively (the treemap).
  const drawing = isObj(v.slide_drawing) && typeof v.slide_drawing.width === 'number' && typeof v.slide_drawing.height === 'number'
    ? {option: isObj(v.slide_drawing.option) ? v.slide_drawing.option : null, width: v.slide_drawing.width, height: v.slide_drawing.height,
      ...(typeof v.slide_drawing.note === 'string' ? {note: v.slide_drawing.note} : {})}
    : null;
  return {
    type: 'chart', spec, option, data: {...data, rows},
    ...(drawing ? {slide_drawing: drawing} : {}),
    width: typeof v.width === 'number' ? v.width : undefined, height: typeof v.height === 'number' ? v.height : undefined,
    text: {alt_text: str(text.alt_text), description: str(text.description), source_line: str(text.source_line),
      data_table: {columns: table.columns.map(c => str(c)), rows: tableRows}},
  };
}

/** A reply's value as JSON, checked rather than cast: the generated types
 * call an ECharts option `unknown`, and only plain JSON is drawn. */
export function asJson(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) return value.map(asJson).filter((v): v is JsonValue => v !== undefined);
  if (typeof value === 'object') {
    const out: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      const json = asJson(item);
      if (json !== undefined) out[key] = json;
    }
    return out;
  }
  return undefined;
}

/** The chart builder's preview as the chart a draft would store. */
export function chartFromPreview(preview: VisualPreviewOut): ChartVisual | null {
  const stored = asJson({
    type: 'chart', spec: preview.spec, data: preview.data, option: preview.option, width: preview.width, height: preview.height,
    text: {alt_text: preview.alt_text, description: preview.description, source_line: preview.source_line, data_table: preview.data_table},
  });
  return isObj(stored) ? asChart(stored) : null;
}
