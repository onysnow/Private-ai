'use client';
// Is this name already a record? Asked beside each name awaiting review,
// before it is accepted.
//
// Two lookups, read when the name is shown:
// - the investigation's own records whose names are alike
//   (GET /api/extraction-candidates/{id}/entity-matches; backend
//   app/services/resolution.py): each has a ``basis`` -- the same name
//   (FollowTheMoney's name comparison 0.9 or more, which reads "Ltd" and
//   "Limited" as one and ignores word order and titles), a similar name, or
//   words in common -- and the first same name is the strong match;
// - what OpenAleph holds that looks like it, across every collection the
//   reader may see (GET .../openaleph-matches, POST /api/2/match, ADR-0006).
//   A match in this investigation's own collection names the record it was
//   pushed from, so it can be chosen too; the rest are shown for the
//   reporter to follow up, never chosen automatically.
//
// The reporter says "same as" a record, or "a new record". When the server
// sees a strong match, accepting waits for that answer (documents.py
// review_candidate refuses otherwise); a new record then also records that
// it is not that match ("different"), which reaches OpenAleph as a judgement
// when OpenAleph raised the pair.
import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {getExtractionEntityMatchesOptions, getExtractionOpenalephMatchesOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {EntityCandidateOut, OpenAlephMatchOut} from '../../lib/generated/types.gen';

/** A record that only shares words with the name is offered when it shares at least half of them. */
export const LISTED_SCORE = 0.5;

const WHY: Record<string, string> = {same_name: 'the same name', similar_name: 'a similar name', shared_words: 'shares most of its words'};

export type IdentityChoice = {kind: 'new'} | {kind: 'same', entityId: string};

/** The review body's identity fields for a choice, given the strong match the server sees. */
export function identityFields(choice: IdentityChoice | undefined, strongMatchId: string | null):
  {entity_identity_decision?: 'same' | 'different' | 'create_new', matched_entity_id?: string} {
  if (choice?.kind === 'same') return {entity_identity_decision: 'same', matched_entity_id: choice.entityId};
  if (strongMatchId) return {entity_identity_decision: 'different', matched_entity_id: strongMatchId};
  return {};
}

type Option = {entityId: string, caption: string, schema: string, why: string};

/** The records the reporter can say the name is: the investigation's own
 * close matches, then records OpenAleph matched in this investigation's
 * collection that the name comparison did not find. */
export function sameAsOptions(local: EntityCandidateOut[], remote: OpenAlephMatchOut[], strongMatchId: string | null): Option[] {
  const options: Option[] = local
    .filter(row => row.basis === 'same_name' || row.basis === 'similar_name' || row.score >= LISTED_SCORE || row.entity_id === strongMatchId)
    .map(row => ({entityId: row.entity_id, caption: row.caption, schema: row.schema, why: WHY[row.basis ?? 'shared_words']}));
  for (const row of remote) {
    if (!row.workbench_entity_id) continue;
    const listed = options.find(option => option.entityId === row.workbench_entity_id);
    if (listed) listed.why = `${listed.why}; OpenAleph also matched it`;
    else options.push({entityId: row.workbench_entity_id, caption: row.caption, schema: row.schema, why: 'OpenAleph matched it'});
  }
  return options;
}

type Props = {
  candidateId: string;
  caption: string;
  /** Accepting also waits for the kind of entity (SchemaQuestion). */
  schemaBlocked: boolean;
  onAccept: (fields: ReturnType<typeof identityFields>) => void;
  onReject: () => void;
};

export function EntityIdentity({candidateId, caption, schemaBlocked, onAccept, onReject}: Props): ReactElement {
  const path = {candidate_id: candidateId};
  const local = useQuery({...getExtractionEntityMatchesOptions({path})});
  const remote = useQuery({...getExtractionOpenalephMatchesOptions({path})});
  const [choice, setChoice] = useState<IdentityChoice | undefined>(undefined);

  const strong = local.data?.strong_match ?? null;
  const options = sameAsOptions(local.data?.matches ?? [], remote.data?.results ?? [], strong?.entity_id ?? null);
  const elsewhere = (remote.data?.results ?? []).filter(row => !row.workbench_entity_id);
  // Until the investigation's own records are read, the server may still
  // find a strong match, so accepting waits for them too.
  const waiting = local.isPending;
  const required = Boolean(strong) && !choice;
  const chosen = (option: IdentityChoice) => choice?.kind === option.kind && (option.kind === 'new' || (choice?.kind === 'same' && choice.entityId === option.entityId));

  return <div className="mt-1 text-sm" data-testid={`identity-${candidateId}`}>
    {local.isError && <p className="muted">Could not check this investigation&apos;s records for &quot;{caption}&quot;.</p>}
    {options.length > 0 && <div role="group" aria-label={`Is "${caption}" already a record?`}>
      <b>Already a record here?</b>{required && <> The name closely matches &quot;{strong?.caption}&quot;: say whether it is the same.</>}
      <div className="flex flex-wrap gap-2 mt-1">
        {options.map(option => <Button key={option.entityId} size="sm" variant={chosen({kind: 'same', entityId: option.entityId}) ? 'default' : 'outline'}
          aria-pressed={chosen({kind: 'same', entityId: option.entityId})} title={option.why}
          onClick={() => setChoice({kind: 'same', entityId: option.entityId})}>
          Same as &quot;{option.caption}&quot; ({option.schema})
        </Button>)}
        <Button size="sm" variant={chosen({kind: 'new'}) ? 'default' : 'outline'} aria-pressed={chosen({kind: 'new'})} onClick={() => setChoice({kind: 'new'})}>
          {strong ? `A new record, not "${strong.caption}"` : 'A new record'}
        </Button>
      </div>
    </div>}

    {remote.isPending && <p className="muted">Asking OpenAleph for similar entities…</p>}
    {remote.data?.state === 'unavailable' && <p className="muted">{remote.data.detail}</p>}
    {(elsewhere.length > 0 || (remote.data?.hidden ?? 0) > 0) && <div className="mt-1">
      <b>Also in OpenAleph</b>
      <ul className="list-disc pl-5" aria-label="Also in OpenAleph">
        {elsewhere.map(row => <li key={row.openaleph_id}>
          <a href={row.url} target="_blank" rel="noreferrer">{row.caption}</a> · {row.schema}{row.collection_label ? ` · ${row.collection_label}` : ''}
        </li>)}
      </ul>
      {(remote.data?.hidden ?? 0) > 0 && <p className="muted">{remote.data?.hidden} more in investigations you cannot open.</p>}
    </div>}

    <div className="flex gap-2 mt-1">
      <Button size="sm" data-action="accept" onClick={() => onAccept(identityFields(choice, strong?.entity_id ?? null))} disabled={schemaBlocked || waiting || required}>Accept</Button>
      <Button size="sm" data-action="reject" variant="outline" onClick={onReject}>Reject</Button>
    </div>
  </div>;
}
