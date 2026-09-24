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

  it('styles a direct link solid/blue and an inferred link dashed/amber', () => {
    render(
      <FinancialFlowSankey
        transactions={[
          txn({id: 't1', from: 'A', to: 'B', amount: 10, currency: 'USD', flowType: 'direct'}),
          txn({id: 't2', from: 'B', to: 'C', amount: 10, currency: 'USD', flowType: 'inferred'}),
        ]}
      />,
    );
    const links = chartSpy.mock.calls[0][0].option.series[0].links as Array<{
      source: string;
      lineStyle: {type: string; color: string};
    }>;
    const direct = links.find((l) => l.source === 'A');
    const inferred = links.find((l) => l.source === 'B');
    expect(direct?.lineStyle.type).toBe('solid');
    expect(direct?.lineStyle.color).toBe('hsl(228, 100%, 76%)');
    expect(inferred?.lineStyle.type).toBe('dashed');
    expect(inferred?.lineStyle.color).toBe('#c9a227');
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
});
