// @vitest-environment jsdom
// STRUCT-0040 / issue #40: coverage for FinancialFlowSankey.
//
// components/charts/chart.tsx (the ECharts wrapper) is mocked here so
// these tests assert what this component actually owns: aggregating
// transactions per currency, building Sankey option data from that
// aggregation, the direct/inferred link styling, and the currency
// selector + "not shown" messaging -- not echarts's own rendering.
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

const chartSpy = vi.hoisted(() => vi.fn());

vi.mock('../components/charts/chart', () => ({
  Chart: (props: Record<string, unknown>) => {
    chartSpy(props);
    return <div data-testid="chart-stub" />;
  },
}));

import {FinancialFlowSankey} from '../components/charts/financial-flow-sankey';
import type {FinancialFlowTransaction} from '../lib/financial-flow-types';

afterEach(() => {
  cleanup();
  chartSpy.mockClear();
});

function txn(overrides: Partial<FinancialFlowTransaction> & Pick<FinancialFlowTransaction, 'id' | 'from' | 'to' | 'amount' | 'currency'>): FinancialFlowTransaction {
  return {dateTime: '2024-01-01T00:00:00Z', ...overrides};
}

describe('FinancialFlowSankey', () => {
  it('shows a message and renders no chart when there are no transactions', () => {
    render(<FinancialFlowSankey transactions={[]} />);
    expect(screen.getByText('No transactions to chart.')).toBeInTheDocument();
    expect(chartSpy).not.toHaveBeenCalled();
  });

  it('builds sankey series data from a single currency, with no currency selector', () => {
    render(
      <FinancialFlowSankey
        transactions={[
          txn({id: 't1', from: 'A', to: 'B', amount: 100, currency: 'USD'}),
          txn({id: 't2', from: 'B', to: 'C', amount: 40, currency: 'USD'}),
        ]}
      />,
    );
    expect(screen.queryByLabelText('Select currency')).not.toBeInTheDocument();
    const option = chartSpy.mock.calls[0][0].option;
    expect(option.series[0].type).toBe('sankey');
    expect(option.series[0].data.map((n: {name: string}) => n.name).sort()).toEqual(['A', 'B', 'C']);
    expect(option.series[0].links).toHaveLength(2);
  });

  it('draws payments in copper, an inferred one fainter, and each party by what it does', () => {
    render(
      <FinancialFlowSankey
        transactions={[
          txn({id: 't1', from: 'A', to: 'B', amount: 10, currency: 'USD', flowType: 'direct'}),
          txn({id: 't2', from: 'B', to: 'C', amount: 10, currency: 'USD', flowType: 'inferred'}),
        ]}
      />,
    );
    const series = chartSpy.mock.calls[0][0].option.series[0];
    const links = series.links as Array<{source: string; lineStyle: {color: string; opacity: number}}>;
    const direct = links.find((l) => l.source === 'A');
    const inferred = links.find((l) => l.source === 'B');
    expect(direct?.lineStyle).toMatchObject({color: '#a16948', opacity: 0.5});
    expect(inferred?.lineStyle).toMatchObject({color: '#a16948', opacity: 0.2});
    const colour = (name: string) => (series.data as Array<{name: string; itemStyle: {color: string}}>).find(n => n.name === name)?.itemStyle.color;
    expect([colour('A'), colour('B'), colour('C')]).toEqual(['#a16948', '#d4a152', '#baac91']);   // only pays, both, only receives
  });

  it('defaults to the currency with the most transactions and lists the others as not shown', () => {
    render(
      <FinancialFlowSankey
        transactions={[
          txn({id: 't1', from: 'A', to: 'B', amount: 10, currency: 'EUR'}),
          txn({id: 't2', from: 'A', to: 'B', amount: 10, currency: 'USD'}),
          txn({id: 't3', from: 'B', to: 'C', amount: 5, currency: 'USD'}),
        ]}
      />,
    );
    expect(screen.getByLabelText('Select currency')).toBeInTheDocument();
    expect(screen.getByText(/Not shown.*EUR/)).toBeInTheDocument();
    const ariaLabel = chartSpy.mock.calls[0][0].ariaLabel as string;
    expect(ariaLabel).toContain('USD');
  });

  it('honors an explicit currency prop over the most-transactions default', () => {
    render(
      <FinancialFlowSankey
        currency="EUR"
        transactions={[
          txn({id: 't1', from: 'A', to: 'B', amount: 10, currency: 'EUR'}),
          txn({id: 't2', from: 'A', to: 'B', amount: 10, currency: 'USD'}),
          txn({id: 't3', from: 'B', to: 'C', amount: 5, currency: 'USD'}),
        ]}
      />,
    );
    const ariaLabel = chartSpy.mock.calls[0][0].ariaLabel as string;
    expect(ariaLabel).toContain('EUR');
  });

  it('switches the charted currency when the selector changes', () => {
    render(
      <FinancialFlowSankey
        transactions={[
          txn({id: 't1', from: 'A', to: 'B', amount: 10, currency: 'USD'}),
          txn({id: 't2', from: 'A', to: 'B', amount: 10, currency: 'USD'}),
          txn({id: 't3', from: 'B', to: 'C', amount: 5, currency: 'EUR'}),
        ]}
      />,
    );
    expect(chartSpy.mock.calls[0][0].ariaLabel).toContain('USD');
    fireEvent.click(screen.getByLabelText('Select currency'));
    fireEvent.click(screen.getByText('EUR'));
    const lastCall = chartSpy.mock.calls[chartSpy.mock.calls.length - 1][0];
    expect(lastCall.ariaLabel).toContain('EUR');
  });

  it('explains instead of drawing when the charted currency has a cycle', () => {
    render(
      <FinancialFlowSankey
        transactions={[
          txn({id: 't1', from: 'A', to: 'B', amount: 100, currency: 'USD'}),
          txn({id: 't2', from: 'B', to: 'A', amount: 40, currency: 'USD'}),
        ]}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent('The USD flows form a cycle (A → B → A)');
    expect(chartSpy).not.toHaveBeenCalled();
  });

  it('draws the tooltip as plain text, so a party name holding markup is never run as HTML', () => {
    const evil = '<img src=x onerror=alert(1)>';
    render(<FinancialFlowSankey transactions={[txn({id: 't1', from: evil, to: 'B', amount: 10, currency: 'USD'})]}/>);
    const tooltip = chartSpy.mock.calls[0][0].option.tooltip;
    expect(tooltip.renderMode).toBe('richText');
    expect(tooltip.formatter({dataType: 'edge', name: `${evil} > B`, value: 10, data: {flowType: 'direct'}})).not.toContain('<br');
  });

  // The Money view's Flow layout folds a very large ledger as its Columns layout does (money-layout.ts TOP_FLOWS).
  describe('folded to the largest flows', () => {
    // 25 flows: "Hub" pays P1..P25 amounts 100..2500, and P1 pays Hub-2 once more so a small party has two flows.
    const many = [
      ...Array.from({length: 25}, (_, i) => txn({id: `t${i + 1}`, from: 'Hub', to: `P${i + 1}`, amount: (i + 1) * 100, currency: 'USD'})),
      txn({id: 't26', from: 'P1', to: 'Sink', amount: 50, currency: 'USD'}),
    ];
    const last = () => chartSpy.mock.calls[chartSpy.mock.calls.length - 1][0];

    it('draws every flow when nothing asks it to fold', () => {
      render(<FinancialFlowSankey transactions={many}/>);
      expect(last().option.series[0].links).toHaveLength(26);
      expect(screen.queryByTestId('sankey-fold')).not.toBeInTheDocument();
    });

    it('draws the 20 largest and one "others (n)" band, the totals exact, and opens and folds on request', () => {
      let all = false;
      const onAll = vi.fn((next: boolean) => { all = next; });
      const {rerender} = render(<FinancialFlowSankey transactions={many} fold={{top: 20, all, onAll}}/>);
      const series = last().option.series[0];
      expect(series.links).toHaveLength(21);
      const others = series.links.find((l: {source: string}) => !series.data.some((n: {name: string}) => n.name === l.source && !n.name.startsWith('\u0000')));
      // The six smallest flows fold: Hub→P1..P5 (100..500) and P1→Sink (50).
      expect(others.value).toBe(1550);
      const label = series.label.formatter;
      expect(label({name: others.source, value: others.value})).toBe('others (6)\n{amount|USD 1,550}');
      // Hub's label counts every payment it made, not only the drawn ones.
      expect(label({name: 'Hub', value: 1})).toBe(`Hub\n{amount|USD ${(25 * 26 / 2 * 100).toLocaleString('en-GB')}}`);
      expect(series.data.map((n: {name: string}) => n.name)).not.toContain('P1');
      expect(screen.getByTestId('sankey-fold')).toHaveTextContent('The 20 largest of 26 flows are drawn; others (6) holds the other 6 payments, USD 1,550. Totals count every payment.');
      expect(last().option.tooltip.formatter({dataType: 'edge', name: 'x', value: 1550, data: {source: others.source}})).toBe('others (6)\nUSD 1,550 in 6 payments');
      fireEvent.click(screen.getByRole('button', {name: 'Show all 26 flows'}));
      expect(onAll).toHaveBeenCalledWith(true);
      rerender(<FinancialFlowSankey transactions={many} fold={{top: 20, all, onAll}}/>);
      expect(last().option.series[0].links).toHaveLength(26);
      fireEvent.click(screen.getByRole('button', {name: 'Fold to the 20 largest'}));
      expect(onAll).toHaveBeenLastCalledWith(false);
    });

    it('does not fold a ledger of 20 flows or fewer', () => {
      render(<FinancialFlowSankey transactions={many.slice(0, 20)} fold={{top: 20, all: false, onAll: vi.fn()}}/>);
      expect(last().option.series[0].links).toHaveLength(20);
      expect(screen.queryByTestId('sankey-fold')).not.toBeInTheDocument();
    });
  });
});
