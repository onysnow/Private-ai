'use client';
// "Similar documents" (ADR-0006, Wave A): documents of the investigation
// whose text OpenAleph finds alike (its more_like_this), from
// GET /api/documents/{id}/similar, each opening its own document.
import {useQuery} from '@tanstack/react-query';
import type {ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {errorMessage} from '../../lib/api-client';
import {getSimilarDocumentsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';

export function SimilarDocuments({documentId}: {documentId: string}): ReactElement {
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const query = useQuery(getSimilarDocumentsOptions({path: {document_id: documentId}}));
  const found = query.data;
  return <div className="candidate" aria-label="Similar documents">
    <h4>Similar documents</h4>
    {query.isError && <p className="muted">{errorMessage(query.error, 'Could not load similar documents')}</p>}
    {query.isPending && <p className="muted">Asking OpenAleph…</p>}
    {found && found.state !== 'ok' && <p className="muted">{found.detail}.</p>}
    {found && found.state === 'ok' && found.results.length === 0 && <p className="muted">OpenAleph found no similar document.</p>}
    {found?.results.map(row => {
      const target = row.document_id;
      return <div key={row.openaleph_entity_id}>
        <b>{row.filename || row.title}</b> <small>{row.page_number ? `page ${row.page_number}` : row.schema}</small>
        {target
          ? <Button size="sm" onClick={() => openDocument(target, row.page_number)}>Open document</Button>
          : <small> · in OpenAleph, not uploaded to this investigation</small>}
      </div>;
    })}
  </div>;
}
