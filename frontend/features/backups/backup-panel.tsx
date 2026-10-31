'use client';
// Portable investigation backup & restore: one checksum-verified archive out,
// and a preview-first restore in that never merges into an existing case.
// Moved out of app/page.tsx (Foundation Fixes fix 3); the reply checks are
// generated from the API schema (fix 2). The archive goes up as a file and
// comes down as one, so these three calls use the app's own client with the
// generated Zod schema for the reply (see checkedReply in lib/api-generated.ts).
// Converted 30 Oct (Keep › Backup & restore, in the look of Safety & data): sealed or not as a chip, the last backup
// and what a backup holds counted on the left with Download backup; the restore on the right, a target to drop a
// backup on (or press to choose one), then its preview counted before Restore investigation.
// Sweep 30 Oct: what a backup holds is counted by kind (parties, links, claims, evidence, sources, dated events, leads,
// documents: the case's standing, the same counts as Search), each tile sized to its number, and what stays out of it
// is named under them; sealed or not is the status colour, its word and meaning on hover.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ChangeEvent, DragEvent, ReactElement, ReactNode} from 'react';

import {Button} from '@/components/ui/button';
import {Reveal} from '@/components/ui/reveal';
import {Checkbox} from '@/components/ui/checkbox';
import {Input} from '@/components/ui/input';
import {agoText} from '../act/red-flags-board';
import {errorMessage} from '../../lib/api-client';
import {checkedReply} from '../../lib/api-generated';
import {api} from '../../lib/api-instance';
import {useLockStore} from '../../lib/app-lock';
import {getSafetyDataOptions, getStandingOptions, listInvestigationsOptions, listInvestigationsQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import type {BackupPreviewOut, BackupRestoreResultOut, CaseStandingOut} from '../../lib/generated/types.gen';
import {zBackupPreviewOut, zBackupRestoreResultOut} from '../../lib/generated/zod.gen';

type Props = {
  investigationId: string;
  /** Called with the restored investigation's id so the page can list it and open it. */
  onRestored: (investigationId: string) => Promise<void> | void;
  /** Shown under the status line: the page's settings block still lives in this card. */
  children?: ReactNode;
};

/** What the server keeps about a case's last backup (investigations.last_backup). */
export type LastBackup = {at: string; bytes: number; sha256: string; documents_included: boolean; encrypted?: boolean};

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

/** One kind of thing a backup holds: its mark, how many, what they are, and (on hover) where they live. */
export type Hold = {id: string; mark: string; n: number; unit: string; detail?: string};

/** What a backup of the case holds, by kind, from the case's standing; the documents' size and place from Safety & data. */
export function backupHolds(standing: CaseStandingOut | undefined, docs: {count: number; bytes: number; where: string} | null): Hold[] {
  if (!standing) return [];
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const db = 'In the database on this computer';
  const documents = docs?.count ?? standing.documents.total;
  return [
    {id: 'parties', mark: '◉', n: standing.network.parties, unit: plural(standing.network.parties, 'party', 'parties'), detail: db},
    {id: 'links', mark: '⟷', n: standing.network.links, unit: plural(standing.network.links, 'link', 'links'), detail: db},
    {id: 'claims', mark: '❝', n: standing.claims.total, unit: plural(standing.claims.total, 'claim', 'claims'), detail: `${db}, with each claim's evidence links and review decisions`},
    {id: 'evidence', mark: '▣', n: standing.evidence, unit: 'evidence', detail: `${db}, each piece with its exact quote and where it came from`},
    {id: 'sources', mark: '◫', n: standing.sources, unit: plural(standing.sources, 'source', 'sources'), detail: db},
    {id: 'events', mark: '◷', n: standing.timeline.events, unit: plural(standing.timeline.events, 'dated event', 'dated events'), detail: db},
    {id: 'leads', mark: '➚', n: standing.leads.open, unit: plural(standing.leads.open, 'open lead', 'open leads'), detail: `${db}, with their tasks`},
    {id: 'documents', mark: '▤', n: documents, unit: plural(documents, 'document', 'documents'),
      detail: docs ? `${docs.bytes ? `${sizeWords(docs.bytes)} · ` : ''}${docs.where}, with their read text` : undefined},
  ];
}

function archiveForm(file: File, secret: string): FormData {
  const body = new FormData();
  body.append('file', file);
  // An encrypted backup (ADR-0016) opens with the passphrase it was made under, or the recovery words.
  if (secret) body.append('secret', secret);
  return body;
}

export function BackupPanel({investigationId, onRestored, children}: Props): ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BackupPreviewOut | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState('');
  const [made, setMade] = useState('');
  const [secret, setSecret] = useState('');
  const [askSecret, setAskSecret] = useState(false);
  const [over, setOver] = useState(false);
  const sealed = useLockStore(s => Boolean(s.state?.backups_encrypted));
  const queryClient = useQueryClient();
  const investigations = useQuery({...listInvestigationsOptions(), enabled: Boolean(investigationId)});
  const last = lastBackupOf(investigations.data?.find(i => i.id === investigationId)?.last_backup);
  // What a backup holds: the stores Safety & data counts that go into one (the same query, so the same cache).
  const safety = useQuery({...getSafetyDataOptions({path: {investigation_id: investigationId}, query: {period: '7d'}}), enabled: Boolean(investigationId), retry: false});
  // ...counted by kind from the case's standing (the counts Search shows), one tile each.
  const standing = useQuery({...getStandingOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data;

  const download = useMutation({
    mutationFn: (id: string) => api.blob(`/api/investigations/${id}/export?include_documents=true`),
  });
  const inspect = useMutation({
    mutationFn: (archive: File) => api.parsed('/api/backups/preview', checkedReply(zBackupPreviewOut), {method: 'POST', rawBody: archiveForm(archive, secret)}),
  });
  const restore = useMutation({
    mutationFn: (archive: File): Promise<BackupRestoreResultOut> =>
      api.parsed('/api/backups/restore', checkedReply(zBackupRestoreResultOut), {method: 'POST', rawBody: archiveForm(archive, secret)}),
  });

  const downloadBackup = async () => {
    if (!investigationId) return;
    setMade('Preparing backup…');
    try {
      const blob = await download.mutateAsync(investigationId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `investigation-${investigationId}.jwbackup${sealed ? '.encrypted' : ''}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMade('Backup downloaded.');
      await queryClient.invalidateQueries({queryKey: listInvestigationsQueryKey()});
    } catch (error) {
      setMade(errorMessage(error, 'Backup download failed'));
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
      const said = errorMessage(error, 'Backup preview failed');
      if (/passphrase|recovery words/i.test(said)) setAskSecret(true);
      setStatus(said);
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

  const pick = (chosen: File | null) => {
    setFile(chosen);
    setAskSecret(Boolean(chosen?.name.includes('.encrypted')));
    setSecret('');
    setPreview(null);
    setConfirmed(false);
    setStatus('');
  };
  const chooseFile = (e: ChangeEvent<HTMLInputElement>) => pick(e.target.files?.[0] || null);
  const drop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) pick(dropped);
  };

  const stores = safety.data?.stores ?? [];
  const docs = stores.find(s => s.id === 'documents');
  const leftOut = stores.filter(s => s.in_backups === false).map(s => s.name);
  const holds = backupHolds(standing, docs ? {count: docs.count ?? 0, bytes: docs.bytes ?? 0, where: docs.where} : null);
  const records = preview ? Object.values(preview.record_counts).reduce((a, b) => a + b, 0) : 0;
  const lineageOk = Boolean(preview?.lineage_integrity && preview.lineage_integrity.valid === true);

  return <div className="kp" id="backup-restore">
    <header className="sd-head">
      <h2 className="sd-title"><Reveal detail="Export FollowTheMoney JSONL, evidence and claim provenance, leads/tasks, timeline, extracted document text, review decisions, and stored source files in one checksum-verified archive.">
        <span>Keep a copy <em>off this computer</em>, bring one back</span></Reveal></h2>
      {/* Sealed or not (ADR-0016): the status colour; the word, what it means and how to change it are revealed on it. */}
      <Reveal label={sealed ? 'Sealed' : 'Not sealed'} detail={sealed ? <><b>Sealed</b><span className="rv-row">Backups made now are encrypted with your passphrase. They open on any computer with it, or with the 12 recovery words.</span></>
        : <><b>Not sealed</b><span className="rv-row">Backups are not encrypted: anyone who has the file can read it. Lock the app with a passphrase (Settings › Your safety) and backups are sealed from then on.</span></>}>
        <span className={`st kp-seal${sealed ? ' st-supported' : ' kp-unsealed'}`}><span className="st-mark" aria-hidden="true">{sealed ? '🔒' : '▲'}</span><span className="st-word">{sealed ? 'sealed' : 'not sealed'}</span></span></Reveal>
    </header>

    <div className="kp-grid">
      <section className="sd-panel kp-make" aria-label="Make a backup">
        <p className="sd-eyebrow">Make one</p>
        {investigationId ? <p className="backup-last kp-big" aria-live="polite">{last
          ? <><b>Last backup {agoText(last.at)}</b></>
          : <b>No backup of this case yet</b>}</p> : <p className="kp-big"><b>Open a case to back it up</b></p>}
        {last && <p className="kp-facts"><span>{sizeWords(last.bytes)}</span>
          <Reveal detail={`${sizeWords(last.bytes)} · checksum kept${last.encrypted ? ' · encrypted' : ' · not encrypted'}${last.sha256 ? ` · SHA-256 ${last.sha256}` : ''}`}><span>✓ checksum</span></Reveal>
          {last.documents_included ? null : <span className="sd-warn">without the stored files</span>}</p>}
        {holds.length > 0 && <>
          <p className="sd-eyebrow kp-holds-head">What it holds</p>
          {/* Each kind the backup carries, its number big in a tile sized to it; where it lives is revealed on its name. */}
          <ul className="kp-holds" aria-label="What a backup holds">{holds.map(h => <li key={h.id}>
            <span className="sd-mark" aria-hidden="true">{h.mark}</span>
            <span className="kp-n">{h.n.toLocaleString()}</span>
            {h.detail ? <Reveal detail={h.detail}><span className="kp-unit">{h.unit}</span></Reveal> : <span className="kp-unit">{h.unit}</span>}
          </li>)}</ul>
          {leftOut.length > 0 && <p className="kp-out"><Reveal detail="They stay on this computer: a restored case asks for its service keys again, and starts its own log.">
            <span className="sd-eyebrow">Not in it</span></Reveal> {leftOut.join(' · ')}</p>}
        </>}
        <div className="kp-act">
          <Button onClick={downloadBackup} disabled={!investigationId}>Download backup</Button>
          {made && <p className="sd-quiet" role="status">{made}</p>}
        </div>
      </section>

      <section className="sd-panel kp-restore" aria-label="Restore a backup">
        <p className="sd-eyebrow"><Reveal detail="Restore is preview-first and never merges into an existing investigation. The preview checks archive integrity, every restored record ID, provenance lineage, and destination document paths before mutation.">
          <span>Restore safely</span></Reveal></p>
        {/* Drop a backup on the target, or press it to choose one. The file input stays in the page for the keyboard. */}
        <label className={`kp-drop${over ? ' over' : ''}${file ? ' has' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)} onDrop={drop}>
          <input type="file" className="kp-file" accept=".zip,.jwbackup.zip,application/zip" onChange={chooseFile} aria-label="Choose a backup file"/>
          <span className="kp-drop-mark" aria-hidden="true">⟲</span>
          {file ? <span className="kp-drop-word"><b>{file.name}</b><small>{sizeWords(file.size)} · press to choose another</small></span>
            : <span className="kp-drop-word"><b>Drop a backup here</b><small>or press to choose one</small></span>}
        </label>
        {askSecret && <Input type="password" autoComplete="off" value={secret} onChange={e => setSecret(e.target.value)}
          aria-label="Passphrase or recovery words" placeholder="This backup is encrypted: its passphrase, or the 12 recovery words"/>}
        {!preview && <div className="kp-act"><Button variant="outline" onClick={previewBackup} disabled={!file || (askSecret && !secret)}>Preview restore</Button></div>}
        {preview && <div className="kp-preview">
          <p className="kp-big"><b>{preview.investigation.name}</b></p>
          {/* The counts big; lineage and the restore API as ✓ / ✕ marks, their words revealed on them. */}
          <dl className="sd-tiles kp-tiles" aria-label={`${records} records · ${preview.document_file_count} stored document file(s) · ${preview.missing_document_count} missing raw file(s)`}>
            <div><dt>records</dt><dd>{records.toLocaleString()}</dd></div>
            <div><dt>stored files</dt><dd>{preview.document_file_count}</dd></div>
            <div className={preview.missing_document_count ? 'kp-miss' : ''}><dt>missing files</dt><dd>{preview.missing_document_count}</dd></div>
          </dl>
          <div className="kp-checks"><Reveal detail={`Lineage: ${lineageOk ? 'valid' : 'not declared/invalid'} · Restore API: ${preview.restore_api_enabled ? 'enabled' : 'disabled'}`}>
            <span>{lineageOk ? '✓' : '✕'} lineage · {preview.restore_api_enabled ? '✓' : '✕'} restore</span></Reveal></div>
          {preview.warnings.map((w, i) => <div key={i} className="kp-warn"><small>Warning: {w}</small></div>)}
          {preview.conflicts.map((c, i) => <div key={i} className="kp-conflict"><small><b>Conflict:</b> {c.table} / {c.id} — {c.message}</small></div>)}
          {preview.can_restore && <label className="kp-confirm"><Checkbox checked={confirmed} onCheckedChange={(checked: boolean | 'indeterminate') => setConfirmed(checked === true)}/> I understand this creates a separate investigation and will not merge with existing records.</label>}
          <div className="kp-act"><Button onClick={restoreBackup} disabled={!preview.can_restore || !preview.restore_api_enabled || !confirmed}>Restore investigation</Button></div>
        </div>}
        {status && <p className="sd-quiet" role="status">{status}</p>}
      </section>
    </div>
    {children}
  </div>;
}
