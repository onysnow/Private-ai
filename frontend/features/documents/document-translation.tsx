'use client';
// A document's machine translation (ADR-0006, Wave C; backend
// app/services/openaleph_translation.py): what OpenAleph's optional
// translation service (Argos, run on the machine) made of each page, beside
// the original. It is a reading aid: quotes, evidence and claims are taken
// from the original, which is why it is labelled on every view.
import {useQuery} from '@tanstack/react-query';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {getDocumentTranslationOptions} from '../../lib/generated/@tanstack/react-query.gen';

/** "deu → eng", from the three-letter codes FollowTheMoney stores. */
export function languagePair(detected: string[], translated: string | null): string {
  const from = detected.length ? detected.join(', ') : 'unknown language';
  return translated ? `${from} → ${translated}` : from;
}

export function DocumentTranslation({documentId}: {documentId: string}): ReactElement {
  const query = useQuery(getDocumentTranslationOptions({path: {document_id: documentId}}));
  const found = query.data;
  return <div className="candidate" aria-label="Machine translation">
    <h4>Machine translation</h4>
    <p className="muted"><small>Made by OpenAleph&apos;s translation service on this machine. Check it against the original before relying on it; quotes and evidence come from the original.</small></p>
    {query.isError && <p className="muted">{errorMessage(query.error, 'Could not load the translation')}</p>}
    {query.isPending && <p className="muted">Asking OpenAleph…</p>}
    {found && found.state !== 'translated' && <p className="muted">{found.detail}</p>}
    {found?.state === 'translated' && <>
      <p><small>{languagePair(found.detected_languages, found.translated_language)}</small></p>
      <table aria-label="Original and translation">
        <thead><tr><th>Where</th><th>Original</th><th>Translation</th></tr></thead>
        <tbody>{found.parts.map(part => <tr key={part.locator}>
          <td><small>{part.locator}</small></td>
          <td style={{whiteSpace: 'pre-wrap'}}>{part.original}</td>
          <td style={{whiteSpace: 'pre-wrap'}}>{part.translated ?? <small className="muted">Not translated</small>}</td>
        </tr>)}</tbody>
      </table>
    </>}
  </div>;
}
