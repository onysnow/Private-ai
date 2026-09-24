import {describe, expect, it} from 'vitest';

import {aggregateTransactionsByCurrency, type FinancialFlowTransaction} from '../lib/financial-flow-types';

function txn(overrides: Partial<FinancialFlowTransaction> & Pick<FinancialFlowTransaction, 'id' | 'from' | 'to' | 'amount' | 'currency'>): FinancialFlowTransaction {
  return {dateTime: '2024-01-01T00:00:00Z', ...overrides};
}

describe('aggregateTransactionsByCurrency', () => {
  it('returns an empty map for no transactions', () => {
    const result = aggregateTransactionsByCurrency([]);
    expect(result.size).toBe(0);
  });

  it('groups by currency and never sums across currencies', () => {
    const result = aggregateTransactionsByCurrency([
      txn({id: 't1', from: 'A', to: 'B', amount: 100, currency: 'USD'}),
      txn({id: 't2', from: 'A', to: 'B', amount: 50, currency: 'EUR'}),
    ]);
    expect(result.size).toBe(2);
    expect(result.get('USD')?.links).toEqual([
      expect.objectContaining({source: 'A', target: 'B', value: 100, transactionIds: ['t1']}),
    ]);
    expect(result.get('EUR')?.links).toEqual([
      expect.objectContaining({source: 'A', target: 'B', value: 50, transactionIds: ['t2']}),
    ]);
    expect(result.get('USD')?.excludedCurrencies).toEqual(['EUR']);
    expect(result.get('EUR')?.excludedCurrencies).toEqual(['USD']);
  });

  it('sums same-currency, same-pair transactions and collects transaction ids', () => {
    const result = aggregateTransactionsByCurrency([
      txn({id: 't1', from: 'A', to: 'B', amount: 100, currency: 'USD'}),
      txn({id: 't2', from: 'A', to: 'B', amount: 25, currency: 'USD'}),
    ]);
    const usd = result.get('USD');
    expect(usd?.links).toHaveLength(1);
    expect(usd?.links[0]).toMatchObject({source: 'A', target: 'B', value: 125, transactionIds: ['t1', 't2']});
  });

  it('collects unique node names from both from and to', () => {
    const result = aggregateTransactionsByCurrency([
      txn({id: 't1', from: 'A', to: 'B', amount: 10, currency: 'USD'}),
      txn({id: 't2', from: 'B', to: 'C', amount: 5, currency: 'USD'}),
    ]);
    const names = result.get('USD')?.nodes.map((n) => n.name).sort();
    expect(names).toEqual(['A', 'B', 'C']);
  });

  it('marks a link inferred if any contributing transaction is inferred, even when others are direct', () => {
    const result = aggregateTransactionsByCurrency([
      txn({id: 't1', from: 'A', to: 'B', amount: 10, currency: 'USD', flowType: 'direct'}),
      txn({id: 't2', from: 'A', to: 'B', amount: 5, currency: 'USD', flowType: 'inferred'}),
    ]);
    expect(result.get('USD')?.links[0].flowType).toBe('inferred');
  });

  it('keeps a link direct only when every contributing transaction is direct', () => {
    const result = aggregateTransactionsByCurrency([
      txn({id: 't1', from: 'A', to: 'B', amount: 10, currency: 'USD', flowType: 'direct'}),
      txn({id: 't2', from: 'A', to: 'B', amount: 5, currency: 'USD', flowType: 'direct'}),
    ]);
    expect(result.get('USD')?.links[0].flowType).toBe('direct');
  });

  it('keeps distinct (from, to) pairs as separate links', () => {
    const result = aggregateTransactionsByCurrency([
      txn({id: 't1', from: 'A', to: 'B', amount: 10, currency: 'USD'}),
      txn({id: 't2', from: 'B', to: 'A', amount: 5, currency: 'USD'}),
    ]);
    expect(result.get('USD')?.links).toHaveLength(2);
  });
});
