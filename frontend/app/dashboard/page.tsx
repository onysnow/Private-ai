'use client';
import type {ReactElement} from 'react';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import {parseInvestigationList, parseLeadQueue, parseEntityList, parseTimelineBody, isClaim} from '../../lib/api-validate';
import type {Investigation, LeadItem, CanonicalEntity, TimelineEvent, Claim} from '../../lib/api-types';

// Quick-look overview for whoever opens the app first thing: which
// investigation is active, and the state of its leads/claims/entities/timeline
// without having to open the full workbench. Deliberately self-contained --
// its own state, its own fetches, reusing the same api-client/validators the
// workbench already relies on. Does not touch app/page.tsx.

type Stats = {
  leads: LeadItem[];
  claims: Claim[];
  entities: CanonicalEntity[];
  timeline: TimelineEvent[];
};

const EMPTY_STATS: Stats = {leads: [], claims: [], entities: [], timeline: []};

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

export default function DashboardPage(): ReactElement {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [selected, setSelected] = useState('');
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const list = await api.parsed('/api/investigations', parseInvestigationList, {signal: controller.signal});
        setInvestigations(list);
        setSelected(current => current || list[0]?.id || '');
      } catch (err) {
        if ((err as {name?: string}).name !== 'AbortError') setError(errorMessage(err, 'Could not load investigations'));
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selected) {
      setStats(EMPTY_STATS);
      return;
    }
    const controller = new AbortController();
    const {signal} = controller;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const [leads, claims, entities, timelineBody] = await Promise.all([
          api.parsed(`/api/investigations/${selected}/leads/queue?unresolved_only=false`, parseLeadQueue, {signal}),
          api.array(`/api/investigations/${selected}/claims`, 'claims', isClaim, {signal}),
          api.parsed(`/api/investigations/${selected}/entities`, parseEntityList, {signal}),
          api.parsed(`/api/investigations/${selected}/timeline`, parseTimelineBody, {signal})
        ]);
        setStats({leads, claims, entities, timeline: timelineBody.events});
      } catch (err) {
        if ((err as {name?: string}).name !== 'AbortError') setError(errorMessage(err, 'Could not load investigation stats'));
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [selected]);

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
