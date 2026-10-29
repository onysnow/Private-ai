'use client';
// The local security and settings block: what the server is configured
// with, connector credentials (stored locally, never returned), the files
// under document storage no document refers to, and the metadata-only
// security audit log with its retention. Moved out of app/page.tsx
// (Foundation Fixes fix 3); every call and reply check is generated from
// the API schema (fix 2). The settings status itself is loaded by the
// page's access check (features/api-access/use-api-access.ts) and passed
// in; saving or removing a credential marks it stale so it is read again.
import {useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Reveal} from '@/components/ui/reveal';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
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
  /** All of it (the workbench), or Settings' "Connector keys" or "Security log" alone. */
  part?: 'all' | 'keys' | 'log';
};

// A display label for any connector provider name, so a new connector needs
// no new branch here.
export const providerLabel = (p: string): string => (p.length ? p.charAt(0).toUpperCase() + p.slice(1) : p);

const AUDIT_PAGE = 100;
const RETENTION = {keep_days: 90, max_records: 5000};
const PRUNE_CONFIRMATION = 'PRUNE SECURITY AUDIT';

export function SecurityPanel({settingsStatus, providers, part = 'all'}: Props): ReactElement {
  const queryClient = useQueryClient();
  const [credentialProvider, setCredentialProvider] = useState('aleph');
  const [credentialValue, setCredentialValue] = useState('');
  const [credentialStatus, setCredentialStatus] = useState('');
  const [orphanPreview, setOrphanPreview] = useState<OrphanStoragePreviewOut | null>(null);
  const [orphanStatus, setOrphanStatus] = useState('');
  const [securityAudit, setSecurityAudit] = useState<SecurityAuditViewOut | null>(null);
  const [securityAuditSummary, setSecurityAuditSummary] = useState<SecurityAuditSummaryOut | null>(null);
  const [securityAuditRetention, setSecurityAuditRetention] = useState<SecurityAuditRetentionPreviewOut | null>(null);
  const [securityAuditStatus, setSecurityAuditStatus] = useState('');
  const [auditPruneConfirmation, setAuditPruneConfirmation] = useState('');
  const [refusedOnly, setRefusedOnly] = useState(false);
  const [technical, setTechnical] = useState(false);

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

  const security = settingsStatus.security;
  const busiest = security.remote_hosts[0];

  // The server's status as one row of names; each value (paths, origins, sources) is revealed on its name. The
  // access-denial line stays written out when it needs attention (an alert); otherwise its count shows.
  const configured = Object.values(settingsStatus.connectors).filter(c => c.configured).length;
  const statusItems: [string, string][] = [
    ['Environment', `Environment: ${settingsStatus.environment}`],
    ['Database', `Database: ${settingsStatus.database}`],
    ['Document storage', `Document storage: ${settingsStatus.document_storage_dir}`],
    ['Entity extraction', `Entity extraction owner: ${settingsStatus.document_extraction.entity_extraction_owner === 'openaleph_ftm_analyze'
      ? `OpenAleph / ftm-analyze (the Workbench's own name-finder only for documents OpenAleph did not analyse${settingsStatus.document_extraction.local_entity_suggestions_enabled ? '' : '; switched off'})`
      : `Workbench's own name-finder${settingsStatus.document_extraction.local_entity_suggestions_enabled ? '' : ' (switched off)'}`}`],
    ['Browser origins', `Allowed browser origins: ${settingsStatus.cors_allowed_origins.join(', ') || 'none'}`],
    [`Credentials ${configured}/${Object.keys(settingsStatus.connectors).length}`, `Connector credentials: ${Object.entries(settingsStatus.connectors).map(([name, status]) => `${providerLabel(name)}: ${status.configured ? 'configured' : 'not configured'} (${status.source || 'unknown source'})`).join(' · ')}`],
    [`${settingsStatus.restore_api_enabled ? '✓' : '✕'} Restore API`, `Restore API: ${settingsStatus.restore_api_enabled ? 'enabled' : 'disabled by default'}`],
    [settingsStatus.access.mode === 'local_only' ? '⌂ Local only' : '↗ Shared access', `API access: ${settingsStatus.access.mode === 'local_only' ? 'local only' : 'shared bearer for remote clients'} · token configured: ${settingsStatus.access.token_configured ? 'yes' : 'no'}`],
  ];
  const denials = `Access denials in the last ${security.window_hours}h: ${security.total_denials}${security.by_event.auth_rate_limited ? ` · ${security.by_event.auth_rate_limited} lockout(s)` : ''}${busiest ? ` · busiest remote host ${busiest.client_host} (${busiest.count})` : ''}`;
  const statusLines = <>
    <div className="sec-status">{statusItems.map(([name, value]) => <Reveal key={name} detail={value}><small className="sec-chip">{name}</small></Reveal>)}</div>
    <div data-testid="security-alerts">{security.needs_attention ? <small>⚠ {denials} — worth a look at the audit log</small>
      : <Reveal detail={denials}><small>{security.total_denials} denied · {security.window_hours}h</small></Reveal>}</div>
  </>;
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
  const log = <>
    <hr/>
    <h4>Unreferenced document files</h4>
    <Button onClick={previewOrphans}>Preview retained orphan files</Button>
    {orphanPreview && <div>
      {/* The count and size show; the policy and each path are revealed on them. */}
      <Reveal detail={<><span className="rv-row">Policy: retain by default</span>{orphanPreview.orphan_files.slice(0, 20).map(x => <span key={x.relative_path} className="rv-row rv-mono">{x.relative_path} — {x.size_bytes} bytes</span>)}
        {orphanPreview.orphan_file_count > 20 && <span className="rv-row">Showing first 20.</span>}</>}>
        <small>{orphanPreview.orphan_file_count} file(s) · {bytesInWords(orphanPreview.orphan_bytes)}</small></Reveal>
      {orphanPreview.unsafe_document_references.length > 0 && <div><b>Unsafe database paths detected: {orphanPreview.unsafe_document_references.length}</b></div>}
    </div>}
    {orphanStatus && <div><small>{orphanStatus}</small></div>}
    <hr/>
    <h4><Reveal detail="Local audit entries contain request metadata only—never request bodies, evidence text, connector secrets, or bearer tokens. Retention mutation is restricted to the local machine.">
      <span>Security audit metadata</span></Reveal></h4>
    <Button onClick={loadSecurityAudit}>Load recent security events</Button>
    <Button onClick={previewAuditRetention}>Preview 90-day retention</Button>
    {securityAuditRetention && <div>
      <small>{securityAuditRetention.total_lines} line(s) · {securityAuditRetention.valid_records} valid · {securityAuditRetention.malformed_lines} malformed retained · {securityAuditRetention.would_remove} would remove</small>
      {securityAuditRetention.would_remove > 0 && <div>
        <Input value={auditPruneConfirmation} onChange={(e: ChangeEvent<HTMLInputElement>) => setAuditPruneConfirmation(e.target.value)} placeholder="Type PRUNE SECURITY AUDIT"/>
        <Button onClick={applyAuditRetention} disabled={auditPruneConfirmation !== PRUNE_CONFIRMATION}>Prune old audit records</Button>
      </div>}
    </div>}
    {securityAuditSummary && <div>
      {/* The counts show; the breakdown by method and status is revealed on them. */}
      <Reveal detail={<><span className="rv-row">Methods: {Object.entries(securityAuditSummary.by_method).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}</span>
        <span className="rv-row">Status: {Object.entries(securityAuditSummary.by_status).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}</span></>}>
        <small>{securityAuditSummary.total_records} valid event(s) · {securityAuditSummary.local_records} local · {securityAuditSummary.remote_records} remote · {securityAuditSummary.malformed_lines} malformed retained</small></Reveal>
    </div>}
    {securityAudit && <div>
      <div><label><input type="checkbox" checked={refusedOnly} onChange={e => setRefusedOnly(e.target.checked)}/> <small>Refused only</small></label>{' '}
        <label><input type="checkbox" checked={technical} onChange={e => setTechnical(e.target.checked)}/> <small>Technical</small></label></div>
      {securityAudit.records.filter(x => !refusedOnly || wasRefused(x.event, x.status_code)).map(x => {
        const refused = wasRefused(x.event, x.status_code);
        // The verdict and the request show; when and from where are revealed on the request.
        return <div key={x.request_id}><small><b className={refused ? 'sec-refused' : undefined}>{refused ? '✕' : '✓'}</b>{' '}
          <Reveal detail={`${shortStamp(x.timestamp)} · ${x.local_request ? 'this computer' : `another device${x.client_host ? ` (${x.client_host})` : ''}`} · ${refused ? 'refused' : 'allowed'}`}>
            <span>{describeRequest(x.method, x.path)}</span></Reveal>
          {technical && <code> · {x.method} {x.path} · {x.status_code} · {x.event}</code>}</small></div>;
      })}
      {securityAudit.has_more && <Button onClick={loadOlderSecurityAudit}>Load 100 older events</Button>}
      <div><small>Showing {securityAudit.records.length} of {securityAudit.total_matched} matching event(s).</small></div>
    </div>}
    {securityAuditStatus && <div><small>{securityAuditStatus}</small></div>}
  </>;
  if (part === 'keys') return <div className="st-panel">{keys}</div>;
  if (part === 'log') return <div className="st-panel">{statusLines}{log}</div>;
  return <details>
    <summary>Local security/settings status</summary>
    {statusLines}
    <hr/>
    {keys}
    {log}
  </details>;
}
