// STRUCT-0040 / issue #40: types for the financial flow chart.
//
// Grounded directly in the TAS Financial Flow Analysis module's transaction
// ledger columns (backend/app/ai/tas_spec/PROMPT_MODULES/05_FINANCIAL_FLOW_ANALYSIS.md,
// section A): "TXN ID | Date/time | From | To | Amount | Currency |
// Instrument/account | Intermediary | Stated purpose | Evidence and
// pinpoint | Status/limitation". Section D (documented flow diagram) also
// requires each arrow to state "whether direct or inferred" -- captured
// here as `flowType`.
//
// This is infra/type-only, matching issue #40's own scope note ("Out of
// Scope: modifying existing pages"). No existing page imports this yet.

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
