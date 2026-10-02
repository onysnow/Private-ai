'use client';
// Local investigation deletion: preview first, then delete only after the
// reporter types the exact investigation ID. Moved out of app/page.tsx
// (Foundation Fixes fix 3); its calls and reply checks are generated from
// the API schema (fix 2).
import {useMutation} from '@tanstack/react-query';
import {useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {errorMessage} from '../../lib/api-client';
import {investigationDeletionPreview, removeInvestigation} from '../../lib/generated/sdk.gen';
import type {InvestigationDeletionPreview, InvestigationDeletionResult} from '../../lib/generated/types.gen';

type Props = {
  investigationId: string;
  /** Called after a deletion so the page can reload the investigation list. */
  onDeleted: (result: InvestigationDeletionResult) => Promise<void> | void;
};

export function DeletionPanel({investigationId, onDeleted}: Props): ReactElement {
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
      setStatus(value.can_delete ? 'Preview ready. Type the exact investigation ID to enable deletion.' : 'Deletion is blocked by an unsafe document path.');
    } catch (error) {
      setPreview(null);
      setStatus(errorMessage(error, 'Deletion preview failed'));
    }
  };

  const runDelete = async () => {
    if (!preview || confirmation !== preview.requires_confirmation) return;
    setStatus('Deleting investigation and owned local document files…');
    try {
      const result = await deleteMutation.mutateAsync({id: preview.investigation_id, confirmation});
      setPreview(null);
      setConfirmation('');
      setStatus(`Deleted ${result.deleted_record_total} record(s) and ${result.document_files_deleted} owned document file(s); preserved ${result.shared_document_files_preserved} shared file(s).`);
      await onDeleted(result);
    } catch (error) {
      setStatus(errorMessage(error, 'Investigation deletion failed'));
    }
  };

  return <Card className="card">
    <CardHeader className="pb-3">
      <CardTitle>Local investigation deletion</CardTitle>
      <CardDescription>Preview first. Shared document files are preserved; investigation-owned files and database records are removed together with rollback protection.</CardDescription>
    </CardHeader>
    <CardContent>
      <Button onClick={runPreview} disabled={!investigationId}>Preview deletion</Button>
      {preview && <div className="candidate">
        <b>{preview.investigation_name}</b>
        <div>{preview.record_total} record(s) · {preview.document_file_summary.delete} owned file(s) to delete · {preview.document_file_summary.preserve_shared} shared file(s) preserved · {preview.document_file_summary.already_missing} file(s) already missing</div>
        {preview.unsafe_paths.map(x => <div key={x.document_id}><small><b>Blocked:</b> {x.error}</small></div>)}
        {preview.can_delete && <>
          <p><small>To delete, type this exact ID: <code>{preview.requires_confirmation}</code></small></p>
          <Input value={confirmation} onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmation(e.target.value)} placeholder="Exact investigation ID"/>
          <Button onClick={runDelete} disabled={confirmation !== preview.requires_confirmation}>Permanently delete investigation</Button>
        </>}
      </div>}
      {status && <p className="muted">{status}</p>}
    </CardContent>
  </Card>;
}
