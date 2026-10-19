'use client';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import type {ReactElement} from 'react';
import {useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {api, API} from '../../lib/api-instance';
import {ApiHttpError, errorMessage} from '../../lib/api-client';
import {connectorsOptions, listInvestigationsOptions, listInvestigationsQueryKey, settingsStatusOptions, settingsStatusQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {investigationDeletionPreview, removeInvestigation, seedDemo as seedDemoInvestigation} from '../../lib/generated/sdk.gen';
import type {InvestigationDeletionPreview, SettingsStatusOut} from '../../lib/generated/types.gen';
import {isDemoHidden, setDemoHidden} from '../../lib/demo-preference';
import {QueryProvider} from '../../lib/query-client';
import {describeAiStatus, whereModelRuns} from '../../components/ai-reasoning-panel';
import {AppearancePanel, lookName, useAppearance} from '../../features/appearance/appearance-panel';
import {KeptLine, SettingsNav, SettingsSearch, useSection, type SettingRow} from '../../features/settings/settings-index';
import {HIDE_SCREEN_EVENT, NEW_CASE_EVENT, OPEN_INBOX_EVENT} from '../../components/frame/app-frame';
import {ConnectorsPanel} from '../../features/connectors/connectors-panel';
import {SecurityPanel} from '../../features/security/security-panel';
import {BackupPanel} from '../../features/backups/backup-panel';
import {LevelChip, LEVEL_WORDS} from '../../components/status';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {setSingleKeys, singleKeysOn} from '../../lib/shortcuts';
import {SuiteCoverage} from '../../features/suite-coverage/suite-coverage';
import {DemoCasesLoader} from '../../features/demo/demo-cases-loader';
import {OneMdbLoader} from '../../features/demo/one-mdb-loader';

// Phase 1 scope: the bearer-token API access card only, reusing the shared
// `api` singleton (lib/api-instance.ts) so a token entered here is the same
// token the workbench (/) uses. Connector credentials, backup/restore, and
// the security audit log stay on the main workbench for now -- they read
// investigation-scoped state the workbench already tracks, and moving them
// here is a later extraction phase, not this one.
//
// On the generated API client (Foundation Fixes fix 2), with its own data
// cache (fix 3): the settings status and the investigation list are
// queries, and every reply is checked against the API schema.

type AccessState = 'checking' | 'local' | 'authenticated' | 'needs_token' | 'remote_disabled' | 'error';

type Access = {state: AccessState; message: string; status: SettingsStatusOut | null};

/** What the settings status query says about API access from this browser. */
function accessOf(query: {isFetching: boolean; isError: boolean; error: unknown; data: SettingsStatusOut | undefined}): Access {
  // A recheck keeps the last status on screen until the server answers, as
  // it did before; a status that last failed stays blank.
  if (query.isFetching || (!query.isError && !query.data)) {
    return {state: 'checking', message: 'Checking API access…', status: query.isError ? null : query.data ?? null};
  }
  if (query.isError) {
    const error = query.error;
    if (error instanceof ApiHttpError && error.status === 401) {
      return {state: 'needs_token', message: 'This API requires a bearer token for non-local access. Enter it below.', status: null};
    }
    if (error instanceof ApiHttpError && error.status === 403) {
      return {state: 'remote_disabled', message: 'Remote API access is disabled on the backend.', status: null};
    }
    return {state: 'error', message: errorMessage(error, 'Could not connect to the API'), status: null};
  }
  const status = query.data ?? null;
  if (api.hasAuthToken()) {
    return {state: 'authenticated', message: 'Authenticated for this browser session. The token is held only in memory and is not written to storage.', status};
  }
  return {
    state: 'local',
    message: status?.access.mode === 'local_only'
      ? 'Local-only API access. No bearer token is required on loopback.'
      : 'Connected from a trusted local address; remote clients require the configured bearer token.',
    status,
  };
}

// The page provides the data cache its queries use, as the workbench page does.
export default function SettingsPage(): ReactElement {
  return <QueryProvider><Settings/></QueryProvider>;
}

function Settings(): ReactElement {
  const queryClient = useQueryClient();
  const [tokenInput, setTokenInput] = useState('');
  const statusQuery = useQuery(settingsStatusOptions());
  const {state, message, status} = accessOf(statusQuery);

  // Demo mode: one dedicated "Demo Investigation" seeded through the real
  // backend service layer (see backend/app/services/demo_seed.py), so every
  // feature -- the relationship graph, claim verification, leads, the
  // timeline -- genuinely works on it. Two separate, distinct controls:
  // a non-destructive "hide" toggle (a per-browser preference, does not
  // touch the data) and a separate "Delete demo data" action that reuses
  // the same preview-then-type-to-confirm deletion flow the main workbench
  // uses for any investigation.
  const investigationsQuery = useQuery(listInvestigationsOptions());
  // The small made-up demo; the 1MDB case (also a demo) has its own control below.
  const demoInv = investigationsQuery.data?.find(inv => inv.is_demo && inv.name !== '1MDB') ?? null;
  // Shown once the list has answered (or failed to), as before.
  const demoChecked = !investigationsQuery.isPending;
  const [demoStatus, setDemoStatus] = useState('');
  const [hideDemo, setHideDemo] = useState(false);
  const [demoDeletePreview, setDemoDeletePreview] = useState<InvestigationDeletionPreview | null>(null);
  const [demoDeleteConfirmation, setDemoDeleteConfirmation] = useState('');

  const listFailure = (error: unknown) => errorMessage(error, 'Could not check demo investigation status');

  // The first answer of the list: a failure is shown in the demo status line.
  const firstListAnswer = useRef(false);
  useEffect(() => {
    if (firstListAnswer.current || investigationsQuery.isPending) return;
    firstListAnswer.current = true;
    if (investigationsQuery.isError) setDemoStatus(listFailure(investigationsQuery.error));
  }, [investigationsQuery.isPending, investigationsQuery.isError, investigationsQuery.error]);

  // Reads the list again; a failure is shown, and the demo case last seen stays.
  const refreshDemoState = async () => {
    const {error} = await investigationsQuery.refetch();
    if (error) setDemoStatus(listFailure(error));
  };

  useEffect(() => {
    setHideDemo(isDemoHidden());
  }, []);

  const seedMutation = useMutation({mutationFn: async () => (await seedDemoInvestigation({throwOnError: true})).data});
  const previewMutation = useMutation({
    mutationFn: async (id: string) => (await investigationDeletionPreview({path: {investigation_id: id}, throwOnError: true})).data,
  });
  const deleteMutation = useMutation({
    mutationFn: async (input: {id: string; confirmation: string}) =>
      (await removeInvestigation({path: {investigation_id: input.id}, query: {confirmation: input.confirmation}, throwOnError: true})).data,
  });

  const seedDemo = async () => {
    setDemoStatus('Seeding demo investigation…');
    try {
      await seedMutation.mutateAsync();
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
      const value = await previewMutation.mutateAsync(demoInv.id);
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
      const result = await deleteMutation.mutateAsync({id: demoDeletePreview.investigation_id, confirmation: demoDeleteConfirmation});
      setDemoDeletePreview(null);
      setDemoDeleteConfirmation('');
      setDemoStatus(`Deleted ${result.deleted_record_total} record(s) and ${result.document_files_deleted} document file(s).`);
      await refreshDemoState();
    } catch (error) {
      setDemoStatus(errorMessage(error, 'Demo deletion failed'));
    }
  };

  // Asks for the status again (with the token now held, or without it).
  const check = () => queryClient.refetchQueries({queryKey: settingsStatusQueryKey()});

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

  const look = useAppearance();
  const [keysOn, setKeysOn] = useState(true);
  useEffect(() => { setKeysOn(singleKeysOn()); }, []);
  const cases = investigationsQuery.data ?? [];
  const connectors = Object.values(status?.connectors ?? {});
  const theme = look.trying ? lookName(look.trying, look.tryingOwn) : lookName(look.kept.theme, look.kept.custom);
  const inv = useWorkbenchStore(state => state.investigationId) || cases[0]?.id || '';
  const settingRows: SettingRow[] = [
    {group: 'You', id: 'appearance', stored: 'this browser on this device', leaves: 'nothing', label: 'Appearance', value: theme, words: 'theme colour color dark effects motion format fonts',
      note: 'Appearance is yours alone: it is saved on this device and never changes what a teammate sees.'},
    {group: 'You', id: 'notifications', stored: 'the server on this computer; snoozes in this browser', leaves: 'nothing', label: 'Notifications', value: 'in app', words: 'inbox bell snooze'},
    {group: 'You', id: 'keyboard', stored: 'this browser on this device', leaves: 'nothing', label: 'Keyboard', value: keysOn ? 'on' : 'off', words: 'keys shortcuts single-key'},
    {group: 'You', id: 'safety', stored: 'nothing is stored', leaves: 'nothing', label: 'Your safety', value: '', words: 'hide screen cover'},
    {group: 'Cases', id: 'new-case', stored: 'the server on this computer', leaves: 'nothing', label: 'New-case setup', value: '', words: 'start create'},
    {group: 'Cases', id: 'lookups', stored: 'the server on this computer', leaves: 'the name or number you look up, to the service you choose, only when you ask', label: 'Outside lookups', value: 'ask', words: 'connectors aleph opensanctions search outside'},
    {group: 'Cases', id: 'ai', stored: 'the server’s settings file', leaves: 'nothing with a local model; the passages you ask about, if a remote model is set', label: 'AI and research', value: status?.ai?.enabled ? 'ask first' : status ? 'off' : '', words: 'private ai model ollama'},
    {group: 'Cases', id: 'levels', stored: 'the catalogue that ships with the app', leaves: 'nothing', label: 'Red Flag levels', value: '', words: 'faint strong textbook'},
    {group: 'Cases', id: 'demo', stored: 'the server on this computer; hiding is per browser', leaves: 'loading a real case fetches its public pages from their publishers', label: 'Demo case', value: demoInv ? (hideDemo ? 'hidden' : 'shown') : 'none', words: 'sample seed delete 1mdb'},
    {group: 'This computer', id: 'access', stored: 'the token is held in this browser’s memory only', leaves: 'nothing', label: 'Access and token', value: state === 'local' ? 'local' : state === 'authenticated' ? 'token' : state === 'needs_token' ? 'token needed'
      : state === 'remote_disabled' ? 'remote off' : state === 'error' ? 'not reached' : '', words: 'api bearer'},
    {group: 'This computer', id: 'keys', stored: 'the server on this computer, never shown again', leaves: 'a key goes only to its own service, with each request you make', label: 'Connector keys', value: status ? `${connectors.filter(c => c.configured).length} of ${connectors.length}` : '', words: 'credentials secret'},
    {group: 'This computer', id: 'backups', stored: 'the file you save, wherever you put it', leaves: 'nothing', label: 'Backups', value: '', words: 'restore archive'},
    {group: 'This computer', id: 'log', stored: 'the server on this computer', leaves: 'nothing', label: 'Security log', value: status?.security.needs_attention ? 'look' : '', words: 'audit denials'},
    {group: 'This computer', id: 'console', label: 'Operator console', value: '', href: '/console/', words: 'backend'},
  ];
  const [section, go] = useSection(settingRows.filter(r => !r.href).map(r => r.id), 'appearance');
  const row = settingRows.find(r => r.id === section)!;
  const providersQuery = useQuery({...connectorsOptions(), enabled: Boolean(status) && ['lookups', 'keys', 'log'].includes(section)});
  const providers = providersQuery.data?.providers ?? Object.keys(status?.connectors ?? {});
  const card = 'rounded-xl border border-border bg-card p-5';

  const sections: Record<string, ReactElement> = {
    appearance: <AppearancePanel/>,
    notifications: <div className={card}>
      <p className="text-sm">Notifications stay inside the app: the bell counts what needs you, and its inbox lists that first, then everything else from this week. Nothing is sent by email or to your phone.</p>
      <p className="mt-2 text-sm text-muted-foreground">Any row can be snoozed on this computer for a day or a week; it comes back by itself.</p>
      <button type="button" className="ap-btn mt-4" onClick={() => window.dispatchEvent(new Event(OPEN_INBOX_EVENT))}>Open the inbox</button>
    </div>,
    keyboard: <div className={card}>
      <label className="ap-switch"><span><b>Single-key shortcuts</b><small>[ opens the steps, ] the tools, ? the list of keys. They never fire while you type.</small></span>
        <input type="checkbox" role="switch" checked={keysOn} onChange={e => { setSingleKeys(e.target.checked); setKeysOn(e.target.checked); }}/><i aria-hidden="true"/></label>
      <p className="mt-3 text-sm text-muted-foreground">Keys with ⌘ or Ctrl always work: ⌘K search and commands, ⌘O switch case, ⌘⇧H hide the screen.</p>
    </div>,
    safety: <div className={card}>
      <p className="text-sm">Hide screen covers everything at once with a plain page, for when someone walks up. ⌘⇧H from anywhere, or the button on Case home; your place is kept until you ask for it back.</p>
      <button type="button" className="ap-btn mt-4" onClick={() => window.dispatchEvent(new Event(HIDE_SCREEN_EVENT))}>Hide the screen now</button>
    </div>,
    'new-case': <div className={card}>
      <p className="text-sm">A new case starts with its name and the question it answers, what kind of case it is, and what you have so far. The same setup opens from the case switcher (⌘O).</p>
      <button type="button" className="ap-btn p mt-4" onClick={() => window.dispatchEvent(new Event(NEW_CASE_EVENT))}>Start a new case</button>
    </div>,
    lookups: inv ? <div className={card}>
      <p className="mb-3 text-sm text-muted-foreground">Nothing is looked up outside without you: a name goes to an outside source only when you ask here or on a record.</p>
      <ConnectorsPanel investigationId={inv} providers={providers}/>
    </div> : <p className="text-sm text-muted-foreground">Open or start a case to look names up outside.</p>,
    ai: <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold" style={{fontFamily: 'var(--font-heading)'}}>
          Private AI
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{describeAiStatus(status?.ai)}</p>
        {status?.ai?.model && (
          <p className="mt-2 text-sm">
            Model: <code>{status.ai.model}</code>{whereModelRuns(status.ai)}
            {status.ai.remote_endpoint_allowed ? ' · remote endpoints allowed (AI_ALLOW_REMOTE_ENDPOINT is on)' : ''}
          </p>
        )}
        {status?.ai?.authority_suite?.present && (
          <p className="mt-2 text-sm" data-testid="authority-suite">
            Rules the AI works under: the Authority System Suite{status.ai.authority_suite.source ? <> (<code>{status.ai.authority_suite.source.replace(/^.*@/, '')}</code>)</> : null}, TAS v{status.ai.authority_suite.tas_version ?? '?'}.
            Default source floor: tier {status.ai.authority_suite.control_surface?.flags?.source_tier_floor?.default ?? 'D'}; tier C never counts toward corroboration.
          </p>
        )}
        {status?.ai?.authority_suite?.present && <SuiteCoverage/>}
      </div>,
    levels: <div className={card}>
      <p className="text-sm">Every Red Flag has three levels. The rules that set them are written down per indicator, with the numbers they come from.</p>
      <dl className="st-levels">{(['faint', 'strong', 'textbook'] as const).map(l => <div key={l}><dt><LevelChip level={l}/></dt><dd>{LEVEL_WORDS[l].meaning}</dd></div>)}</dl>
      <Link href="/glossary" className="mt-3 inline-block text-sm text-primary hover:underline">Each indicator’s levels in the Glossary</Link>
    </div>,
    demo: <div className="flex flex-col gap-8">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold" style={{fontFamily: 'var(--font-heading)'}}>
          A real case to look around
        </h2>
        <OneMdbLoader/>
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold" style={{fontFamily: 'var(--font-heading)'}}>
          Small real cases for the red flags
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Three closed public cases, each loaded as its own investigation, that show red flags the 1MDB case does not:
          deposits just under $10,000, long chains of shell companies, and one address shared by unlinked companies.
        </p>
        <DemoCasesLoader/>
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
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
    </div>,
    access: <div className="rounded-xl border border-border bg-card p-5">
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
      </div>,
    keys: status ? <SecurityPanel settingsStatus={status} providers={providers} part="keys"/> : <p className="text-sm text-muted-foreground">Checking…</p>,
    backups: inv ? <div className={card}><BackupPanel investigationId={inv} onRestored={async id => {
      useWorkbenchStore.getState().setInvestigationId(id);
      await queryClient.invalidateQueries({queryKey: listInvestigationsQueryKey()});
    }}/></div> : <p className="text-sm text-muted-foreground">Open or start a case to back it up.</p>,
    log: status ? <SecurityPanel settingsStatus={status} providers={providers} part="log"/> : <p className="text-sm text-muted-foreground">Checking…</p>,
  };

  return <div className="st-shell">
    <header className="st-head">
      <h1>{row.label}</h1>
      <SettingsSearch rows={settingRows} onGo={go}/>
    </header>
    <div className="st-body">
      <SettingsNav rows={settingRows} current={section} onGo={go}/>
      <div className="st-section" id={`st-${section}`} tabIndex={-1}>
        <KeptLine row={row}/>
        {sections[section]}
        {section === 'access' && <div className="mt-6"><div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold" style={{fontFamily: 'var(--font-heading)'}}>
          Operator console
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The backend console is loopback-only by design -- no bearer token grants remote access to it. Open it from{' '}
          <code>localhost</code> or <code>127.0.0.1</code> directly.
        </p>
        <a href="/console/" className="mt-3 inline-block text-sm text-primary hover:underline">
          Open console
        </a>
      </div></div>}
      </div>
    </div>
  </div>;
}
