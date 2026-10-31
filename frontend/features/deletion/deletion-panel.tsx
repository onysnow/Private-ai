'use client';
// Local investigation deletion: preview first, then delete only after the
// reporter types the case's name exactly (KEEP_2; the server holds the same
// rule, and still takes the ID from a script). Moved out of app/page.tsx
// (Foundation Fixes fix 3); its calls and reply checks are generated from
// the API schema (fix 2).
// Converted 30 Oct (Keep › Delete): a deliberate step in the alarm colour (one of its two allowed places), its three
// steps on a rail; what goes is counted when the screen opens, big, with the records by table revealed; the name is
// typed in the panel beside it, and the button stays shut until it matches.
// Sweep 30 Oct: the steps fill the panel beside what goes (each step holds its own part: the count, the name, the
// button); what goes counts database rows (every row the case owns, in every table), so its tile says so, and the
// tables are listed under the tiles, biggest first.
import {useMutation} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Reveal} from '@/components/ui/reveal';
import {Input} from '@/components/ui/input';
import {errorMessage} from '../../lib/api-client';
import {forgetCase} from '../../lib/case-browser-data';
import {investigationDeletionPreview, removeInvestigation} from '../../lib/generated/sdk.gen';
import type {InvestigationDeletionPreview, InvestigationDeletionResult} from '../../lib/generated/types.gen';

type Props = {
  investigationId: string;
  /** Called after a deletion so the page can reload the investigation list. */
  onDeleted: (result: InvestigationDeletionResult) => Promise<void> | void;
  /** The case's name, for the heading before the count is in. */
  caseName?: string;
  /** Count what goes when the screen opens (Keep › Delete); false on the all-stages page, behind Preview deletion. */
  countOnOpen?: boolean;
};

/** Whether what was typed deletes the case: its name exactly, as the server checks it (spaces at either end aside). */
export const confirmsDeletion = (typed: string, preview: InvestigationDeletionPreview): boolean =>
  typed.trim() !== '' && typed.trim() === preview.requires_confirmation.trim();

/** A table's rows in words: the case's own names for the tables a reporter knows, the rest as their table name. */
const TABLE_WORDS: Record<string, string> = {entities: 'parties', relationship_edges: 'links', statements: 'facts about parties', investigations: 'the case itself',
  relationship_evidence_attachments: 'link evidence', relationship_evidence_review_events: 'link evidence reviews', claim_evidence_links: 'claim evidence'};
export const tableWords = (table: string): string => TABLE_WORDS[table] ?? table.replace(/_/g, ' ');

/** What happened to the investigation's OpenAleph casefile, as a sentence to
 * add to the status line (empty when it had none). */
export function casefileOutcome(casefile: InvestigationDeletionResult['openaleph_collection']): string {
  if (!casefile) return '';
  return casefile.deleted ? ` OpenAleph is deleting casefile “${casefile.label}”.` : ` Casefile “${casefile.label}” is still in OpenAleph: ${casefile.detail ?? 'delete it there.'}`;
}

export function DeletionPanel({investigationId, onDeleted, caseName = '', countOnOpen = true}: Props): ReactElement {
  const [preview, setPreview] = useState<InvestigationDeletionPreview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState('');

  const previewMutation = useMutation({
    mutationFn: async (id: string) => (await investigationDeletionPreview({path: {investigation_id: id}, throwOnError: true})).data,
  });
  const deleteMutation = useMutation({
    mutationFn: async (input: {id: string, confirmation: string}) =>
      (await removeInvestigation({path: {investigation_id: input.id}, query: {confirmation: input.confirmation}, throwOnError: true})).data,
  });

  const runPreview = async () => {
    if (!investigationId) return;
    setStatus('Calculating deletion impact…');
    setConfirmation('');
    try {
      const value = await previewMutation.mutateAsync(investigationId);
      setPreview(value);
      // Ready needs no sentence (the steps say it); a blocked deletion is an alert.
      setStatus(value.can_delete ? '' : 'Deletion is blocked by an unsafe document path.');
    } catch (error) {
      setPreview(null);
      setStatus(errorMessage(error, 'Deletion preview failed'));
    }
  };

  const runDelete = async () => {
    if (!preview || !confirmsDeletion(confirmation, preview)) return;
    setStatus('Deleting investigation and owned local document files…');
    try {
      const result = await deleteMutation.mutateAsync({id: preview.investigation_id, confirmation: confirmation.trim()});
      setPreview(null);
      setConfirmation('');
      forgetCase(preview.investigation_id);
      setStatus(`Deleted ${result.deleted_record_total} record(s) and ${result.document_files_deleted} owned document file(s); preserved ${result.shared_document_files_preserved} shared file(s).${casefileOutcome(result.openaleph_collection)}`);
      await onDeleted(result);
    } catch (error) {
      setStatus(errorMessage(error, 'Investigation deletion failed'));
    }
  };

  // The count of what goes is read-only, so it is made when the screen opens (countOnOpen); the all-stages page, which
  // mounts every panel at once, keeps it behind Preview deletion.
  useEffect(() => { if (countOnOpen && investigationId) void runPreview(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per case, when the screen opens
    [countOnOpen, investigationId]);

  const files = preview?.document_file_summary;
  const step = !preview ? 1 : !confirmsDeletion(confirmation, preview) ? 2 : 3;
  const name = preview?.investigation_name || caseName;
  const tables = preview ? Object.entries(preview.record_counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]) : [];
  const stepClass = (n: number) => `kp-vstep${step > n ? ' done' : step === n ? ' now' : ''}`;
  const stepMark = (n: number) => <span className="kp-step-n" aria-hidden="true">{step > n ? '✓' : n}</span>;

  return <div className="kp kp-del">
    <header className="sd-head">
      <h2 className="sd-title"><Reveal detail="Preview first. Shared document files are preserved; investigation-owned files and database records are removed together with rollback protection.">
        <span>Remove <em className="kp-alarm">{name || 'this case'}</em> from this computer</span></Reveal></h2>
    </header>

    <div className="kp-grid">
      <section className="sd-panel kp-goes" aria-label="What will be removed">
        <p className="sd-eyebrow">What goes</p>
        {!preview ? <div className="kp-act">
          <Button variant="outline" onClick={runPreview} disabled={!investigationId || previewMutation.isPending}>Preview deletion</Button>
        </div> : <>
          <p className="kp-big"><b>{preview.investigation_name}</b></p>
          {/* What is removed, counted big; the rows are every row the case owns in the database, listed by table below. */}
          <p className="st-sr">{preview.record_total} record(s) · {files!.delete} owned file(s) to delete · {files!.preserve_shared} shared file(s) preserved · {files!.already_missing} file(s) already missing</p>
          <dl className="sd-tiles kp-tiles" aria-hidden="true">
            <div className="kp-gone"><dt><Reveal detail="Every row this case owns in the database, in every table: its parties, links, claims and evidence, and the history and connections that join them. Listed by table below."><span>database rows removed</span></Reveal></dt><dd>{preview.record_total.toLocaleString()}</dd></div>
            <div className="kp-gone"><dt>files removed</dt><dd>{files!.delete}</dd></div>
            <div><dt><Reveal detail="Files another case also uses stay where they are."><span>shared files kept</span></Reveal></dt><dd>{files!.preserve_shared}</dd></div>
            <div><dt>already missing</dt><dd>{files!.already_missing}</dd></div>
          </dl>
          {tables.length > 0 && <ul className="kp-tables" aria-label="Rows removed, by table">
            {tables.map(([t, n]) => <li key={t} title={tableWords(t)}><b>{n.toLocaleString()}</b><span>{tableWords(t)}</span></li>)}
          </ul>}
          {preview.openaleph_collection && <p className="kp-also">OpenAleph casefile “{preview.openaleph_collection.label}” is deleted too.</p>}
          {preview.unsafe_paths.map(x => <div key={x.document_id} className="kp-conflict"><small><b>Blocked:</b> {x.error}</small></div>)}
          <p className="kp-keep">Want a copy first? <a href="#backup-restore" className="sd-link">Back up this case</a></p>
        </>}
      </section>

      {/* The three steps fill the panel, each holding its own part; the one to do now is in the alarm colour. */}
      <section className="sd-panel kp-confirm-del" aria-label="Delete this case">
        <p className="sd-eyebrow kp-alarm"><Reveal detail="Cannot be undone. The server asks for the same name, and still takes the ID from a script."><span>Type its name to delete</span></Reveal></p>
        <ol className="kp-vsteps" aria-label="Steps">
          <li className={stepClass(1)} aria-current={step === 1 ? 'step' : undefined}>{stepMark(1)}
            <div className="kp-vstep-body"><b>See what goes</b>
              {preview && <span className="kp-vstep-sum">{preview.record_total.toLocaleString()} rows · {files!.delete} {files!.delete === 1 ? 'file' : 'files'}</span>}</div></li>
          <li className={stepClass(2)} aria-current={step === 2 ? 'step' : undefined}>{stepMark(2)}
            <div className="kp-vstep-body"><b>Type its name</b>
              {preview?.can_delete ? <>
                <p className="kp-name"><code>{preview.requires_confirmation}</code></p>
                <Input className="kp-type" value={confirmation} onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmation(e.target.value)} placeholder="The case’s name"
                  aria-label="Type the case’s name to delete it" autoComplete="off" spellCheck={false}/>
              </> : <p className="sd-quiet">{preview ? 'Deletion is blocked until the unsafe document path is fixed.' : 'The name to type appears once what goes is counted.'}</p>}
            </div></li>
          <li className={stepClass(3)} aria-current={step === 3 ? 'step' : undefined}>{stepMark(3)}
            <div className="kp-vstep-body"><b>Delete</b>
              {preview?.can_delete && <Button variant="destructive" className="kp-delete" onClick={runDelete} disabled={!confirmsDeletion(confirmation, preview)}>Permanently delete investigation</Button>}
            </div></li>
        </ol>
        {status && <p className={preview && !preview.can_delete ? 'kp-conflict' : 'sd-quiet'} role="status">{status}</p>}
      </section>
    </div>
  </div>;
}
