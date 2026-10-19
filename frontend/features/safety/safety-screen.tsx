'use client';
// Keep › Safety & data (mockup KEEP-safety-and-data; research §7; ADR-0015): one place that answers "is my case safe on this
// computer, is it backed up, and what has left it?". Left: what lives where and what leaves it, with the four Keep
// cards under it. Right: the outbound log, word for word. "Your safety" (research §13) is not built yet: it needs
// Ony's levels and wording, so the column holds the log alone. The page does not scroll; the log scrolls inside.
import {useQuery} from '@tanstack/react-query';
import {useMemo, useState} from 'react';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {getOutboundLogOptions, getSafetyAndDataOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {apiTime} from '../../lib/timestamps';
import {DataMap} from './data-map';
import {KeepCards} from './keep-cards';
import {OutboundLog} from './outbound-log';
import {privateAiLine} from './format';
import type {Period} from './format';

export function SafetyScreen({investigationId}: {investigationId: string}): ReactElement {
  const [period, setPeriod] = useState<Period>('7d');
  const enabled = Boolean(investigationId);
  const data = useQuery({...getSafetyAndDataOptions({path: {investigation_id: investigationId}, query: {period}}), enabled});
  // The services' hover cards read the same log the table shows (all services, this period).
  const recent = useQuery({...getOutboundLogOptions({path: {investigation_id: investigationId}, query: {period, limit: 200}}), enabled});
  const now = useMemo(() => (data.data ? apiTime(data.data.now) : new Date()), [data.data]);

  if (!enabled) return <div className="sd"><p className="sd-quiet">Open a case to see what lives on this computer and what has left it.</p></div>;
  if (data.isError) return <div className="sd"><p className="sd-error" role="alert">Safety & data could not be read. {errorMessage(data.error)}</p>
    <button type="button" className="sd-btn" onClick={() => void data.refetch()}>Try again</button></div>;
  if (data.isPending) return <div className="sd" aria-busy="true"><div className="sd-skeleton tall"/></div>;

  const ai = privateAiLine(data.data.stores.private_ai);
  return <div className="sd">
    <div className="sd-main">
      <header className="sd-top">
        <h2 className="sd-title">What lives on <em>this computer</em>, and what leaves it</h2>
        <span className="sd-chip is-ai" title="Where the AI model runs">{`Private AI · ${ai.title.toLowerCase()}`}</span>
      </header>
      <DataMap data={data.data} recent={recent.data?.entries ?? []} period={period} onPeriod={setPeriod} now={now}/>
      <KeepCards investigationId={investigationId} cards={data.data.cards} now={now} onBackedUp={() => void data.refetch()}/>
    </div>
    <aside className="sd-side" aria-label="Outbound log">
      <OutboundLog investigationId={investigationId} caseName={data.data.investigation.name} period={period} services={data.data.services} now={now} notCounted={data.data.not_counted}/>
    </aside>
  </div>;
}
