'use client';
// "Which entity does this belong to?" for an email address or phone number
// OpenAleph found in a document (ADR-0006). OpenAleph finds the value but
// not its owner, so accepting it needs the reporter's choice; the value then
// becomes a reviewed statement on that entity, pointing at the place in the
// document. The document's own entities come first: those already accepted
// from it, then its entity proposals still waiting (accept one first to
// attach the value to it), then every other entity in the investigation.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {errorMessage} from '../../lib/api-client';
import {getIdentifierTargetsOptions, getIdentifierTargetsQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {reviewExtractionCandidate} from '../../lib/generated/sdk.gen';
import type {ExtractionReviewOut, IdentifierTargetProposalOut} from '../../lib/generated/types.gen';

type Props = {
  candidateId: string;
  /** 'email' or 'phone' (the proposal's payload.kind). */
  kind: string;
  /** The reviewer note sent with the decision. */
  note: string;
  /** After this proposal was accepted or rejected. */
  onReviewed: (decision: 'accept' | 'reject', reply: ExtractionReviewOut) => void;
  /** After one of the document's entity proposals was accepted from here. */
  onEntityAccepted?: (entityCandidateId: string, reply: ExtractionReviewOut) => void;
};

export function IdentifierOwner({candidateId, kind, note, onReviewed, onEntityAccepted}: Props): ReactElement {
  const queryClient = useQueryClient();
  const path = {candidate_id: candidateId};
  const targets = useQuery(getIdentifierTargetsOptions({path}));
  const [owner, setOwner] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const label = kind === 'phone' ? 'phone number' : 'email address';
  const data = targets.data;
  const others = data?.other_entities ?? [];
  const nothingToChoose = Boolean(data) && !data?.document_entities.length && !data?.document_proposals.length && !others.length;

  // Accepting a waiting entity proposal is the reporter's own acceptance of
  // that proposal, made from here; it then appears among this document's
  // entities and is chosen as the owner.
  const acceptFirst = async (proposal: IdentifierTargetProposalOut) => {
    setBusy(true);
    setStatus('');
    try {
      const reply = (await reviewExtractionCandidate({path: {candidate_id: proposal.candidate_id}, body: {
        decision: 'accept', note, caption: proposal.caption, entity_schema: proposal.suggested_schema,
      }, throwOnError: true})).data;
      onEntityAccepted?.(proposal.candidate_id, reply);
      await queryClient.invalidateQueries({queryKey: getIdentifierTargetsQueryKey({path})});
      const entityId = typeof reply.record?.id === 'string' ? reply.record.id : '';
      setOwner(entityId);
      setStatus(`“${proposal.caption}” accepted; it is chosen as the owner.`);
    } catch (error) {
      setStatus(`Review “${proposal.caption}” in its own proposal first: ${errorMessage(error, 'it could not be accepted here')}`);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: 'accept' | 'reject') => {
    setBusy(true);
    setStatus('');
    try {
      const body = decision === 'accept' ? {decision, note, target_entity_id: owner} : {decision, note};
      onReviewed(decision, (await reviewExtractionCandidate({path, body, throwOnError: true})).data);
    } catch (error) {
      setStatus(errorMessage(error, 'Review failed'));
    } finally {
      setBusy(false);
    }
  };

  return <div className="rounded border border-accent/40 bg-accent/10 p-2 text-sm space-y-1" data-testid={`owner-${candidateId}`}>
    <b>Which entity does this {label} belong to?</b>
    {targets.isPending && <p className="muted">Loading the entities it could belong to…</p>}
    {targets.isError && <p className="muted">{errorMessage(targets.error, 'Could not load the entities it could belong to')}</p>}
    {data && data.document_entities.length > 0 && <div>
      <small>From this document:</small>
      <div className="flex flex-wrap gap-2 mt-1">
        {data.document_entities.map(entity => <Button key={entity.entity_id} size="sm" variant={owner === entity.entity_id ? 'default' : 'outline'}
          onClick={() => setOwner(entity.entity_id)}>{entity.caption} · {entity.schema}</Button>)}
      </div>
    </div>}
    {data && data.document_proposals.length > 0 && <div>
      <small>Proposed in this document, not accepted yet:</small>
      {data.document_proposals.map(proposal => <div key={proposal.candidate_id} className="flex flex-wrap items-center gap-2 mt-1">
        <span>{proposal.caption} · {proposal.suggested_schema}</span>
        {proposal.schema_question
          ? <small className="muted">say what kind of entity it is in its own proposal first</small>
          : <Button size="sm" variant="outline" disabled={busy} onClick={() => acceptFirst(proposal)}>Accept “{proposal.caption}” first</Button>}
      </div>)}
    </div>}
    {others.length > 0 && <div>
      <small>Another entity in this investigation:</small>
      <Select value={others.some(entity => entity.entity_id === owner) ? owner : ''} onValueChange={setOwner}>
        <SelectTrigger className="w-auto"><SelectValue placeholder="Choose an entity…"/></SelectTrigger>
        <SelectContent>{others.map(entity => <SelectItem key={entity.entity_id} value={entity.entity_id}>{entity.caption} · {entity.schema}</SelectItem>)}</SelectContent>
      </Select>
    </div>}
    {nothingToChoose && <p className="muted">No person, company or organisation can hold it yet: accept one from this document, or add one, first.</p>}
    <div className="flex gap-2 mt-1">
      <Button size="sm" onClick={() => decide('accept')} disabled={!owner || busy}>Accept</Button>
      <Button size="sm" variant="outline" onClick={() => decide('reject')} disabled={busy}>Reject</Button>
    </div>
    {status && <p className="muted">{status}</p>}
  </div>;
}
