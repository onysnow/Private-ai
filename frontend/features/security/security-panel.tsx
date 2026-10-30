'use client';
// The local security and settings block: what the server is configured
// with, connector credentials (stored locally, never returned), the files
// under document storage no document refers to, and the metadata-only
// security audit log with its retention. Moved out of app/page.tsx
// (Foundation Fixes fix 3); every call and reply check is generated from
// the API schema (fix 2). The settings status itself is loaded by the
// page's access check (features/api-access/use-api-access.ts) and passed
// in; saving or removing a credential marks it stale so it is read again.
// Its parts are exported for the converted screens (30 Oct): ServerStatus (the server's setup as a row of marks, each
// value revealed on its mark), StrayFiles (the unreferenced files, one quiet action) and SecurityLog (the events,
// loaded with the pane in Settings › Security log; the retention preview a small secondary action). Keep › Access is
// features/security/access-screen.tsx.
import {useQueryClient} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import type {ChangeEvent, ReactElement, ReactNode} from 'react';

import {Button} from '@/components/ui/button';
import {Reveal} from '@/components/ui/reveal';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {StatusChip, type ClaimStatus} from '../../components/status';
import {errorMessage} from '../../lib/api-client';
import {bytesInWords} from '../safety/safety-screen';
import {describeRequest, wasRefused} from '../../lib/audit-words';
import {shortStamp} from '../../lib/timestamps';
import {settingsStatusQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {
  deleteConnectorCredential, getOrphanStoragePreview, getSecurityAudit, getSecurityAuditRetentionPreview, getSecurityAuditSummary,
  pruneSecurityAudit, saveConnectorCredential,
} from '../../lib/generated/sdk.gen';
import type {
  OrphanStoragePreviewOut, SecurityAuditRetentionPreviewOut, SecurityAuditSummaryOut, SecurityAuditViewOut, SettingsStatusOut,
} from '../../lib/generated/types.gen';

type Props = {
  settingsStatus: SettingsStatusOut;
  /** The connector names the server reported. */
  providers: string[];
  /** All of it (the all-stages page), or Settings' "Connector keys" or "Security log" alone. */
  part?: 'all' | 'keys' | 'log';
};

// A display label for any connector provider name, so a new connector needs
// no new branch here.
export const providerLabel = (p: string): string => (p.length ? p.charAt(0).toUpperCase() + p.slice(1) : p);

const AUDIT_PAGE = 100;
const RETENTION = {keep_days: 90, max_records: 5000};
const PRUNE_CONFIRMATION = 'PRUNE SECURITY AUDIT';

/** One fact about the server's setup: a mark and a short name; its value is revealed on it. A fact with a state carries
 *  the status grammar's colour (the word on reveal, or always with Settings › Appearance › Status marks). */
export type ServerFact = {key: string; mark: string; name: string; detail: string; state?: ClaimStatus; stateWord?: string};

export function serverFacts(s: SettingsStatusOut): ServerFact[] {
  const ex = s.document_extraction;
  const connectors = Object.entries(s.connectors);
  const configured = connectors.filter(([, c]) => c.configured).length;
  const local = s.access.mode === 'local_only';
  return [
    {key: 'env', mark: '⚙', name: 'Environment', detail: `Environment: ${s.environment}`},
    {key: 'db', mark: '⛁', name: 'Database', detail: `Database: ${s.database}`},
    {key: 'store', mark: '▤', name: 'Document storage', detail: `Document storage: ${s.document_storage_dir}`},
    {key: 'names', mark: '⌕', name: 'Entity extraction', detail: `Entity extraction owner: ${ex.entity_extraction_owner === 'openaleph_ftm_analyze'
      ? `OpenAleph / ftm-analyze (the Workbench's own name-finder only for documents OpenAleph did not analyse${ex.local_entity_suggestions_enabled ? '' : '; switched off'})`
      : `Workbench's own name-finder${ex.local_entity_suggestions_enabled ? '' : ' (switched off)'}`}`,
    state: ex.local_entity_suggestions_enabled || ex.entity_extraction_owner === 'openaleph_ftm_analyze' ? 'supported' : 'unshown',
    stateWord: ex.local_entity_suggestions_enabled || ex.entity_extraction_owner === 'openaleph_ftm_analyze' ? 'On' : 'Switched off'},
    {key: 'origins', mark: '⧉', name: 'Browser origins', detail: `Allowed browser origins: ${s.cors_allowed_origins.join(', ') || 'none'}`},
    {key: 'keys', mark: '⚿', name: `Credentials ${configured}/${connectors.length}`, detail: `Connector credentials: ${connectors.map(([name, c]) => `${providerLabel(name)}: ${c.configured ? 'configured' : 'not configured'} (${c.source || 'unknown source'})`).join(' · ')}`,
      state: connectors.length && configured === connectors.length ? 'supported' : 'unshown', stateWord: `${configured} of ${connectors.length} set`},
    {key: 'restore', mark: '⟲', name: 'Restore API', detail: `Restore API: ${s.restore_api_enabled ? 'enabled' : 'disabled by default'}`,
      state: s.restore_api_enabled ? 'supported' : 'unshown', stateWord: s.restore_api_enabled ? 'Enabled' : 'Off'},
    {key: 'access', mark: local ? '⌂' : '↗', name: local ? 'Local only' : 'Shared access', detail: `API access: ${local ? 'local only' : 'shared bearer for remote clients'} · token configured: ${s.access.token_configured ? 'yes' : 'no'}`,
      state: local || s.access.token_configured ? 'supported' : 'disputed', stateWord: local ? 'Only this computer' : s.access.token_configured ? 'Token set' : 'No token'},
  ];
}

/** The access denials of the last day as a sentence (the alert line, or the reveal on the count). */
export function denialWords(s: SettingsStatusOut): string {
  const sec = s.security;
  const busiest = sec.remote_hosts[0];
  return `Access denials in the last ${sec.window_hours}h: ${sec.total_denials}${sec.by_event.auth_rate_limited ? ` · ${sec.by_event.auth_rate_limited} lockout(s)` : ''}${busiest ? ` · busiest remote host ${busiest.client_host} (${busiest.count})` : ''}`;
}

/** The server's setup as a row of marks, spaced; each value is revealed on its mark. The denials stay written out when
 *  they need attention (an alert); otherwise their count shows, the rest revealed on it. */
export function ServerStatus({settingsStatus, denials = true}: {settingsStatus: SettingsStatusOut; denials?: boolean}): ReactElement {
  const sec = settingsStatus.security;
  return <div className="sec-status">
    <ul className="sec-marks" aria-label="This server's setup">
      {serverFacts(settingsStatus).map(f => <li key={f.key} className="sec-fact">
        <span className="sec-glyph" aria-hidden="true">{f.mark}</span>
        <Reveal detail={f.detail}><small className="sec-chip">{f.name}</small></Reveal>
        {f.state && <StatusChip status={f.state} label={f.stateWord}/>}
      </li>)}
    </ul>
    {denials && <div data-testid="security-alerts" className={`sec-denials${sec.needs_attention ? ' alert' : ''}`}>{sec.needs_attention
      ? <small>⚠ {denialWords(settingsStatus)} — worth a look at the audit log</small>
      : <Reveal detail={denialWords(settingsStatus)}><small><b>{sec.total_denials}</b> denied · {sec.window_hours}h</small></Reveal>}</div>}
  </div>;
}

/** The files under document storage no document points to: one quiet action, the count and size after it, each path and
 *  the policy revealed on them. */
export function StrayFiles({label = 'Preview retained orphan files'}: {label?: string}): ReactElement {
  const [orphanPreview, setOrphanPreview] = useState<OrphanStoragePreviewOut | null>(null);
  const [orphanStatus, setOrphanStatus] = useState('');
  const previewOrphans = async () => {
    setOrphanStatus('Scanning document storage…');
    try {
      const value = (await getOrphanStoragePreview({throwOnError: true})).data;
      setOrphanPreview(value);
      setOrphanStatus(value.orphan_file_count ? `Found ${value.orphan_file_count} unreferenced file(s). They are retained; cleanup is not automatic.` : 'No unreferenced document files found.');
    } catch (error) {
      setOrphanPreview(null);
      setOrphanStatus(errorMessage(error, 'Orphan-file preview failed'));
    }
  };
  return <div className="sec-stray">
    <Reveal tabbable={false} detail="Files in document storage that no document points to. They are kept until you decide; nothing is removed here.">
      <button type="button" className="sd-btn sec-quiet" onClick={() => void previewOrphans()}>{label}</button></Reveal>
    {orphanPreview && <span className="sec-stray-out">
      {/* The count and size show; the policy and each path are revealed on them. */}
      <Reveal detail={<><span className="rv-row">Policy: retain by default</span>{orphanPreview.orphan_files.slice(0, 20).map(x => <span key={x.relative_path} className="rv-row rv-mono">{x.relative_path} — {x.size_bytes} bytes</span>)}
        {orphanPreview.orphan_file_count > 20 && <span className="rv-row">Showing first 20.</span>}</>}>
        <small>{orphanPreview.orphan_file_count} file(s) · {bytesInWords(orphanPreview.orphan_bytes)}</small></Reveal>
      {orphanPreview.unsafe_document_references.length > 0 && <b className="sec-alert">Unsafe database paths detected: {orphanPreview.unsafe_document_references.length}</b>}
    </span>}
    {orphanStatus && <small className="sec-said" role="status">{orphanStatus}</small>}
  </div>;
}

/** The metadata-only security audit: the events (loaded with the pane when `loadOnOpen`, otherwise behind one action),
 *  their counts with the breakdown revealed, refused-only and technical switches, older pages, and the 90-day retention
 *  as a small secondary action that previews before it prunes (typed confirmation). `extra` sits beside it. */
export function SecurityLog({loadOnOpen = false, extra}: {loadOnOpen?: boolean; extra?: ReactNode}): ReactElement {
  const [securityAudit, setSecurityAudit] = useState<SecurityAuditViewOut | null>(null);
  const [securityAuditSummary, setSecurityAuditSummary] = useState<SecurityAuditSummaryOut | null>(null);
  const [securityAuditRetention, setSecurityAuditRetention] = useState<SecurityAuditRetentionPreviewOut | null>(null);
  const [securityAuditStatus, setSecurityAuditStatus] = useState('');
  const [auditPruneConfirmation, setAuditPruneConfirmation] = useState('');
  const [refusedOnly, setRefusedOnly] = useState(false);
  const [technical, setTechnical] = useState(false);

  const loadSecurityAudit = async () => {
    setSecurityAuditStatus('Loading security audit metadata…');
    try {
      const [value, summary] = await Promise.all([
        getSecurityAudit({query: {limit: AUDIT_PAGE, offset: 0}, throwOnError: true}).then(reply => reply.data),
        getSecurityAuditSummary({throwOnError: true}).then(reply => reply.data),
      ]);
      setSecurityAudit(value);
      setSecurityAuditSummary(summary);
      setSecurityAuditStatus(value.malformed_lines
        ? `Loaded ${value.returned} of ${value.total_matched} event(s); ${value.malformed_lines} malformed line(s) retained for review.`
        : `Loaded ${value.returned} of ${value.total_matched} security event(s).`);
    } catch (error) {
      setSecurityAudit(null);
      setSecurityAuditSummary(null);
      setSecurityAuditStatus(errorMessage(error, 'Security-audit load failed'));
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the pane opens
  useEffect(() => { if (loadOnOpen) void loadSecurityAudit(); }, [loadOnOpen]);

  const loadOlderSecurityAudit = async () => {
    if (!securityAudit?.has_more || securityAudit.next_offset === null || securityAudit.next_offset === undefined) return;
    setSecurityAuditStatus('Loading older security events…');
    try {
      const value = (await getSecurityAudit({query: {limit: AUDIT_PAGE, offset: securityAudit.next_offset}, throwOnError: true})).data;
      const records = [...securityAudit.records, ...value.records];
      setSecurityAudit({...value, records, returned: records.length, offset: 0});
      setSecurityAuditStatus(`Loaded ${records.length} of ${value.total_matched} security event(s).`);
    } catch (error) {
      setSecurityAuditStatus(errorMessage(error, 'Older security-audit load failed'));
    }
  };

  const previewAuditRetention = async () => {
    setSecurityAuditStatus('Previewing 90-day / 5,000-record retention…');
    try {
      const value = (await getSecurityAuditRetentionPreview({query: RETENTION, throwOnError: true})).data;
      setSecurityAuditRetention(value);
      setSecurityAuditStatus(value.would_remove ? `Preview: ${value.would_remove} old/excess audit record(s) would be removed; malformed lines are retained.` : 'Preview: no audit records would be removed.');
    } catch (error) {
      setSecurityAuditRetention(null);
      setSecurityAuditStatus(errorMessage(error, 'Audit-retention preview failed'));
    }
  };

  const applyAuditRetention = async () => {
    if (!securityAuditRetention || securityAuditRetention.would_remove < 1) return;
    setSecurityAuditStatus('Applying confirmed audit retention…');
    try {
      const value = (await pruneSecurityAudit({body: {...RETENTION, confirmation: auditPruneConfirmation}, throwOnError: true})).data;
      setSecurityAuditRetention(value);
      setAuditPruneConfirmation('');
      setSecurityAuditStatus(`Removed ${value.removed} audit record(s). Malformed lines were retained.`);
      await loadSecurityAudit();
    } catch (error) {
      setSecurityAuditStatus(errorMessage(error, 'Audit retention failed'));
    }
  };

  const shown = securityAudit ? securityAudit.records.filter(x => !refusedOnly || wasRefused(x.event, x.status_code)) : [];
  return <section className="sec-log" aria-label="Security audit">
    <div className="sec-logbar">
      <p className="sd-eyebrow"><Reveal detail="Local audit entries contain request metadata only—never request bodies, evidence text, connector secrets, or bearer tokens. Retention mutation is restricted to the local machine.">
        <span>Security audit metadata</span></Reveal></p>
      {securityAuditSummary && <span className="sec-sum">
        {/* The counts show; the breakdown by method and status is revealed on them. */}
        <Reveal detail={<><span className="rv-row">Methods: {Object.entries(securityAuditSummary.by_method).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}</span>
          <span className="rv-row">Status: {Object.entries(securityAuditSummary.by_status).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}</span></>}>
          <small>{securityAuditSummary.total_records} valid event(s) · {securityAuditSummary.local_records} local · {securityAuditSummary.remote_records} remote · {securityAuditSummary.malformed_lines} malformed retained</small></Reveal>
      </span>}
      {securityAudit && <span className="sec-toggles">
        <label><input type="checkbox" checked={refusedOnly} onChange={e => setRefusedOnly(e.target.checked)}/> <small>Refused only</small></label>
        <label><input type="checkbox" checked={technical} onChange={e => setTechnical(e.target.checked)}/> <small>Technical</small></label></span>}
      {!loadOnOpen && <button type="button" className="sd-btn sec-quiet" onClick={() => void loadSecurityAudit()}>Load recent security events</button>}
    </div>
    {securityAudit && <ol className="sec-events" tabIndex={0} aria-label="Security events, newest first">
      {shown.map(x => {
        const refused = wasRefused(x.event, x.status_code);
        // The verdict and the request show; when and from where are revealed on the request.
        return <li key={x.request_id}><small><b className={refused ? 'sec-refused' : 'sec-allowed'}>{refused ? '✕' : '✓'}</b>{' '}
          <Reveal detail={`${shortStamp(x.timestamp)} · ${x.local_request ? 'this computer' : `another device${x.client_host ? ` (${x.client_host})` : ''}`} · ${refused ? 'refused' : 'allowed'}`}>
            <span>{describeRequest(x.method, x.path)}</span></Reveal>
          {technical && <code> · {x.method} {x.path} · {x.status_code} · {x.event}</code>}</small></li>;
      })}
      {securityAudit.records.length === 0 && <li className="sec-none"><small>No security events recorded.</small></li>}
    </ol>}
    <div className="sec-foot">
      {securityAudit && <small className="sec-count">Showing {securityAudit.records.length} of {securityAudit.total_matched} matching event(s).</small>}
      {securityAudit?.has_more && <button type="button" className="sd-btn sec-quiet" onClick={() => void loadOlderSecurityAudit()}>Load 100 older events</button>}
      <span className="sec-secondary">
        {extra}
        <Reveal tabbable={false} detail="Shows how many audit records are older than 90 days or beyond the newest 5,000. Nothing is removed until you type the confirmation.">
          <button type="button" className="sd-btn sec-quiet" onClick={() => void previewAuditRetention()}>Preview 90-day retention</button></Reveal>
      </span>
    </div>
    {securityAuditRetention && <div className="sec-retention">
      <small>{securityAuditRetention.total_lines} line(s) · {securityAuditRetention.valid_records} valid · {securityAuditRetention.malformed_lines} malformed retained · {securityAuditRetention.would_remove} would remove</small>
      {securityAuditRetention.would_remove > 0 && <span className="sec-prune">
        <Input value={auditPruneConfirmation} onChange={(e: ChangeEvent<HTMLInputElement>) => setAuditPruneConfirmation(e.target.value)} placeholder="Type PRUNE SECURITY AUDIT"/>
        <Button onClick={applyAuditRetention} disabled={auditPruneConfirmation !== PRUNE_CONFIRMATION}>Prune old audit records</Button>
      </span>}
    </div>}
    {securityAuditStatus && <small className="sec-said" role="status">{securityAuditStatus}</small>}
  </section>;
}

export function SecurityPanel({settingsStatus, providers, part = 'all'}: Props): ReactElement {
  const queryClient = useQueryClient();
  const [credentialProvider, setCredentialProvider] = useState('aleph');
  const [credentialValue, setCredentialValue] = useState('');
  const [credentialStatus, setCredentialStatus] = useState('');

  // The status block reads the settings status from the shared cache; a
  // credential change makes it stale, and the page's access check re-reads it.
  const refreshSettings = () => queryClient.invalidateQueries({queryKey: settingsStatusQueryKey()});

  const saveCredential = async () => {
    if (!credentialValue.trim()) return;
    setCredentialStatus('Saving credential securely…');
    try {
      const result = (await saveConnectorCredential({path: {provider: credentialProvider}, body: {credential: credentialValue}, throwOnError: true})).data;
      setCredentialValue('');
      await refreshSettings();
      setCredentialStatus(`${providerLabel(credentialProvider)} credential saved. Active source: ${result.source || 'configured'}. The secret is not returned by the API.`);
    } catch (error) {
      setCredentialValue('');
      setCredentialStatus(errorMessage(error, 'Credential save failed'));
    }
  };

  const removeCredential = async () => {
    setCredentialStatus('Removing locally stored credential…');
    try {
      const result = (await deleteConnectorCredential({path: {provider: credentialProvider}, throwOnError: true})).data;
      setCredentialValue('');
      await refreshSettings();
      setCredentialStatus(result.configured
        ? `Local credential removed; ${credentialProvider} is still configured from ${result.source || 'fallback'}.`
        : `${credentialProvider} credential removed; connector is now unconfigured.`);
    } catch (error) {
      setCredentialStatus(errorMessage(error, 'Credential removal failed'));
    }
  };

  const keys = <>
    <h4><Reveal detail="Credentials are local-only. The API reports status but never returns the saved secret."><span>Connector credentials</span></Reveal></h4>
    <Select value={credentialProvider} onValueChange={setCredentialProvider}>
      <SelectTrigger className="w-auto"><SelectValue/></SelectTrigger>
      <SelectContent>{providers.map(p => <SelectItem value={p} key={p}>{providerLabel(p)}</SelectItem>)}</SelectContent>
    </Select>
    <Input type="password" autoComplete="off" value={credentialValue} onChange={(e: ChangeEvent<HTMLInputElement>) => setCredentialValue(e.target.value)} placeholder="Paste credential"/>
    <Button onClick={saveCredential} disabled={!credentialValue.trim()}>Save local credential</Button>
    <Button onClick={removeCredential}>Remove local credential</Button>
    {credentialStatus && <div><small>{credentialStatus}</small></div>}
  </>;
  if (part === 'keys') return <div className="st-panel">{keys}</div>;
  // Settings › Security log: the setup as marks, the events loaded with the pane and scrolling inside it, the stray
  // files and the retention preview as small secondary actions at its foot.
  if (part === 'log') return <div className="st-panel sec-pane">
    <ServerStatus settingsStatus={settingsStatus}/>
    <SecurityLog loadOnOpen extra={<StrayFiles label="Stray files"/>}/>
  </div>;
  return <details>
    <summary>Local security/settings status</summary>
    <ServerStatus settingsStatus={settingsStatus}/>
    <hr/>
    {keys}
    <hr/>
    <h4>Unreferenced document files</h4>
    <StrayFiles/>
    <hr/>
    <SecurityLog/>
  </details>;
}
