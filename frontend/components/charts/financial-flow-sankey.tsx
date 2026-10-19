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
// Bands are drawn in the network's colour for payments (copper,
// lib/viz-tokens.ts); a flow inferred from other records rather than
// recorded directly is a fainter band (section D's "direct or inferred";
// transparency reads as uncertainty, MacEachren et al. 2012). A party's
// block is coloured by what it does here -- only pays, pays and receives,
// only receives -- and named with the total that passed through it.
//
// Used by app/page.tsx's money-flow panel (lazy-loaded), fed from
// GET /api/investigations/{id}/financial-flows. The Money view passes `fold`:
// a very large ledger then draws its largest flows and folds the rest into one
// band, "others (n)", as its Columns layout does; each party's label keeps its
// exact total.

import * as React from 'react';
import {useMemo, useState} from 'react';
import type {EChartsOption} from 'echarts';

import {Chart} from './chart';
import {
  aggregateTransactionsByCurrency,
  findFlowCycle,
  foldFlows,
  OTHERS_IN,
  OTHERS_OUT,
  type FinancialFlowTransaction,
} from '@/lib/financial-flow-types';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {LINK, SWATCH} from '@/lib/viz-tokens';
import {FLOW_ROLE, flowRole} from './flow-roles';

export type FinancialFlowSankeyProps = {
  transactions: FinancialFlowTransaction[];
  /** Force an initial currency. Defaults to the currency with the most transactions. */
  currency?: string;
  height?: number | string;
  className?: string;
  /** Draw only the `top` largest flows and fold the rest into "others (n)" unless `all`; `onAll` opens or folds them.
   *  Unset draws every flow. */
  fold?: {top: number; all: boolean; onAll: (all: boolean) => void};
};

// Fixed 2026-09-29: matches the real current Dark Academia tokens now used
// by components/entity-graph.tsx and lib/echarts-setup.ts -- these were
// still the pre-redesign blue/unrelated-amber values.
const BAND = LINK.money.colour;
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
  fold,
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

  const everyFlow = activeCurrency ? byCurrency.get(activeCurrency) : undefined;
  const top = fold && !fold.all ? fold.top : undefined;
  const shown = useMemo(() => (everyFlow ? foldFlows(everyFlow, top) : undefined), [everyFlow, top]);
  const aggregation = shown?.aggregation;
  const folded = shown?.folded ?? null;
  // Only a folded picture needs its labels told the exact totals; otherwise ECharts' own node values are the same.
  const exact = fold ? shown?.totals : undefined;
  const othersName = folded ? `others (${folded.flows})` : '';

  const option: EChartsOption = useMemo(() => {
    if (!aggregation) {
      return {series: []};
    }
    const shownName = (name: string) => (name === OTHERS_IN || name === OTHERS_OUT ? othersName : name);
    return {
      tooltip: {
        // Party names come from documents and outside records: plain text only, never HTML (richText mode).
        trigger: 'item', renderMode: 'richText', backgroundColor: SWATCH.card, borderColor: '#4e4234', textStyle: {color: SWATCH.parchment, fontSize: 12},
        formatter: (rawParams: unknown) => {
          const params = rawParams as {dataType?: string; name?: string; value?: number; data?: {flowType?: string; source?: string}};
          if (params.dataType === 'edge') {
            const flowType = params.data?.flowType ?? 'direct';
            if (folded && params.data?.source === OTHERS_IN) {
              return `${othersName}\n${activeCurrency} ${(params.value ?? 0).toLocaleString()} in ${folded.transactions} payment${folded.transactions === 1 ? '' : 's'}`;
            }
            return `${params.name}\n${activeCurrency} ${(params.value ?? 0).toLocaleString()} (${flowType})`;
          }
          return shownName(String(params.name ?? ''));
        },
      },
      series: [
        {
          type: 'sankey',
          left: 8, right: 160, top: 12, bottom: 12, nodeWidth: 14, nodeGap: 14,
          data: aggregation.nodes.map(node => ({...node, itemStyle: {color: FLOW_ROLE[flowRole(node.name, aggregation.links)].colour, borderColor: SWATCH.card}})),
          links: aggregation.links.map((link) => ({
            source: link.source,
            target: link.target,
            value: link.value,
            flowType: link.flowType ?? 'direct',
            lineStyle: {color: BAND, opacity: link.flowType === 'inferred' ? 0.2 : 0.5, curveness: 0.5},
          })),
          emphasis: {focus: 'adjacency', lineStyle: {opacity: 0.8}},
          label: {
            color: SWATCH.parchment, fontSize: 12, fontWeight: 600, textBorderColor: '#1c262b', textBorderWidth: 3,
            formatter: (p: unknown) => {
              const {name, value} = p as {name: string; value?: number};
              return `${shownName(name)}\n{amount|${activeCurrency} ${Math.round(exact?.get(name) ?? value ?? 0).toLocaleString('en-GB')}}`;
            },
            rich: {amount: {color: SWATCH.tan, fontSize: 11, fontWeight: 400, lineHeight: 15}},
          },
          nodeAlign: 'justify',
        },
      ],
    } as EChartsOption;
  }, [aggregation, activeCurrency, exact, folded, othersName]);

  if (transactions.length === 0) {
    return <p className="text-sm text-muted-foreground">No transactions to chart.</p>;
  }

  const excludedCurrencies = aggregation?.excludedCurrencies ?? [];
  const cycle = aggregation ? findFlowCycle(aggregation.links) : null;
  const parties = aggregation?.nodes.filter(n => n.name !== OTHERS_IN && n.name !== OTHERS_OUT).length ?? 0;
  const money = (amount: number) => `${activeCurrency} ${Math.round(amount).toLocaleString('en-GB')}`;

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
      {cycle ? (
        <p className="text-sm text-muted-foreground" role="note">
          The {activeCurrency} flows form a cycle ({cycle.join(' → ')}), which a Sankey diagram cannot draw. Every
          transaction is still listed in the ledger.
        </p>
      ) : (
        <Chart
          option={option}
          height={height}
          ariaLabel={`Sankey diagram of ${activeCurrency ?? ''} transaction flows between ${parties} parties${folded ? `, and ${othersName}` : ''}`}
        />
      )}
      {fold && folded && shown && (
        <p className="mt-2 text-xs text-muted-foreground" data-testid="sankey-fold">
          The {fold.top} largest of {shown.flows} flows are drawn; {othersName} holds the other {folded.transactions} payment{folded.transactions === 1 ? '' : 's'},{' '}
          {money(folded.amount)}. Totals count every payment.{' '}
          <button type="button" className="underline underline-offset-2 text-foreground" onClick={() => fold.onAll(true)}>Show all {shown.flows} flows</button>
        </p>
      )}
      {fold && fold.all && shown && shown.flows > fold.top && (
        <p className="mt-2 text-xs text-muted-foreground" data-testid="sankey-fold">
          All {shown.flows} flows are drawn.{' '}
          <button type="button" className="underline underline-offset-2 text-foreground" onClick={() => fold.onAll(false)}>Fold to the {fold.top} largest</button>
        </p>
      )}
    </div>
  );
}
