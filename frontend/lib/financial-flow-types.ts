// STRUCT-0040 / issue #40: types for the financial flow chart.
//
// Grounded directly in the TAS Financial Flow Analysis module's transaction
// ledger columns (backend/app/ai/authority_suite/systems/tas/PROMPT_MODULES/05_FINANCIAL_FLOW_ANALYSIS.md,
// section A): "TXN ID | Date/time | From | To | Amount | Currency |
// Instrument/account | Intermediary | Stated purpose | Evidence and
// pinpoint | Status/limitation". Section D (documented flow diagram) also
// requires each arrow to state "whether direct or inferred" -- captured
// here as `flowType`.
//
// Used by <FinancialFlowSankey>, fed from GET
// /api/investigations/{id}/financial-flows (canonical Payment relationships).

export type FinancialFlowType = 'direct' | 'inferred';

export type FinancialFlowTransaction = {
  id: string;
  dateTime: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  instrument?: string;
  intermediary?: string;
  statedPurpose?: string;
  evidence?: string;
  status?: string;
  flowType?: FinancialFlowType;
};

export type FinancialFlowSankeyNode = {
  name: string;
};

export type FinancialFlowSankeyLink = {
  source: string;
  target: string;
  value: number;
  flowType?: FinancialFlowType;
  transactionIds: string[];
};

export type FinancialFlowAggregation = {
  currency: string;
  nodes: FinancialFlowSankeyNode[];
  links: FinancialFlowSankeyLink[];
  excludedCurrencies: string[];
};

/**
 * Groups transactions by currency (per the module's rule 3: "Do not merge
 * same-day or same-amount transactions without evidence that they are the
 * same transfer" -- extended here to currencies, which must never be summed
 * together since doing so would misrepresent magnitude) and aggregates
 * same-currency (from, to) pairs into Sankey links, summing amount and
 * collecting the contributing transaction ids for traceability back to the
 * ledger. A link's flowType is 'inferred' if any contributing transaction is
 * inferred (the weaker claim), 'direct' only if every contributing
 * transaction is direct.
 */
export function aggregateTransactionsByCurrency(
  transactions: FinancialFlowTransaction[],
): Map<string, FinancialFlowAggregation> {
  const byCurrency = new Map<string, FinancialFlowTransaction[]>();
  for (const txn of transactions) {
    const bucket = byCurrency.get(txn.currency);
    if (bucket) {
      bucket.push(txn);
    } else {
      byCurrency.set(txn.currency, [txn]);
    }
  }

  const allCurrencies = Array.from(byCurrency.keys());
  const result = new Map<string, FinancialFlowAggregation>();

  for (const [currency, txns] of byCurrency.entries()) {
    const nodeNames = new Set<string>();
    const linkByPair = new Map<string, FinancialFlowSankeyLink>();

    for (const txn of txns) {
      nodeNames.add(txn.from);
      nodeNames.add(txn.to);
      const key = `${txn.from}\u0000${txn.to}`;
      const existing = linkByPair.get(key);
      if (existing) {
        existing.value += txn.amount;
        existing.transactionIds.push(txn.id);
        if (txn.flowType === 'inferred') {
          existing.flowType = 'inferred';
        }
      } else {
        linkByPair.set(key, {
          source: txn.from,
          target: txn.to,
          value: txn.amount,
          flowType: txn.flowType,
          transactionIds: [txn.id],
        });
      }
    }

    result.set(currency, {
      currency,
      nodes: Array.from(nodeNames, (name) => ({ name })),
      links: Array.from(linkByPair.values()),
      excludedCurrencies: allCurrencies.filter((c) => c !== currency),
    });
  }

  return result;
}

/**
 * ECharts' Sankey series only accepts acyclic graphs (it throws "Sankey is a
 * DAG" otherwise), but real money can flow in a circle (A -> B -> A). Returns
 * one cycle as a closed node path (e.g. ['A', 'B', 'A']) so the caller can
 * say why the diagram is not drawn instead of crashing, or null if none.
 */
export function findFlowCycle(links: Pick<FinancialFlowSankeyLink, 'source' | 'target'>[]): string[] | null {
  const next = new Map<string, string[]>();
  for (const link of links) {
    const list = next.get(link.source);
    if (list) list.push(link.target);
    else next.set(link.source, [link.target]);
  }
  const state = new Map<string, 'visiting' | 'done'>();
  const path: string[] = [];
  const visit = (node: string): string[] | null => {
    state.set(node, 'visiting');
    path.push(node);
    for (const target of next.get(node) ?? []) {
      const seen = state.get(target);
      if (seen === 'visiting') return [...path.slice(path.indexOf(target)), target];
      if (seen === undefined) {
        const found = visit(target);
        if (found) return found;
      }
    }
    path.pop();
    state.set(node, 'done');
    return null;
  };
  for (const node of next.keys()) {
    if (!state.has(node)) {
      const found = visit(node);
      if (found) return found;
    }
  }
  return null;
}

/** The two ends of the "others (n)" band: not parties, so no party's name can match them. */
export const OTHERS_IN = '\u0000others:in';
export const OTHERS_OUT = '\u0000others:out';

export type FoldedFlows = {
  /** What is drawn: the largest flows, and the rest as one "others (n)" link when any were folded. */
  aggregation: FinancialFlowAggregation;
  /** How many flows (payer to payee) there are in all. */
  flows: number;
  folded: {flows: number; transactions: number; amount: number} | null;
  /** Each party's exact total (the larger of what came in and what went out, over every flow), as its label shows it. */
  totals: Map<string, number>;
};

/**
 * Draws only the `top` largest flows and folds the rest into one link, "others (n)", from a node of its own
 * to another (the money view's Columns layout does the same: features/money/money-layout.ts TOP_FLOWS).
 * Each party's total still counts every flow. With `top` unset, or no more flows than `top`, nothing folds.
 */
export function foldFlows(aggregation: FinancialFlowAggregation, top?: number): FoldedFlows {
  const totalIn = new Map<string, number>();
  const totalOut = new Map<string, number>();
  for (const link of aggregation.links) {
    totalOut.set(link.source, (totalOut.get(link.source) ?? 0) + link.value);
    totalIn.set(link.target, (totalIn.get(link.target) ?? 0) + link.value);
  }
  const totals = new Map(aggregation.nodes.map(n => [n.name, Math.max(totalIn.get(n.name) ?? 0, totalOut.get(n.name) ?? 0)]));
  const flows = aggregation.links.length;
  if (top === undefined || flows <= top) return {aggregation, flows, folded: null, totals};
  const key = (l: FinancialFlowSankeyLink) => `${l.source}\u0000${l.target}`;
  const ranked = [...aggregation.links].sort((a, b) => b.value - a.value || key(a).localeCompare(key(b)));
  const kept = ranked.slice(0, top);
  const rest = ranked.slice(top);
  const amount = rest.reduce((s, l) => s + l.value, 0);
  const transactionIds = rest.flatMap(l => l.transactionIds);
  const names = new Set(kept.flatMap(l => [l.source, l.target]));
  totals.set(OTHERS_IN, amount);
  totals.set(OTHERS_OUT, amount);
  return {
    aggregation: {
      ...aggregation,
      nodes: [...aggregation.nodes.filter(n => names.has(n.name)), {name: OTHERS_IN}, {name: OTHERS_OUT}],
      links: [...kept, {source: OTHERS_IN, target: OTHERS_OUT, value: amount, transactionIds,
        flowType: rest.some(l => l.flowType === 'inferred') ? 'inferred' : 'direct'}],
    },
    flows,
    folded: {flows: rest.length, transactions: transactionIds.length, amount},
    totals,
  };
}
