'use client';
import type {ReactElement} from 'react';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {api, API} from '../../lib/api-instance';
import {ApiHttpError, errorMessage} from '../../lib/api-client';
import {isSettingsStatus, parseInvestigationList, isInvestigationDeletionPreview, isInvestigationDeletionResult} from '../../lib/api-validate';
import type {SettingsStatus, Investigation, InvestigationDeletionPreview} from '../../lib/api-types';
import {isDemoHidden, setDemoHidden} from '../../lib/demo-preference';

// Phase 1 scope: the bearer-token API access card only, reusing the shared
// `api` singleton (lib/api-instance.ts) so a token entered here is the same
// token the workbench (/) uses. Connector credentials, backup/restore, and
// the security audit log stay on the main workbench for now -- they read
// investigation-scoped state the workbench already tracks, and moving them
// here is a later extraction phase, not this one.

type AccessState = 'checking' | 'local' | 'authenticated' | 'needs_token' | 'remote_disabled' | 'error';

export default function SettingsPage(): ReactElement {
  const [tokenInput, setTokenInput] = useState('');
  const [state, setState] = useState<AccessState>('checking');
  const [message, setMessage] = useState('Checking API access…');
  const [status, setStatus] = useState<SettingsStatus | null>(null);

  // Demo mode: one dedicated "Demo Investigation" seeded through the real
  // backend service layer (see backend/app/services/demo_seed.py), so every
  // feature -- the relationship graph, claim verification, leads, the
  // timeline -- genuinely works on it. Two separate, distinct controls:
  // a non-destructive "hide" toggle (a per-browser preference, does not
  // touch the data) and a separate "Delete demo data" action that reuses
  // the same preview-then-type-to-confirm deletion flow the main workbench
  // uses for any investigation.
  const [demoInv, setDemoInv] = useState<Investigation | null>(null);
  const [demoChecked, setDemoChecked] = useState(false);
  const [demoStatus, setDemoStatus] = useState('');
  const [hideDemo, setHideDemo] = useState(false);
  const [demoDeletePreview, setDemoDeletePreview] = useState<InvestigationDeletionPreview | null>(null);
  const [demoDeleteConfirmation, setDemoDeleteConfirmation] = useState('');

  const refreshDemoState = async () => {
    try {
      const rows = await api.parsed('/api/investigations', parseInvestigationList);
      setDemoInv(rows.find(inv => inv.is_demo) || null);
    } catch (error) {
      setDemoStatus(errorMessage(error, 'Could not check demo investigation status'));
    } finally {
      setDemoChecked(true);
    }
  };

  useEffect(() => {
    setHideDemo(isDemoHidden());
    void refreshDemoState();
  }, []);

  const seedDemo = async () => {
    setDemoStatus('Seeding demo investigation…');
    try {
      await api.unknown('/api/demo/seed', {method: 'POST'});
      await refreshDemoState();
      setDemoStatus('Demo investigation is ready.');
    } catch (error) {
      setDemoStatus(errorMessage(error, 'Could not seed demo investigation'));
    }
  };

  const toggleHideDemo = () => {
    const next = !hideDemo;
    setDemoHidden(next);
    setHideDemo(next);
  };

  const previewDeleteDemo = async () => {
    if (!demoInv) return;
    setDemoStatus('Calculating deletion impact…');
    setDemoDeleteConfirmation('');
    try {
      const value = await api.object(`/api/investigations/${demoInv.id}/deletion-preview`, 'deletion preview', isInvestigationDeletionPreview);
      setDemoDeletePreview(value);
      setDemoStatus(value.can_delete ? 'Preview ready. Type the exact investigation ID to enable deletion.' : 'Deletion is blocked by an unsafe document path.');
    } catch (error) {
      setDemoDeletePreview(null);
      setDemoStatus(errorMessage(error, 'Deletion preview failed'));
    }
  };

  const deleteDemo = async () => {
    if (!demoDeletePreview || demoDeleteConfirmation !== demoDeletePreview.requires_confirmation) return;
    setDemoStatus('Deleting demo investigation…');
    try {
      const params = new URLSearchParams({confirmation: demoDeleteConfirmation});
      const result = await api.object(`/api/investigations/${demoDeletePreview.investigation_id}?${params.toString()}`, 'deletion result', isInvestigationDeletionResult, {method: 'DELETE'});
      setDemoDeletePreview(null);
      setDemoDeleteConfirmation('');
      setDemoStatus(`Deleted ${result.deleted_record_total} record(s) and ${result.document_files_deleted} document file(s).`);
      await refreshDemoState();
    } catch (error) {
      setDemoStatus(errorMessage(error, 'Demo deletion failed'));
    }
  };

  const check = async () => {
    setState('checking');
    setMessage('Checking API access…');
    try {
      const value = await api.object('/api/settings/status', 'settings status', isSettingsStatus);
      setStatus(value);
      setState(api.hasAuthToken() ? 'authenticated' : 'local');
      setMessage(
        api.hasAuthToken()
          ? 'Authenticated for this browser session. The token is held only in memory and is not written to storage.'
          : value.access.mode === 'local_only'
            ? 'Local-only API access. No bearer token is required on loopback.'
            : 'Connected from a trusted local address; remote clients require the configured bearer token.'
      );
    } catch (error) {
      setStatus(null);
      if (error instanceof ApiHttpError && error.status === 401) {
        setState('needs_token');
        setMessage('This API requires a bearer token for non-local access. Enter it below.');
        return;
      }
      if (error instanceof ApiHttpError && error.status === 403) {
        setState('remote_disabled');
        setMessage('Remote API access is disabled on the backend.');
        return;
      }
      setState('error');
      setMessage(errorMessage(error, 'Could not connect to the API'));
    }
  };

  useEffect(() => {
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authenticate = async () => {
    const token = tokenInput.trim();
    if (!token) return;
    api.setAuthToken(token);
    setTokenInput('');
    await check();
  };

  const clearSession = async () => {
    api.clearAuthToken();
    setTokenInput('');
    setMessage('Session token cleared. Rechecking API access…');
    await check();
  };

  const stateTone: Record<AccessState, string> = {
    checking: 'border-border bg-card text-muted-foreground',
    local: 'border-accent/40 bg-accent/15 text-accent-foreground',
    authenticated: 'border-accent/40 bg-accent/15 text-accent-foreground',
    needs_token: 'border-secondary/40 bg-secondary/15 text-secondary-foreground',
    remote_disabled: 'border-destructive/40 bg-destructive/15 text-destructive-foreground',
    error: 'border-destructive/40 bg-destructive/15 text-destructive-foreground'
  };

  return (
    <div className="mx-auto max-w-[720px] px-6 py-12">
      <h1 className="text-3xl font-semibold" style={{fontFamily: 'var(--font-heading)'}}>
        Settings
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        API access for this browser session. Connector credentials, backups, and the security audit log are on the{' '}
        <Link href="/" className="text-primary hover:underline">
          main workbench
        </Link>
        .
      </p>

      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold" style={{fontFamily: 'var(--font-heading)'}}>
          API access
        </h2>
        <div className={`mt-3 rounded-md border px-3 py-2 text-sm ${stateTone[state]}`}>{message}</div>

        {(state === 'needs_token' || state === 'authenticated') && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              autoComplete="off"
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              placeholder="Bearer token"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
            <button
              type="button"
              onClick={() => void authenticate()}
              disabled={!tokenInput.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Save token
            </button>
          </div>
        )}

        {api.hasAuthToken() && (
          <button
            type="button"
            onClick={() => void clearSession()}
            className="mt-3 rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Clear session token
          </button>
        )}

        <div className="mt-4 text-xs text-muted-foreground">
          <div>API base URL: {API}</div>
          {status && (
            <div className="mt-1">
              Access mode: {status.access.mode === 'local_only' ? 'local only' : 'shared bearer for remote clients'} ·
              token configured on backend: {status.access.token_configured ? 'yes' : 'no'}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold" style={{fontFamily: 'var(--font-heading)'}}>
          Operator console
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The backend console is loopback-only by design -- no bearer token grants remote access to it. Open it from{' '}
          <code>localhost</code> or <code>127.0.0.1</code> directly.
        </p>
        <Link href="/console" className="mt-3 inline-block text-sm text-primary hover:underline">
          Open console
        </Link>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold" style={{fontFamily: 'var(--font-heading)'}}>
          Demo mode
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A dedicated &ldquo;Demo Investigation&rdquo; with sample entities, relationships, claims, evidence, leads, and a
          timeline, so you can try every feature -- including the relationship graph -- without touching real work.
        </p>

        {demoChecked && (
          <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
            {demoInv ? `Demo investigation: "${demoInv.name}"` : 'No demo investigation yet.'}
          </div>
        )}

        {demoStatus && <div className="mt-3 text-xs text-muted-foreground">{demoStatus}</div>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void seedDemo()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {demoInv ? 'Re-seed demo data' : 'Add demo data'}
          </button>

          {demoInv && (
            <button
              type="button"
              onClick={toggleHideDemo}
              className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {hideDemo ? 'Show demo investigation' : 'Hide demo investigation'}
            </button>
          )}
        </div>
        {hideDemo && (
          <p className="mt-2 text-xs text-muted-foreground">
            Hidden from investigation pickers in this browser only. The data itself is untouched -- use &ldquo;Delete demo
            data&rdquo; below to remove it for good.
          </p>
        )}

        {demoInv && (
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-destructive-foreground">Delete demo data</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Permanently removes the demo investigation and everything in it. This cannot be undone.
            </p>

            {!demoDeletePreview ? (
              <button
                type="button"
                onClick={() => void previewDeleteDemo()}
                className="mt-3 rounded-md border border-destructive/40 px-4 py-2 text-sm text-destructive-foreground hover:bg-destructive/10"
              >
                Preview deletion
              </button>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                <div className="text-xs text-muted-foreground">
                  This will remove {demoDeletePreview.record_total} record(s)
                  {demoDeletePreview.document_file_summary.delete
                    ? ` and ${demoDeletePreview.document_file_summary.delete} document file(s)`
                    : ''}
                  . Type <code>{demoDeletePreview.requires_confirmation}</code> to confirm.
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={demoDeleteConfirmation}
                    onChange={e => setDemoDeleteConfirmation(e.target.value)}
                    placeholder="Investigation ID"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => void deleteDemo()}
                    disabled={!demoDeletePreview.can_delete || demoDeleteConfirmation !== demoDeletePreview.requires_confirmation}
                    className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50"
                  >
                    Delete permanently
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDemoDeletePreview(null);
                      setDemoDeleteConfirmation('');
                    }}
                    className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
