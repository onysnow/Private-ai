'use client';
// Quick-look overview for whoever opens the app first thing: which
// investigation is active, and the state of its leads/claims/entities/timeline
// without having to open the full workbench. Deliberately self-contained --
// its own selection and its own data cache -- on the generated API client
// (Foundation Fixes fix 2): every reply is checked against the API schema.
// Does not touch app/page.tsx.
import {useQueries, useQuery} from '@tanstack/react-query';
import type {ReactElement} from 'react';
import {useEffect, useState} from 'react';
import Link from 'next/link';

import {errorMessage} from '../../lib/api-client';
// Connects the generated client to the shared ApiClient (the API's address
// and this session's login token), as every page that calls the API does.
import '../../lib/api-instance';
import {filterHiddenDemo} from '../../lib/demo-preference';
import {
  getInvestigationTimelineOptions, leadQueueOptions, listClaimsOptions, listEntitiesOptions, listInvestigationsOptions,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {ClaimOut, EntityOut, InvestigationOut, LeadOut, TimelineEventOut} from '../../lib/generated/types.gen';
import {QueryProvider} from '../../lib/query-client';

type Stats = {
  leads: LeadOut[];
  claims: ClaimOut[];
  entities: EntityOut[];
  timeline: TimelineEventOut[];
};

const EMPTY_STATS: Stats = {leads: [], claims: [], entities: [], timeline: []};
const NO_INVESTIGATIONS: InvestigationOut[] = [];

function StatusBadge({status, tone}: {status: string; tone: 'primary' | 'secondary' | 'accent' | 'destructive'}): ReactElement {
  const toneClass = {
    primary: 'bg-primary/15 text-primary border-primary/30',
    secondary: 'bg-secondary/25 text-secondary-foreground border-secondary/40',
    accent: 'bg-accent/25 text-accent-foreground border-accent/40',
    destructive: 'bg-destructive/20 text-destructive-foreground border-destructive/40'
  }[tone];
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${toneClass}`}>{status}</span>;
}

function claimTone(status: string): 'primary' | 'secondary' | 'accent' | 'destructive' {
  if (status === 'confirmed' || status === 'supported') return 'accent';
  if (status === 'disputed' || status === 'rejected') return 'destructive';
  if (status === 'lead') return 'secondary';
  return 'primary';
}

// The page provides the data cache its queries use, as the workbench page does.
export default function DashboardPage(): ReactElement {
  return <QueryProvider><Dashboard/></QueryProvider>;
}

function Dashboard(): ReactElement {
  const [selected, setSelected] = useState('');
  const investigationsQuery = useQuery({...listInvestigationsOptions(), select: filterHiddenDemo});
  const investigations = investigationsQuery.data ?? NO_INVESTIGATIONS;

  // The first listed investigation is shown until another is picked.
  useEffect(() => {
    const first = investigationsQuery.data?.[0]?.id;
    if (first) setSelected(current => current || first);
  }, [investigationsQuery.data]);

  // The four reads of the shown investigation run side by side.
  const path = {investigation_id: selected};
  const enabled = Boolean(selected);
  const [leadsQuery, claimsQuery, entitiesQuery, timelineQuery] = useQueries({
    queries: [
      {...leadQueueOptions({path, query: {unresolved_only: false}}), enabled},
      {...listClaimsOptions({path}), enabled},
      {...listEntitiesOptions({path}), enabled},
      {...getInvestigationTimelineOptions({path}), enabled},
    ],
  });
  const statsQueries = [leadsQuery, claimsQuery, entitiesQuery, timelineQuery];

  // The numbers on screen change once all four reads of the picked
  // investigation are in. Until then, and if one of them fails, those of the
  // investigation shown before stay (with the failure above them), as they did
  // when the page fetched them itself.
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const leads = leadsQuery.data;
  const claims = claimsQuery.data;
  const entities = entitiesQuery.data;
  const timeline = timelineQuery.data;
  useEffect(() => {
    if (leads && claims && entities && timeline) setStats({leads: leads.items, claims, entities, timeline: timeline.events});
  }, [leads, claims, entities, timeline]);

  const loading = investigationsQuery.isPending || (enabled && statsQueries.some(q => q.isPending));
  // One line, as before: the list's failure, or the first of the case's reads to fail.
  const statsError = statsQueries.find(q => q.isError)?.error;
  const error = investigationsQuery.isError ? errorMessage(investigationsQuery.error, 'Could not load investigations')
    : statsError ? errorMessage(statsError, 'Could not load investigation stats') : '';

  const unresolvedLeads = stats.leads.filter(l => l.status !== 'resolved' && l.status !== 'dismissed');
  const needsAttention = stats.leads.filter(l => l.triage.needs_attention);
  const claimsByStatus = stats.claims.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});
  const recentTimeline = [...stats.timeline].slice(-6).reverse();

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quick standing of your active investigation. Open the workbench for the full toolset.
          </p>
        </div>
        {investigations.length > 0 && (
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            className="rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
          >
            {investigations.map(inv => (
              <option key={inv.id} value={inv.id}>
                {inv.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error ? (
        <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
          {error}
        </div>
      ) : null}

      {!loading && investigations.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">No investigations yet.</p>
          <Link href="/#investigation-search" className="mt-3 inline-block text-primary hover:underline">
            Start one in the workbench
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Open leads</div>
              <div className="mt-2 text-3xl font-semibold text-primary">{unresolvedLeads.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">{needsAttention.length} flagged for attention</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Claims</div>
              <div className="mt-2 text-3xl font-semibold text-primary">{stats.claims.length}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(claimsByStatus).map(([status, count]) => (
                  <StatusBadge key={status} status={`${status} · ${count}`} tone={claimTone(status)} />
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Entities tracked</div>
              <div className="mt-2 text-3xl font-semibold text-primary">{stats.entities.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">across the relationship graph</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Timeline events</div>
              <div className="mt-2 text-3xl font-semibold text-primary">{stats.timeline.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">{recentTimeline.length} shown below</div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold" style={{fontFamily: 'var(--font-heading)'}}>
                  Needs attention
                </h2>
                <Link href="/#leads" className="text-xs text-primary hover:underline">
                  Open leads
                </Link>
              </div>
              {needsAttention.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing flagged right now.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {needsAttention.slice(0, 6).map(lead => (
                    <li key={lead.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                      <span className="truncate">{lead.title}</span>
                      <StatusBadge status={lead.priority} tone="secondary" />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold" style={{fontFamily: 'var(--font-heading)'}}>
                  Recent activity
                </h2>
                <Link href="/" className="text-xs text-primary hover:underline">
                  Open workbench
                </Link>
              </div>
              {recentTimeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No timeline events yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {recentTimeline.map(event => (
                    <li key={event.id} className="rounded-md border border-border px-3 py-2 text-sm">
                      <div className="text-foreground">{event.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{event.date_start}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-8 flex justify-center">
            <Link
              href="/"
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Open full workbench
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
