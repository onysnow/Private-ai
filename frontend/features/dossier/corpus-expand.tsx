'use client';
// "Expand in the corpus" on a dossier (ADR-0006, Wave B): asks OpenAleph
// what surrounds the entity -- under its own copy in the investigation's
// collection and under every OpenAleph entity a reporter decided is the same
// -- and proposes the relationships and the entities at their far ends as
// OpenAleph findings. They wait in the review queue like any connector's
// findings; nothing becomes a record here.
import {useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {errorMessage} from '../../lib/api-client';
import {expandEntityInCorpus} from '../../lib/generated/sdk.gen';
import type {CorpusExpandOut} from '../../lib/generated/types.gen';
import {invalidateInvestigationData} from '../../lib/investigation-queries';

type Props = {entityId: string};

export function CorpusExpand({entityId}: Props): ReactElement {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<CorpusExpandOut | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const expand = async () => {
    setBusy(true);
    setProblem('');
    try {
      const reply = (await expandEntityInCorpus({path: {entity_id: entityId}, throwOnError: true})).data;
      setResult(reply);
      // New findings and leads belong to the case: its lists are read again.
      await invalidateInvestigationData(queryClient);
    } catch (error) {
      setResult(null);
      setProblem(errorMessage(error, 'Could not expand this entity in OpenAleph'));
    } finally {
      setBusy(false);
    }
  };

  return <div>
    <b>OpenAleph corpus</b>
    <div className="actions">
      <Button onClick={() => void expand()} disabled={busy}>{busy ? 'Expanding…' : 'Expand in the corpus'}</Button>
    </div>
    {problem && <p className="muted">{problem}</p>}
    {result && <>
      <p className="muted">{result.relationships} relationship(s) and {result.neighbours} linked entit{result.neighbours === 1 ? 'y' : 'ies'} proposed for review
        {result.skipped_own > 0 ? ` (${result.skipped_own} already in this investigation)` : ''}; review them in the review queue.</p>
      {result.findings.map(f => <div key={f.id}>
        <small>{f.kind === 'relationship' ? 'Relationship' : 'Entity'}: {f.caption} · {f.schema ?? 'unknown type'}{f.collection_label ? ` · ${f.collection_label}` : ''} · {f.review_status}</small>
        {f.source_url && <small> · <a href={f.source_url} target="_blank" rel="noreferrer">Open in OpenAleph</a></small>}
      </div>)}
    </>}
  </div>;
}
