'use client';
import type {ReactElement} from 'react';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {api, API} from '../../lib/api-instance';
import {ApiHttpError, errorMessage} from '../../lib/api-client';
import {isSettingsStatus} from '../../lib/api-validate';
import type {SettingsStatus} from '../../lib/api-types';

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
    </div>
  );
}
