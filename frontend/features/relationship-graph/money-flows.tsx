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
import {errorMessage} from '../../lib/api-client';
import {getInvestigationFinancialFlowsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {BlockSwatch, ChartFrame, FootStat, KeyRow, KeySection} from '../../components/charts/chart-frame';
import {FLOW_ROLE} from '../../components/charts/flow-roles';
import {LINK} from '../../lib/viz-tokens';

const FinancialFlowSankey = dynamic(() => import('../../components/charts/financial-flow-sankey').then(m => m.FinancialFlowSankey), {ssr: false, loading: () => <p className="muted">Loading the flow chart…</p>});

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

  const inferred = ledger?.transactions.some(t => t.flowType === 'inferred');
  return <ChartFrame kind="money" title="Where the money went"
    question="Payment relationships, as a ledger and a flow. Amounts in different currencies are never added together; reviewed duplicate payments count once."
    rule={{label: 'Payers on the left, recipients on the right:', text: 'each band is as wide as the money it carried, in one currency at a time.'}}
    tools={<Button size="sm" variant="outline" onClick={load} disabled={!investigationId}>{ledger ? 'Reload money flows' : 'Load money flows'}</Button>}
    legend={ledger && ledger.transactions.length > 0 ? <>
      <KeySection title="Parties" channel="colour: what it does here">
        {Object.values(FLOW_ROLE).map(role => <KeyRow key={role.name} swatch={<BlockSwatch colour={role.colour}/>}>{role.name}</KeyRow>)}
      </KeySection>
      <KeySection title="Bands" channel="width: how much; strength: how sure">
        <KeyRow swatch={<svg width="36" height="14"><rect x="1" y="3" width="34" height="8" fill={LINK.money.colour} opacity=".5"/></svg>}>Recorded payment</KeyRow>
        {inferred && <KeyRow swatch={<svg width="36" height="14"><rect x="1" y="3" width="34" height="8" fill={LINK.money.colour} opacity=".2"/></svg>}>Inferred from other records</KeyRow>}
      </KeySection>
    </> : undefined}
    footer={ledger ? <>
      <FootStat value={ledger.transactions.length}>{ledger.transactions.length === 1 ? 'payment' : 'payments'} charted</FootStat>
      {ledger.incomplete.length > 0 && <FootStat value={ledger.incomplete.length}>not charted, listed below with why</FootStat>}
      <span>{ledger.flow_type_rule}</span>
    </> : undefined}>
    <div style={{padding: '10px 16px'}} data-testid="money-flows-canvas">
      {!ledger && <p className="muted">{status || 'Load the ledger to draw the flows.'}</p>}
      {ledger && status && <p className="muted">{status}</p>}
      {ledger && <div data-testid="money-flows">
        {ledger.transactions.length > 0 && <FinancialFlowSankey height={Math.max(260, 60 + 46 * new Set(ledger.transactions.flatMap(t => [t.from, t.to])).size / 2)} transactions={ledger.transactions.map(t => ({
          id: t.id, dateTime: t.dateTime || '', from: t.from, to: t.to, amount: t.amount, currency: t.currency,
          statedPurpose: t.statedPurpose || undefined, evidence: t.evidence || undefined, status: t.status || undefined, flowType: t.flowType,
        }))}/>}
        <table className="oc-table" aria-label="The ledger">
          <thead><tr><th scope="col">Date</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Amount</th><th scope="col">Purpose</th><th scope="col">Evidence</th><th scope="col">Flow</th></tr></thead>
          <tbody>
            {ledger.transactions.length === 0 ? <tr><td colSpan={7}>No complete payments yet.</td></tr> : ledger.transactions.map(t => <tr key={t.id}>
              <td>{t.dateTime || '—'}</td><td>{t.from}</td><td>{t.to}</td>
              <td style={{fontVariantNumeric: 'tabular-nums'}}>{t.amount.toLocaleString()} {t.currency}</td><td>{t.statedPurpose || '—'}</td>
              <td>{t.evidence || 'none attached'}</td><td>{t.flowType}</td>
            </tr>)}
          </tbody>
        </table>
        {ledger.incomplete.length > 0 && <div style={{marginTop: 10}}>
          <b>Not charted ({ledger.incomplete.length})</b>
          {ledger.incomplete.map(r => <div key={r.id}><small>{r.from || '?'} → {r.to || '?'}: {r.problems.join('; ')}</small></div>)}
        </div>}
      </div>}
    </div>
  </ChartFrame>;
}
