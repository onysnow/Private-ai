'use client';
// The Keep cards (mockup KEEP-safety-and-data, bottom; research Keep §7 "equal size, one action each", §8–§12):
// Backup, Who can reach it, Housekeeping (stray files), Delete this case. Each opens a panel from the right.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import {caseHref} from '../../lib/case-href';
import {getOrphanStoragePreviewOptions, getOrphanStoragePreviewQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {addBackStrayFile, deleteStrayFiles, investigationDeletionPreview, keepStrayFiles, removeInvestigation} from '../../lib/generated/sdk.gen';
import type {InvestigationDeletionPreview, InvestigationDeletionResult, OrphanFileOut, SafetySummaryOut, SettingsStatusOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {BackupPanel} from '../backups/backup-panel';
import {PassphraseFields, usePassphraseChoice} from '../backups/passphrase';
import {SecurityPanel} from '../security/security-panel';
import {ago, bytes, count, parseTime, plural} from './format';
import {Sheet} from './sheet';

type Props = {
  summary: SafetySummaryOut;
  status: SettingsStatusOut | undefined;
  /** Ask the server again after something changed (a backup made, a case restored). */
  onChanged: () => void;
};

type Open = 'backup' | 'restore' | 'access' | 'housekeeping' | 'delete' | null;

// Plain words for the record kinds deletion lists (the rest are counted together).
const KINDS: Record<string, [string, string]> = {
  entities: ['person or company', 'people and companies'], claims: ['claim', 'claims'], documents: ['document', 'documents'],
  sources: ['source', 'sources'], evidence: ['quote', 'quotes'], leads: ['lead', 'leads'], timeline_events: ['dated event', 'dated events'],
  notes: ['note', 'notes'], relationship_edges: ['link', 'links'],
};

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function BackupCard({summary, onBackUp, onRestore}: {summary: SafetySummaryOut; onBackUp: () => void; onRestore: () => void}): ReactElement {
  const b = summary.stores.backups;
  return <section className="sd-card" aria-labelledby="sd-card-backup">
    <p className="sd-eyebrow" id="sd-card-backup">Backup</p>
    <h3>{b.last_at ? `Last backup ${ago(b.last_at)}` : 'No backup yet'}</h3>
    {b.last_at && b.last_size_bytes != null && <p className="sd-fig">{bytes(b.last_size_bytes)} · <span aria-hidden="true">✓</span> checksum · {b.encrypted
      ? <span className="bk-protected"><span aria-hidden="true">✓</span> passphrase</span>
      : <span className="bk-protected"><span aria-hidden="true">○</span> no passphrase</span>}</p>}
    <p className="sd-small">Records, documents and history in one file. Restore makes a separate case; never merges.</p>
    <div className="sd-actions">
      <button type="button" id="sd-backup-now" className="sd-btn sd-btn-primary" onClick={onBackUp}>Back up now</button>
      <button type="button" className="sd-btn" onClick={onRestore}>Restore…</button>
    </div>
  </section>;
}

/** Back up now (research Keep §8): what goes in, with counts, "Protect with a passphrase" (on by default), then save. */
function BackupSheet({summary, onChanged, onClose}: {summary: SafetySummaryOut; onChanged: () => void; onClose: () => void}): ReactElement {
  const s = summary.stores;
  const [choice, controls] = usePassphraseChoice();
  const [status, setStatus] = useState('');
  const make = useMutation({
    mutationFn: (passphrase: string | null) =>
      api.blob(`/api/investigations/${encodeURIComponent(summary.investigation_id)}/safety/backup`, {method: 'POST', body: {passphrase}}),
  });
  const backUp = async () => {
    if (!choice.ready) return;
    setStatus('Collecting records and copying files…');
    try {
      const blob = await make.mutateAsync(choice.value);
      // The file is named by the case's id, not its name: a file name should not say what the case is about.
      downloadBlob(blob, `investigation-${summary.investigation_id}.jwbackup.zip`);
      setStatus(choice.protect ? 'Backup saved, protected with your passphrase. Checked against its checksum.'
        : 'Backup saved without a passphrase. Checked against its checksum.');
      controls.reset();
      onChanged();
    } catch (error) {
      setStatus(errorMessage(error, 'The backup could not be made'));
    }
  };
  return <Sheet title="Back up now" onClose={onClose}>
    <dl className="sd-rows">
      <div><dt>Case records</dt><dd>{plural(s.records.total, 'record')} · {plural(s.records.claims, 'claim')}</dd></div>
      <div><dt>Documents & pictures</dt><dd>{plural(s.documents.files, 'file')} · {bytes(s.documents.size_bytes)}</dd></div>
      <div><dt>Saved as</dt><dd className="sd-mono">investigation-{summary.investigation_id}.jwbackup.zip</dd></div>
    </dl>
    <PassphraseFields choice={choice} controls={controls}/>
    {status && <p className="sd-small" role="status">{status}</p>}
    <div className="sd-actions">
      <button type="button" className="sd-btn sd-btn-primary" onClick={backUp} disabled={!choice.ready || make.isPending}>
        {make.isPending ? 'Backing up…' : choice.protect ? 'Back up' : 'Back up without a passphrase'}</button>
    </div>
  </Sheet>;
}

function accessWords(summary: SafetySummaryOut): {who: string; line: string} {
  const a = summary.access;
  if (!a.remote_api_enabled) return {who: 'Only this computer', line: 'No other device can reach it: no access key is set.'};
  return {who: 'This computer and devices with the access key', line: 'No token needed here; other devices need one.'};
}

function AccessSheet({summary, status, onClose}: {summary: SafetySummaryOut; status: SettingsStatusOut | undefined; onClose: () => void}): ReactElement {
  const a = summary.access;
  return <Sheet title="Who can reach it" onClose={onClose}>
    <dl className="sd-rows">
      <div><dt>Other devices</dt><dd>{a.remote_api_enabled ? <>need an access key <span className="sd-chip">set</span></> : <>cannot reach it <span className="sd-chip">no key set</span></>}</dd></div>
      <div><dt>Restore from a file</dt><dd>{a.restore_api_enabled ? <span className="sd-chip">allowed</span> : <span className="sd-chip">switched off on the server</span>}</dd></div>
      <div><dt>Remote access attempts</dt><dd>{a.refused_24h == null ? 'shown only on this computer' : <>{count(a.refused_24h)} refused in 24 h{a.needs_attention && <span className="sd-chip sd-chip-warn">worth a look</span>}</>}</dd></div>
    </dl>
    {status ? <details className="sd-details"><summary>Technical details and the security log</summary>
      <SecurityPanel settingsStatus={status} providers={Object.keys(status.connectors)} part="log"/>
    </details> : <p className="sd-small">Technical details are shown only on this computer.</p>}
  </Sheet>;
}

function HousekeepingCard({onOpen}: {onOpen: () => void}): ReactElement {
  const orphans = useQuery({...getOrphanStoragePreviewOptions(), retry: false});
  const o = orphans.data;
  return <section className="sd-card" aria-labelledby="sd-card-house">
    <p className="sd-eyebrow" id="sd-card-house">Housekeeping</p>
    <h3>{o ? plural(o.orphan_file_count, 'stray file') : orphans.isError ? 'Stray files' : 'Checking…'}</h3>
    {o && <p className="sd-fig">{bytes(o.orphan_bytes)}</p>}
    <p className="sd-small">{orphans.isError ? 'Shown only on this computer.' : 'Files no document points to. Kept until you decide.'}</p>
    <div className="sd-actions"><button type="button" className="sd-btn" onClick={onOpen} disabled={!o}>Look at them</button></div>
  </section>;
}

type Ask = {kind: 'delete'; file: OrphanFileOut} | null;

/** Stray files, one action each (research Keep §12): Keep, Add back to the case (opens The Drop with it), Delete
 * (named with its size, then confirmed). The server checks every path again before it acts. */
function HousekeepingSheet({investigationId, onClose}: {investigationId: string; onClose: () => void}): ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const orphans = useQuery({...getOrphanStoragePreviewOptions(), retry: false});
  const o = orphans.data;
  const [ask, setAsk] = useState<Ask>(null);
  const [status, setStatus] = useState('');
  const refresh = () => queryClient.invalidateQueries({queryKey: getOrphanStoragePreviewQueryKey()});
  const act = useMutation({
    mutationFn: async ({kind, file}: {kind: 'keep' | 'delete' | 'add'; file: OrphanFileOut}) => {
      if (kind === 'keep') return (await keepStrayFiles({body: {paths: [file.relative_path]}, throwOnError: true})).data;
      if (kind === 'delete') return (await deleteStrayFiles({body: {paths: [file.relative_path]}, throwOnError: true})).data;
      return (await addBackStrayFile({path: {investigation_id: investigationId}, body: {path: file.relative_path}, throwOnError: true})).data;
    },
  });
  const run = async (kind: 'keep' | 'delete' | 'add', file: OrphanFileOut) => {
    setStatus('');
    try {
      await act.mutateAsync({kind, file});
      setAsk(null);
      await refresh();
      if (kind === 'add') {
        onClose();
        router.push(caseHref('/bring-in#the-drop', investigationId));
        return;
      }
      setStatus(kind === 'keep' ? `${file.relative_path} is kept and will not be offered again.` : `${file.relative_path} was deleted (${bytes(file.size_bytes)}).`);
    } catch (error) {
      setStatus(errorMessage(error, kind === 'keep' ? 'The file could not be kept' : kind === 'delete' ? 'The file could not be deleted' : 'The file could not be added back'));
    }
  };
  return <Sheet title="Stray files" onClose={onClose}>
    {!o ? <p className="sd-small">{orphans.isError ? errorMessage(orphans.error, 'Could not list the stray files') : 'Checking…'}</p> : <>
      <p className="sd-small">{plural(o.orphan_file_count, 'file')} · {bytes(o.orphan_bytes)}. No document points to them. They are kept until you decide; the app removes nothing on its own.
        {o.kept_file_count > 0 && ` ${plural(o.kept_file_count, 'file')} you kept ${o.kept_file_count === 1 ? 'is' : 'are'} not listed.`}</p>
      {o.orphan_files.length > 0 && <ul className="sd-files sd-files-act">{o.orphan_files.map(f => <li key={f.relative_path}>
        <span className="sd-mono">{f.relative_path}</span><span>{bytes(f.size_bytes)}</span>
        <span>{new Date(f.modified_at * 1000).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'})}</span>
        {ask?.file.relative_path === f.relative_path ? <span className="sd-actions" role="group" aria-label={`Delete ${f.relative_path}?`}>
          <span className="sd-warn">Delete {f.relative_path} ({bytes(f.size_bytes)})? Cannot be undone.</span>
          <button type="button" className="sd-btn sd-btn-danger ready" onClick={() => run('delete', f)} disabled={act.isPending} data-autofocus>Delete</button>
          <button type="button" className="sd-btn" onClick={() => setAsk(null)}>Cancel</button>
        </span> : <span className="sd-actions">
          <button type="button" className="sd-btn" onClick={() => run('keep', f)} disabled={act.isPending} aria-label={`Keep ${f.relative_path}`}>Keep</button>
          <button type="button" className="sd-btn" onClick={() => run('add', f)} disabled={act.isPending} aria-label={`Add ${f.relative_path} back to the case`}>Add back to the case</button>
          <button type="button" className="sd-btn sd-btn-danger" onClick={() => setAsk({kind: 'delete', file: f})} disabled={act.isPending} aria-label={`Delete ${f.relative_path}…`}>Delete…</button>
        </span>}
      </li>)}</ul>}
      {status && <p className="sd-small" role="status">{status}</p>}
      {o.unsafe_document_references.length > 0 && <p className="sd-warn">{o.unsafe_document_references.length === 1 ? 'One document’s file is' : `${o.unsafe_document_references.length} documents’ files are`} outside the storage folder; the app will not touch {o.unsafe_document_references.length === 1 ? 'it' : 'them'}.</p>}
    </>}
  </Sheet>;
}

function DeleteSheet({summary, onClose, onBackUpFirst}: {summary: SafetySummaryOut; onClose: () => void; onBackUpFirst: () => void}): ReactElement {
  const router = useRouter();
  const preview = useQuery({queryKey: ['safety-deletion-preview', summary.investigation_id],
    queryFn: async () => (await investigationDeletionPreview({path: {investigation_id: summary.investigation_id}, throwOnError: true})).data, retry: false});
  const [name, setName] = useState('');
  const [go, setGo] = useState(false);
  const [done, setDone] = useState<InvestigationDeletionResult | null>(null);
  const remove = useMutation({
    mutationFn: async (p: InvestigationDeletionPreview) =>
      (await removeInvestigation({path: {investigation_id: p.investigation_id}, query: {confirmation: p.requires_confirmation}, throwOnError: true})).data,
  });
  const p = preview.data;
  const caseName = p?.investigation_name ?? summary.investigation_name;
  const matches = name.trim() === caseName;
  const last = summary.stores.backups.last_at;
  const days = last ? Math.floor((Date.now() - parseTime(last).getTime()) / 86_400_000) : null;
  const del = async () => {
    if (!p || !matches) return;
    try {
      const result = await remove.mutateAsync(p);
      setDone(result);
    } catch { /* the error is shown below */ }
  };
  const leave = () => {
    const store = useWorkbenchStore.getState();
    store.setInvestigationId('');
    store.setInvestigationName('');
    router.push('/');
  };
  if (done) return <Sheet title="Deleted" onClose={leave}>
    <p role="status" className="sd-done">{caseName} was deleted: {plural(done.deleted_record_total, 'record')}, {plural(done.document_files_deleted, 'file')}. {plural(done.shared_document_files_preserved, 'shared file')} kept.
      {done.openaleph_collection && (done.openaleph_collection.deleted ? ' OpenAleph is deleting its casefile.' : ` Its casefile is still in OpenAleph: ${done.openaleph_collection.detail ?? 'delete it there.'}`)}</p>
    <div className="sd-actions"><button type="button" className="sd-btn" onClick={leave} data-autofocus>Go to the home page</button></div>
  </Sheet>;
  const kinds = p ? Object.entries(p.record_counts).filter(([k]) => KINDS[k]).sort((a, b) => b[1] - a[1]) : [];
  const other = p ? p.record_total - kinds.reduce((n, [, v]) => n + v, 0) : 0;
  return <Sheet title="Delete this case" onClose={onClose}>
    {!p ? <p className="sd-small">{preview.isError ? errorMessage(preview.error, 'Could not see what deleting would remove') : 'Working out what goes…'}</p> : <>
      {(days === null || days >= 3) && !go && <div className="sd-backfirst" role="group" aria-label="Back up first?">
        <p>{days === null ? 'No backup of this case yet' : `No backup in ${days} days`}</p>
        <div className="sd-actions"><button type="button" className="sd-btn" onClick={onBackUpFirst}>Back up first</button>
          <button type="button" className="sd-btn" onClick={() => setGo(true)}>Continue</button></div>
      </div>}
      <div className="sd-cols">
        <section><h3>Goes</h3><ul>
          {kinds.map(([k, v]) => <li key={k}>{count(v)} {v === 1 ? KINDS[k][0] : KINDS[k][1]}</li>)}
          {other > 0 && <li>{plural(other, 'other record')}</li>}
          <li>{plural(p.document_file_summary.delete, 'file')} from storage</li>
        </ul></section>
        <section><h3>Stays</h3><ul>
          <li>{plural(p.document_file_summary.preserve_shared, 'shared file')} another case uses</li>
          <li>Backups you saved elsewhere</li>
          {p.document_file_summary.already_missing > 0 && <li>{plural(p.document_file_summary.already_missing, 'file')} already missing</li>}
        </ul></section>
        <section><h3>Elsewhere</h3><ul>
          {p.openaleph_collection ? <li>The OpenAleph casefile “{p.openaleph_collection.label}”: the app asks OpenAleph to delete it</li> : <li>Nothing: this case has no OpenAleph casefile</li>}
        </ul></section>
      </div>
      {!p.can_delete ? <p className="sd-warn">{p.unsafe_paths.length === 1 ? 'One document’s file is' : `${p.unsafe_paths.length} documents’ files are`} outside the storage folder, so the app will not delete anything.</p> : <>
        <label className="sd-field"><span>Type the case name, <b>{caseName}</b>, to delete it</span>
          <input value={name} onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)} autoComplete="off" spellCheck={false} data-autofocus
            aria-describedby="sd-delete-note"/></label>
        <p className="sd-small" id="sd-delete-note">Cannot be undone.</p>
        <div className="sd-actions">
          <button type="button" className={`sd-btn sd-btn-danger${matches ? ' ready' : ''}`} onClick={del} disabled={!matches || remove.isPending}
            aria-label={`Delete ${caseName} from this computer`}>{remove.isPending ? 'Deleting…' : `Delete ${caseName}`}</button>
        </div>
        {remove.isError && <p className="sd-warn" role="alert">{errorMessage(remove.error, 'The case could not be deleted')}</p>}
      </>}
    </>}
  </Sheet>;
}

export function KeepCards({summary, status, onChanged}: Props): ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const words = accessWords(summary);
  const d = summary.delete;
  return <div className="sd-cards">
    <BackupCard summary={summary} onBackUp={() => setOpen('backup')} onRestore={() => setOpen('restore')}/>
    <section className="sd-card" aria-labelledby="sd-card-access">
      <p className="sd-eyebrow" id="sd-card-access">Who can reach it</p>
      <h3>{words.who}</h3>
      <p className="sd-fig">{summary.access.refused_24h == null ? 'refusals: on this computer' : `${count(summary.access.refused_24h)} refused · 24 h`}</p>
      <p className="sd-small">{words.line}</p>
      <div className="sd-actions"><button type="button" className="sd-btn" onClick={() => setOpen('access')}>Access settings</button></div>
    </section>
    <HousekeepingCard onOpen={() => setOpen('housekeeping')}/>
    <section className="sd-card sd-card-danger" aria-labelledby="sd-card-delete">
      <p className="sd-eyebrow" id="sd-card-delete">Delete this case</p>
      <h3>Remove from this computer</h3>
      <p className="sd-small">See what goes first: {plural(d.record_total, 'record')}, {plural(d.files_to_delete, 'file')}. Shared files stay. Cannot be undone.</p>
      <div className="sd-actions"><button type="button" className="sd-btn sd-btn-danger" onClick={() => setOpen('delete')}>Preview deletion</button></div>
    </section>

    {open === 'restore' && <Sheet title="Restore a backup" onClose={close}>
      <BackupPanel investigationId={summary.investigation_id} onRestored={id => { onChanged(); router.push(`/?inv=${encodeURIComponent(id)}`); }}/>
    </Sheet>}
    {open === 'access' && <AccessSheet summary={summary} status={status} onClose={close}/>}
    {open === 'housekeeping' && <HousekeepingSheet investigationId={summary.investigation_id} onClose={close}/>}
    {open === 'backup' && <BackupSheet summary={summary} onChanged={onChanged} onClose={close}/>}
    {open === 'delete' && <DeleteSheet summary={summary} onClose={close}
      onBackUpFirst={() => setOpen('backup')}/>}
  </div>;
}
