// @vitest-environment jsdom
// STRUCT-0040 / issue #40: coverage for the general Chart wrapper.
//
// echarts-for-react/lib/core is mocked because this component's own
// contract is "pass the right props into ReactEChartsCore" (echarts
// module, theme, option, renderer) -- actually rendering pixels to canvas
// is echarts's own tested responsibility, not this wrapper's. (A quick
// manual probe confirmed real echarts-for-react does not crash under
// jsdom -- unlike vis-network, which needs getContext('2d') --  but
// asserting on canvas pixel output still isn't a meaningful test here.)
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

const reactEChartsCoreSpy = vi.hoisted(() => vi.fn());

vi.mock('echarts-for-react/lib/core', () => ({
  default: (props: Record<string, unknown>) => {
    reactEChartsCoreSpy(props);
    return null;
  },
}));

import {Chart} from '../components/charts/chart';
import {echarts, WORKBENCH_THEME_NAME} from '../lib/echarts-setup';

afterEach(() => {
  cleanup();
  reactEChartsCoreSpy.mockClear();
});

describe('Chart', () => {
  it('renders an aria-labeled container', () => {
    render(<Chart option={{series: []}} ariaLabel="Test chart" />);
    expect(screen.getByRole('img', {name: 'Test chart'})).toBeInTheDocument();
  });

  it('passes the tree-shaken echarts module, workbench theme, and option through', () => {
    const option = {series: [{type: 'line' as const}]};
    render(<Chart option={option} ariaLabel="Test chart" />);
    expect(reactEChartsCoreSpy).toHaveBeenCalledTimes(1);
    const props = reactEChartsCoreSpy.mock.calls[0][0];
    expect(props.echarts).toBe(echarts);
    expect(props.theme).toBe(WORKBENCH_THEME_NAME);
    expect(props.option).toBe(option);
    expect(props.opts).toEqual({renderer: 'canvas'});
  });

  it('defaults notMerge to true but allows overriding it', () => {
    const {rerender} = render(<Chart option={{series: []}} ariaLabel="Test chart" />);
    expect(reactEChartsCoreSpy.mock.calls[0][0].notMerge).toBe(true);

    rerender(<Chart option={{series: []}} ariaLabel="Test chart" notMerge={false} />);
    expect(reactEChartsCoreSpy.mock.calls[1][0].notMerge).toBe(false);
  });

  it('applies a custom height and passes onChartReady/onEvents through', () => {
    const onChartReady = vi.fn();
    const onEvents = {click: vi.fn()};
    render(<Chart option={{series: []}} ariaLabel="Test chart" height={200} onChartReady={onChartReady} onEvents={onEvents} />);
    const props = reactEChartsCoreSpy.mock.calls[0][0];
    expect(props.style).toEqual({height: 200, width: '100%'});
    expect(props.onChartReady).toBe(onChartReady);
    expect(props.onEvents).toBe(onEvents);
  });
});
