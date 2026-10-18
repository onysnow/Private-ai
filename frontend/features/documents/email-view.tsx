'use client';
// An email document's headers and thread (ADR-0006, Wave A), from
// GET /api/documents/{id}/email: the headers OpenAleph read, kept with the
// document, and the thread OpenAleph rebuilds from Message-ID and
// In-Reply-To, each message linked to its document when the Workbench holds it.
import {useQuery} from '@tanstack/react-query';
import type {ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {errorMessage} from '../../lib/api-client';
import {getDocumentEmailOptions} from '../../lib/generated/@tanstack/react-query.gen';

type Props = {
  documentId: string;
  /** Opens another document of the thread (its proposals). */
  onOpenDocument: (documentId: string) => void;
};

const HEADER_ROWS: {label: string; key: 'from' | 'to' | 'cc' | 'bcc'}[] = [
  {label: 'From', key: 'from'}, {label: 'To', key: 'to'}, {label: 'Cc', key: 'cc'}, {label: 'Bcc', key: 'bcc'},
];

export function EmailView({documentId, onOpenDocument}: Props): ReactElement {
  const query = useQuery(getDocumentEmailOptions({path: {document_id: documentId}}));
  if (query.isError) return <p className="muted">{errorMessage(query.error, 'Could not load the email')}</p>;
  const email = query.data;
  if (!email) return <p className="muted">Loading the email…</p>;
  const {headers} = email;
  return <div className="candidate" aria-label="Email headers and thread">
    <dl>
      {headers.subject && <><dt>Subject</dt><dd>{headers.subject}</dd></>}
      {headers.date && <><dt>Date</dt><dd>{headers.date}</dd></>}
      {HEADER_ROWS.filter(row => headers[row.key].length > 0).map(row =>
        <span key={row.key}><dt>{row.label}</dt><dd>{headers[row.key].join(', ')}</dd></span>)}
    </dl>
    <h4>Thread</h4>
    {email.thread.length > 0 && <ol>
      {email.thread.map(message => {
        const held = message.document_id;
        return <li key={message.openaleph_entity_id}>
          <b>{message.subject || '(no subject)'}</b> <small>{[message.sender, message.date].filter(Boolean).join(' · ')}</small>
          {message.current && <small> · this email</small>}
          {!message.current && held && <Button size="sm" onClick={() => onOpenDocument(held)}>Review proposals</Button>}
          {!message.current && !held && <small> · not uploaded to this investigation</small>}
        </li>;
      })}
    </ol>}
    {email.thread_note && <p className="muted">{email.thread_note}.</p>}
  </div>;
}
