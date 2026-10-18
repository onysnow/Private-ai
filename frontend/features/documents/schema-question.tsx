'use client';
// What kind of entity a proposed name is, asked before it can be accepted.
// Two cases ask it:
// - the Workbench's own pattern finder saw nothing in the text that says what
//   kind of entity the name is (confidence below 0.5; backend
//   app/services/entity_signals.py): the reporter confirms its guess
//   (pre-marked as suggested) or picks another of the kinds it lists
//   (payload.schema_choices: Person, Organization, Company, or "not sure");
// - OpenAleph recorded the name without a kind (namesMentioned, ADR-0006):
//   the proposal says so (payload.schema_question) and lists the choices,
//   and nothing is suggested.
import type {ReactElement} from 'react';

import {Button} from '@/components/ui/button';

export const CLARIFY_CONFIDENCE_THRESHOLD = 0.5;

type Proposal = {candidate_type: string; confidence?: number; payload: {[key: string]: unknown}};

/** Whether accepting the proposal waits for the reporter to say what it is. */
export function needsSchemaAnswer(c: Proposal): boolean {
  if (c.candidate_type !== 'entity') return false;
  return c.payload.schema_question === true || (c.confidence ?? 0) < CLARIFY_CONFIDENCE_THRESHOLD;
}

function choicesFor(c: Proposal): string[] {
  const listed = c.payload.schema_choices;
  if (Array.isArray(listed) && listed.every((x): x is string => typeof x === 'string') && listed.length) return listed;
  return ['Person', 'Organization'];
}

function choiceLabel(schema: string): string {
  return schema === 'LegalEntity' ? 'Not sure (LegalEntity)' : schema;
}

type Props = {
  candidate: Proposal & {id: string};
  answer: string | undefined;
  onAnswer: (schema: string) => void;
};

export function SchemaQuestion({candidate, answer, onAnswer}: Props): ReactElement {
  const caption = typeof candidate.payload.caption === 'string' ? candidate.payload.caption : '';
  const open = candidate.payload.schema_question === true;
  const suggested = open ? undefined : (typeof candidate.payload.suggested_schema === 'string' ? candidate.payload.suggested_schema : 'Person');
  return <div className="rounded border border-accent/40 bg-accent/10 p-2 text-sm" data-testid={`clarify-${candidate.id}`}>
    <b>Clarifying question:</b>{' '}
    {open ? <>What kind of entity is &quot;{caption}&quot;? OpenAleph found the name but not what it is.</>
      : choicesFor(candidate).length > 2 ? <>What kind of entity is &quot;{caption}&quot;? Nothing in the text says.</>
      : <>Is &quot;{caption}&quot; a Person or an Organization?</>}
    <div className="flex flex-wrap gap-2 mt-1">
      {choicesFor(candidate).map(choice => (
        <Button key={choice} size="sm" variant={answer === choice ? 'default' : 'outline'} onClick={() => onAnswer(choice)}>
          {choiceLabel(choice)}{choice === suggested ? ' (suggested)' : ''}
        </Button>
      ))}
    </div>
  </div>;
}
