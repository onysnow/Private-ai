'use client';
// Money flows: the transaction ledger built from canonical Payment
// relationships, loaded on demand, drawn as a Sankey of complete payments.
// Amounts are never summed across currencies; a payment the ledger could
// not read in full is listed, with the reason, and not charted. ECharts is
// loaded on demand, client-side only, so it stays out of the first load.
import {useQuery} from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import type {ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {errorMessage} from '../../lib/api-client';
import {getInvestigationFinancialFlowsOptions} from '../../lib/generated/@tanstack/react-query.gen';

const FinancialFlowSankey = dynamic(() => import('../../components/charts/financial-flow-sankey').then(m => m.FinancialFlowSankey), {ssr: false, loading: () => <p className="muted">Loading flow chart…</p>});

type Props = {
  investigationId: string;
  /** Whether the reporter has asked for the ledger of this case. */
  wanted: boolean;
  onLoad: () => void;
};

export function MoneyFlows({investigationId, wanted, onLoad}: Props): ReactElement {
  const ledgerQuery = useQuery({...getInvestigationFinancialFlowsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId) && wanted});
  const ledger = wanted ? ledgerQuery.data : undefined;
  const status = wanted && ledgerQuery.isFetching ? 'Loading money flows…' : wanted && ledgerQuery.isError ? errorMessage(ledgerQuery.error, 'Could not load money flows') : '';

  const load = () => {
    onLoad();
    if (wanted) void ledgerQuery.refetch();
  };

  return <div className="candidate">
    <h4>Money flows</h4>
    <p className="muted">Built from Payment relationships. Amounts are never summed across currencies; reviewed duplicate payments count once.</p>
    <Button onClick={load} disabled={!investigationId}>{ledger ? 'Reload money flows' : 'Load money flows'}</Button>
    {status && <p className="muted">{status}</p>}
    {ledger && <div data-testid="money-flows">
      {ledger.transactions.length > 0 && <FinancialFlowSankey height={360} transactions={ledger.transactions.map(t => ({
        id: t.id, dateTime: t.dateTime || '', from: t.from, to: t.to, amount: t.amount, currency: t.currency,
        statedPurpose: t.statedPurpose || undefined, evidence: t.evidence || undefined, status: t.status || undefined, flowType: t.flowType,
      }))}/>}
      <small>Solid = direct, dashed = inferred. {ledger.flow_type_rule}</small>
      <Table className="ledger">
        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Amount</TableHead><TableHead>Purpose</TableHead><TableHead>Evidence</TableHead><TableHead>Flow</TableHead></TableRow></TableHeader>
        <TableBody>
          {ledger.transactions.length === 0 ? <TableRow><TableCell colSpan={7}>No complete payments yet.</TableCell></TableRow> : ledger.transactions.map(t => <TableRow key={t.id}>
            <TableCell>{t.dateTime || '—'}</TableCell><TableCell>{t.from}</TableCell><TableCell>{t.to}</TableCell>
            <TableCell>{t.amount.toLocaleString()} {t.currency}</TableCell><TableCell>{t.statedPurpose || '—'}</TableCell>
            <TableCell>{t.evidence || 'none attached'}</TableCell><TableCell>{t.flowType}</TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
      {ledger.incomplete.length > 0 && <div>
        <b>Not charted ({ledger.incomplete.length})</b>
        {ledger.incomplete.map(r => <div key={r.id}><small>{r.from || '?'} → {r.to || '?'}: {r.problems.join('; ')}</small></div>)}
      </div>}
    </div>}
  </div>;
}
