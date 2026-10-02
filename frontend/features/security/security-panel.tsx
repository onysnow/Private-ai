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
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {errorMessage} from '../../lib/api-client';
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
};

// A display label for any connector provider name, so a new connector needs
// no new branch here.
export const providerLabel = (p: string): string => (p.length ? p.charAt(0).toUpperCase() + p.slice(1) : p);

const AUDIT_PAGE = 100;
const RETENTION = {keep_days: 90, max_records: 5000};
const PRUNE_CONFIRMATION = 'PRUNE SECURITY AUDIT';

export function SecurityPanel({settingsStatus, providers}: Props): ReactElement {
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

  return <details>
    <summary>Local security/settings status</summary>
    <div><small>Environment: {settingsStatus.environment}</small></div>
    <div><small>Database: {settingsStatus.database}</small></div>
    <div><small>Document storage: {settingsStatus.document_storage_dir}</small></div>
    <div><small>Entity extraction owner: {settingsStatus.document_extraction.entity_extraction_owner === 'openaleph_ftm_analyze'
      ? `OpenAleph / ftm-analyze (the Workbench's own name-finder only for documents OpenAleph did not analyse${settingsStatus.document_extraction.local_entity_suggestions_enabled ? '' : '; switched off'})`
      : `Workbench's own name-finder${settingsStatus.document_extraction.local_entity_suggestions_enabled ? '' : ' (switched off)'}`}</small></div>
    <div><small>Allowed browser origins: {settingsStatus.cors_allowed_origins.join(', ') || 'none'}</small></div>
    <div><small>Connector credentials: {Object.entries(settingsStatus.connectors).map(([name, status]) => `${providerLabel(name)}: ${status.configured ? 'configured' : 'not configured'} (${status.source || 'unknown source'})`).join(' · ')}</small></div>
    <div><small>Restore API: {settingsStatus.restore_api_enabled ? 'enabled' : 'disabled by default'}</small></div>
    <div><small>API access: {settingsStatus.access.mode === 'local_only' ? 'local only' : 'shared bearer for remote clients'} · token configured: {settingsStatus.access.token_configured ? 'yes' : 'no'}</small></div>
    <div data-testid="security-alerts"><small>{security.needs_attention ? '⚠ ' : ''}Access denials in the last {security.window_hours}h: {security.total_denials}{security.by_event.auth_rate_limited ? ` · ${security.by_event.auth_rate_limited} lockout(s)` : ''}{busiest ? ` · busiest remote host ${busiest.client_host} (${busiest.count})` : ''}{security.needs_attention ? ' — worth a look at the audit log' : ''}</small></div>
    <hr/>
    <h4>Connector credentials</h4>
    <p className="muted">Credentials are local-only. The API reports status but never returns the saved secret.</p>
    <Select value={credentialProvider} onValueChange={setCredentialProvider}>
      <SelectTrigger className="w-auto"><SelectValue/></SelectTrigger>
      <SelectContent>{providers.map(p => <SelectItem value={p} key={p}>{providerLabel(p)}</SelectItem>)}</SelectContent>
    </Select>
    <Input type="password" autoComplete="off" value={credentialValue} onChange={(e: ChangeEvent<HTMLInputElement>) => setCredentialValue(e.target.value)} placeholder="Paste credential"/>
    <Button onClick={saveCredential} disabled={!credentialValue.trim()}>Save local credential</Button>
    <Button onClick={removeCredential}>Remove local credential</Button>
    {credentialStatus && <div><small>{credentialStatus}</small></div>}
    <hr/>
    <h4>Unreferenced document files</h4>
    <Button onClick={previewOrphans}>Preview retained orphan files</Button>
    {orphanPreview && <div>
      <small>{orphanPreview.orphan_file_count} file(s) · {orphanPreview.orphan_bytes} bytes · policy: retain by default</small>
      {orphanPreview.orphan_files.slice(0, 20).map(x => <div key={x.relative_path}><small>{x.relative_path} — {x.size_bytes} bytes</small></div>)}
      {orphanPreview.orphan_file_count > 20 && <small>Showing first 20.</small>}
      {orphanPreview.unsafe_document_references.length > 0 && <div><b>Unsafe database paths detected: {orphanPreview.unsafe_document_references.length}</b></div>}
    </div>}
    {orphanStatus && <div><small>{orphanStatus}</small></div>}
    <hr/>
    <h4>Security audit metadata</h4>
    <p className="muted">Local audit entries contain request metadata only—never request bodies, evidence text, connector secrets, or bearer tokens. Retention mutation is restricted to the local machine.</p>
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
      <small>{securityAuditSummary.total_records} valid event(s) · {securityAuditSummary.local_records} local · {securityAuditSummary.remote_records} remote · {securityAuditSummary.malformed_lines} malformed retained</small>
      <div><small>Methods: {Object.entries(securityAuditSummary.by_method).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}</small></div>
      <div><small>Status: {Object.entries(securityAuditSummary.by_status).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}</small></div>
    </div>}
    {securityAudit && <div>
      {securityAudit.records.map(x => <div key={x.request_id}><small>{x.timestamp} · {x.method} {x.path} · {x.status_code} · {x.event} · {x.local_request ? 'local' : 'remote'}</small></div>)}
      {securityAudit.has_more && <Button onClick={loadOlderSecurityAudit}>Load 100 older events</Button>}
      <div><small>Showing {securityAudit.records.length} of {securityAudit.total_matched} matching event(s).</small></div>
    </div>}
    {securityAuditStatus && <div><small>{securityAuditStatus}</small></div>}
  </details>;
}
