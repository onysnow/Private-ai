'use client';
// "Documents in the corpus": the same search run against OpenAleph's index of
// the investigation's documents (ADR-0006, Wave A), shown as its own group
// beside the Workbench's records. Each hit shows OpenAleph's highlighted
// snippets and opens its document (at the page that matched) in the
// documents panel. The snippets arrive as plain pieces of text with the
// matches marked, so nothing from OpenAleph is rendered as markup.
import {useQuery} from '@tanstack/react-query';
import type {ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {errorMessage} from '../../lib/api-client';
import {searchInvestigationCorpusOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {HighlightSegmentOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';

type Props = {investigationId: string; q: string};

export function Snippet({pieces}: {pieces: HighlightSegmentOut[]}): ReactElement {
  return <div className="muted">{pieces.map((piece, index) => piece.match
    ? <mark key={index}>{piece.text}</mark>
    : <span key={index}>{piece.text}</span>)}</div>;
}

export function CorpusResults({investigationId, q}: Props): ReactElement | null {
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const search = useQuery({
    ...searchInvestigationCorpusOptions({path: {investigation_id: investigationId}, query: {q}}),
    enabled: Boolean(investigationId && q),
  });
  if (!investigationId || !q) return null;
  const found = search.data;
  return <div aria-label="Documents in the corpus">
    <h4>Documents in the corpus</h4>
    {search.isError && <p className="muted">{errorMessage(search.error, 'Corpus search failed')}</p>}
    {search.isPending && <p className="muted">Searching OpenAleph…</p>}
    {found && found.state !== 'ok' && <p className="muted">{found.detail}.</p>}
    {found && found.state === 'ok' && found.results.length === 0 && <p className="muted">No document in OpenAleph matches.</p>}
    {found?.results.map(hit => {
      const documentId = hit.document_id;
      return <div className="candidate" key={hit.openaleph_entity_id}>
        <b>{hit.filename || hit.title}</b> <small>{hit.page_number ? `page ${hit.page_number} · ` : ''}{hit.schema}</small>
        {hit.highlights.map((pieces, index) => <Snippet key={index} pieces={pieces}/>)}
        {documentId
          ? <Button onClick={() => openDocument(documentId, hit.page_number)}>Open document</Button>
          : <small>In OpenAleph, not uploaded to this investigation.</small>}
      </div>;
    })}
  </div>;
}
