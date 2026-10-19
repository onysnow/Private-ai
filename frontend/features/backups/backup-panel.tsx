'use client';
// Portable investigation backup & restore: one checksum-verified archive out,
// and a preview-first restore in that never merges into an existing case.
// Moved out of app/page.tsx (Foundation Fixes fix 3); the reply checks are
// generated from the API schema (fix 2). The archive goes up as a file and
// comes down as one, so these three calls use the app's own client with the
// generated Zod schema for the reply (see checkedReply in lib/api-generated.ts).
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ChangeEvent, ReactElement, ReactNode} from 'react';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Checkbox} from '@/components/ui/checkbox';
import {Input} from '@/components/ui/input';
import {agoText} from '../act/red-flags-board';
import {errorMessage} from '../../lib/api-client';
import {checkedReply} from '../../lib/api-generated';
import {api} from '../../lib/api-instance';
import {listInvestigationsOptions, listInvestigationsQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import type {BackupPreviewOut, BackupRestoreResultOut} from '../../lib/generated/types.gen';
import {zBackupPreviewOut, zBackupRestoreResultOut} from '../../lib/generated/zod.gen';

type Props = {
  investigationId: string;
  /** Called with the restored investigation's id so the page can list it and open it. */
  onRestored: (investigationId: string) => Promise<void> | void;
  /** Shown under the status line: the page's settings block still lives in this card. */
  children?: ReactNode;
};

/** What the server keeps about a case's last backup (investigations.last_backup). */
export type LastBackup = {at: string; bytes: number; sha256: string; documents_included: boolean};

export function lastBackupOf(value: unknown): LastBackup | null {
  const v = value as Partial<LastBackup> | null | undefined;
  return v && typeof v.at === 'string' && typeof v.bytes === 'number' ? v as LastBackup : null;
}

/** "1.4 GB", "820 KB": the archive's size in the units a person reads. */
export function sizeWords(bytes: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes, i = 0;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i += 1; }
  return `${i ? (n < 10 ? n.toFixed(1) : Math.round(n)) : n} ${units[i]}`;
}

function archiveForm(file: File): FormData {
  const body = new FormData();
  body.append('file', file);
  return body;
}

export function BackupPanel({investigationId, onRestored, children}: Props): ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BackupPreviewOut | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState('');
  const queryClient = useQueryClient();
  const investigations = useQuery({...listInvestigationsOptions(), enabled: Boolean(investigationId)});
  const last = lastBackupOf(investigations.data?.find(i => i.id === investigationId)?.last_backup);

  const download = useMutation({
    mutationFn: (id: string) => api.blob(`/api/investigations/${id}/export?include_documents=true`),
  });
  const inspect = useMutation({
    mutationFn: (archive: File) => api.parsed('/api/backups/preview', checkedReply(zBackupPreviewOut), {method: 'POST', rawBody: archiveForm(archive)}),
  });
  const restore = useMutation({
    mutationFn: (archive: File): Promise<BackupRestoreResultOut> =>
      api.parsed('/api/backups/restore', checkedReply(zBackupRestoreResultOut), {method: 'POST', rawBody: archiveForm(archive)}),
  });

  const downloadBackup = async () => {
    if (!investigationId) return;
    setStatus('Preparing backup…');
    try {
      const blob = await download.mutateAsync(investigationId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `investigation-${investigationId}.jwbackup.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus('Backup downloaded.');
      await queryClient.invalidateQueries({queryKey: listInvestigationsQueryKey()});
    } catch (error) {
      setStatus(errorMessage(error, 'Backup download failed'));
    }
  };

  const previewBackup = async () => {
    if (!file) return;
    setStatus('Inspecting backup…');
    setPreview(null);
    setConfirmed(false);
    try {
      const value = await inspect.mutateAsync(file);
      setPreview(value);
      setStatus(value.can_restore ? 'Preview passed. Review the details before restoring.' : `Restore blocked by ${value.conflicts.length} conflict(s).`);
    } catch (error) {
      setStatus(errorMessage(error, 'Backup preview failed'));
    }
  };

  const restoreBackup = async () => {
    if (!file || !preview?.can_restore || !confirmed) return;
    setStatus('Restoring backup…');
    try {
      const result = await restore.mutateAsync(file);
      setStatus(`Restored investigation ${result.investigation_id}.`);
      setConfirmed(false);
      await onRestored(result.investigation_id);
    } catch (error) {
      setStatus(errorMessage(error, 'Backup restore failed'));
    }
  };

  const chooseFile = (e: ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
    setPreview(null);
    setConfirmed(false);
    setStatus('');
  };

  return <Card className="card" id="backup-restore">
    <CardHeader className="pb-3">
      <CardTitle>Portable investigation backup & restore</CardTitle>
      <CardDescription>Export FollowTheMoney JSONL, evidence and claim provenance, leads/tasks, timeline, extracted document text, review decisions, and stored source files in one checksum-verified archive.</CardDescription>
    </CardHeader>
    <CardContent>
      {investigationId && <p className="backup-last" aria-live="polite">{last
        ? <><b>Last backup {agoText(last.at)}</b> · {sizeWords(last.bytes)} · ✓ checksum{last.documents_included ? '' : ' · without the stored files'}</>
        : <b>No backup of this case yet</b>}</p>}
      <Button onClick={downloadBackup} disabled={!investigationId}>Download backup</Button>
      <hr/>
      <h4>Restore safely</h4>
      <p className="muted">Restore is preview-first and never merges into an existing investigation. The preview checks archive integrity, every restored record ID, provenance lineage, and destination document paths before mutation.</p>
      <Input type="file" accept=".zip,.jwbackup.zip,application/zip" onChange={chooseFile}/>
      <Button onClick={previewBackup} disabled={!file}>Preview restore</Button>
      {preview && <div className="candidate">
        <b>{preview.investigation.name}</b>
        <div>{Object.values(preview.record_counts).reduce((a, b) => a + b, 0)} records · {preview.document_file_count} stored document file(s) · {preview.missing_document_count} missing raw file(s)</div>
        <div>Lineage: {preview.lineage_integrity && preview.lineage_integrity.valid === true ? 'valid' : 'not declared/invalid'} · Restore API: {preview.restore_api_enabled ? 'enabled' : 'disabled'}</div>
        {preview.warnings.map((w, i) => <div key={i}><small>Warning: {w}</small></div>)}
        {preview.conflicts.map((c, i) => <div key={i}><small><b>Conflict:</b> {c.table} / {c.id} — {c.message}</small></div>)}
        {preview.can_restore && <label><Checkbox checked={confirmed} onCheckedChange={(checked: boolean | 'indeterminate') => setConfirmed(checked === true)}/> I understand this creates a separate investigation and will not merge with existing records.</label>}
        <div><Button onClick={restoreBackup} disabled={!preview.can_restore || !preview.restore_api_enabled || !confirmed}>Restore investigation</Button></div>
      </div>}
      {status && <p className="muted">{status}</p>}
      {children}
    </CardContent>
  </Card>;
}
