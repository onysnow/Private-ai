// @vitest-environment jsdom
// Before and after (components/presentation/chart-pictures.tsx; backend
// app/visuals/echarts.py _before_after): the frame drawn by ECharts, the two
// pictures fetched through the API client and shown whole, laid out as a
// slider (react-compare-slider, an ARIA slider moved with the arrow keys),
// side by side or stacked, each with its date. ECharts is replaced by a fake
// that keeps what it is handed (jsdom has no canvas).
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {Suspense, lazy} from 'react';
import type {ComponentType} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const {charts} = vi.hoisted(() => ({charts: [] as Record<string, unknown>[]}));
vi.mock('echarts-for-react/lib/core', () => ({
  default: (props: Record<string, unknown>) => { charts.push(props); return <canvas data-testid="echarts-canvas"/>; },
}));
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<ComponentType<Record<string, unknown>>>) => {
    const Lazy = lazy(() => loader().then(component => ({default: component})));
    return (props: Record<string, unknown>) => <Suspense fallback={null}><Lazy {...props}/></Suspense>;
  },
}));

import {ChartFigure} from '../components/presentation/chart-visual';
import {picturesOf} from '../components/presentation/chart-pictures';
import {asChart} from '../components/presentation/chart-data';
import type {ChartVisual, JsonObject} from '../lib/api-types';
import {QueryProvider} from '../lib/query-client';
import kinds from '../test-support/chart-kinds.json';
import {mockApi} from '../test-support/mock-api';

const fixture = (kinds as unknown as Record<string, JsonObject>).before_after;
const stored: JsonObject = {type: 'chart', spec: fixture.spec, data: fixture.data, report: {ok: true, errors: [], warnings: []}, text: fixture.text,
  option: fixture.option, width: fixture.width, height: fixture.height};
const picture = (bytes: number[]) => () => new Response(new Uint8Array(bytes), {headers: {'content-type': 'image/png'}});

function laidOut(layout: string): ChartVisual {
  const option = fixture.option as JsonObject;
  return asChart({...stored, option: {...option, pictures: {...(option.pictures as JsonObject), layout}}}) as ChartVisual;
}

beforeEach(() => {
  charts.length = 0;
  let made = 0;
  vi.stubGlobal('URL', Object.assign(URL, {createObjectURL: vi.fn(() => `blob:picture-${++made}`), revokeObjectURL: vi.fn()}));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('before and after', () => {
  it('reads its pictures off the option', () => {
    const pictures = picturesOf(fixture.option);
    expect(pictures?.layout).toBe('slider');
    expect(pictures?.items.map(item => [item.role, item.document_id, item.caption])).toEqual([
      ['before', 'doc-1', 'Before · taken 3 Oct 2023'], ['after', 'doc-2', 'After · taken 14 Nov 2023']]);
    expect(picturesOf({series: []})).toBeNull();
  });

  it('draws the frame with ECharts and the two pictures on a slider moved with the arrow keys', async () => {
    const api = mockApi({'GET /api/documents/doc-1/picture': picture([1]), 'GET /api/documents/doc-2/picture': picture([2])});
    render(<QueryProvider><ChartFigure visual={asChart(stored) as ChartVisual}/></QueryProvider>);
    const slider = await screen.findByTestId('pictures-slider');
    // The frame without the pictures, as the checker passed it.
    expect((charts[0].option as Record<string, unknown>).pictures).toBeUndefined();
    const before = await within(slider).findByAltText('Before: The market hall, intact, taken 2023-10-03');
    expect(before).toHaveAttribute('src', expect.stringMatching(/^blob:picture-/));
    await within(slider).findByAltText('After: The market hall, destroyed, taken 2023-11-14');
    expect(api.calls('GET /api/documents/doc-1/picture')).toHaveLength(1);
    // Both dates, on the pictures themselves.
    expect(slider).toHaveTextContent('Before · taken 3 Oct 2023');
    expect(slider).toHaveTextContent('After · taken 14 Nov 2023');
    const handle = within(slider).getByRole('slider');
    expect(handle).toHaveAttribute('aria-valuenow', '50');
    fireEvent.keyDown(handle, {key: 'ArrowRight'});
    expect(Number(handle.getAttribute('aria-valuenow'))).toBeGreaterThan(50);
  });

  it.each([['side_by_side', 'pictures-side-by-side'], ['stacked', 'pictures-stacked']])('lays the pictures out %s with their dates under them',
    async (layout, testId) => {
      mockApi({'GET /api/documents/doc-1/picture': picture([1]), 'GET /api/documents/doc-2/picture': picture([2])});
      render(<QueryProvider><ChartFigure visual={laidOut(layout)}/></QueryProvider>);
      const pair = await screen.findByTestId(testId);
      const captions = within(pair).getAllByRole('figure').map(figure => within(figure).getByText(/taken/).textContent);
      expect(captions).toEqual(['Before · taken 3 Oct 2023', 'After · taken 14 Nov 2023']);
    });

  it('says which picture could not be shown, and why', async () => {
    mockApi({'GET /api/documents/doc-1/picture': picture([1]),
      'GET /api/documents/doc-2/picture': {status: 415, body: {detail: 'This document is not a picture'}}});
    render(<QueryProvider><ChartFigure visual={laidOut('side_by_side')}/></QueryProvider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('The after picture could not be shown');
  });

  it('lists each picture with when it was taken in the data table, with no single-record mark', () => {
    mockApi({'GET /api/documents/doc-1/picture': picture([1]), 'GET /api/documents/doc-2/picture': picture([2])});
    render(<QueryProvider><ChartFigure visual={asChart(stored) as ChartVisual}/></QueryProvider>);
    const rows = within(screen.getByRole('table')).getAllByRole('row').map(row => row.textContent);
    expect(rows).toEqual(['PictureTakenRecords', 'The market hall, intact3 Oct 20231', 'The market hall, destroyed14 Nov 20231']);
  });
});
