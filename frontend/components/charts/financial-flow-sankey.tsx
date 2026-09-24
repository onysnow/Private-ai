'use client';

// STRUCT-0040 / issue #40: Financial Flow Sankey chart.
//
// Renders the documented transaction ledger (TAS Financial Flow Analysis
// module, section A) as a Sankey diagram of aggregated (from, to) flows.
// Grounded in lib/financial-flow-types.ts's `aggregateTransactionsByCurrency`,
// which enforces the module's rule that amounts must never be summed across
// currencies (that would misrepresent magnitude): this component shows one
// currency's subset at a time and surfaces the others via a selector plus an
// explicit "not shown" note, rather than silently combining or hiding them.
//
// Link color follows section D's "whether direct or inferred" distinction,
// reusing the same direct/inferred visual vocabulary (solid vs. dashed,
// amber for inferred) already established in components/entity-graph.tsx.
//
// Infra only; not wired into any existing page (issue #40's own scope note).

import * as React from 'react';
import {useMemo, useState} from 'react';
import type {EChartsOption} from 'echarts';

import {Chart} from './chart';
import {
  aggregateTransactionsByCurrency,
  type FinancialFlowTransaction,
} from '@/lib/financial-flow-types';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';

export type FinancialFlowSankeyProps = {
  transactions: FinancialFlowTransaction[];
  /** Force an initial currency. Defaults to the currency with the most transactions. */
  currency?: string;
  height?: number | string;
  className?: string;
};

const DIRECT_COLOR = 'hsl(228, 100%, 76%)';
const INFERRED_COLOR = '#c9a227';

function pickDefaultCurrency(byCurrency: Map<string, {links: {transactionIds: string[]}[]}>): string | undefined {
  let best: string | undefined;
  let bestCount = -1;
  for (const [candidateCurrency, aggregation] of byCurrency) {
    const count = aggregation.links.reduce((sum, link) => sum + link.transactionIds.length, 0);
    if (count > bestCount) {
      bestCount = count;
      best = candidateCurrency;
    }
  }
  return best;
}

export function FinancialFlowSankey({
  transactions,
  currency,
  height = 420,
  className,
}: FinancialFlowSankeyProps): React.ReactElement {
  const byCurrency = useMemo(() => aggregateTransactionsByCurrency(transactions), [transactions]);
  const availableCurrencies = useMemo(() => Array.from(byCurrency.keys()).sort(), [byCurrency]);
  const [selectedCurrency, setSelectedCurrency] = useState<string | undefined>(currency);

  const activeCurrency =
    selectedCurrency && byCurrency.has(selectedCurrency)
      ? selectedCurrency
      : currency && byCurrency.has(currency)
        ? currency
        : pickDefaultCurrency(byCurrency);

  const aggregation = activeCurrency ? byCurrency.get(activeCurrency) : undefined;

  const option: EChartsOption = useMemo(() => {
    if (!aggregation) {
      return {series: []};
    }
    return {
      tooltip: {
        trigger: 'item',
        formatter: (rawParams: unknown) => {
          const params = rawParams as {dataType?: string; name?: string; value?: number; data?: {flowType?: string}};
          if (params.dataType === 'edge') {
            const flowType = params.data?.flowType ?? 'direct';
            return `${params.name}<br/>${activeCurrency} ${(params.value ?? 0).toLocaleString()} (${flowType})`;
          }
          return String(params.name ?? '');
        },
      },
      series: [
        {
          type: 'sankey',
          data: aggregation.nodes,
          links: aggregation.links.map((link) => ({
            source: link.source,
            target: link.target,
            value: link.value,
            flowType: link.flowType ?? 'direct',
            lineStyle: {
              color: link.flowType === 'inferred' ? INFERRED_COLOR : DIRECT_COLOR,
              type: link.flowType === 'inferred' ? 'dashed' : 'solid',
              opacity: 0.55,
              curveness: 0.5,
            },
          })),
          emphasis: {focus: 'adjacency'},
          label: {color: 'hsl(226, 100%, 97%)'},
          nodeAlign: 'justify',
        },
      ],
    };
  }, [aggregation, activeCurrency]);

  if (transactions.length === 0) {
    return <p className="text-sm text-muted-foreground">No transactions to chart.</p>;
  }

  const excludedCurrencies = aggregation?.excludedCurrencies ?? [];

  return (
    <div className={className}>
      {availableCurrencies.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Currency</span>
          <Select value={activeCurrency} onValueChange={setSelectedCurrency}>
            <SelectTrigger className="w-32" aria-label="Select currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableCurrencies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {excludedCurrencies.length > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          Not shown (different currency, not summed with {activeCurrency}): {excludedCurrencies.join(', ')}.
        </p>
      )}
      <Chart
        option={option}
        height={height}
        ariaLabel={`Sankey diagram of ${activeCurrency ?? ''} transaction flows between ${aggregation?.nodes.length ?? 0} parties`}
      />
    </div>
  );
}
