'use client';
// An empty case's first screen (Workbench-redesign-2026.pdf, "The case home", States: "Empty case: Aleph's
// pattern — four large first actions (Drop documents, Add a name to look up, Write the question, Open the
// sample case), each one line; no whole-card empty states"). It takes the place of the modules until the
// case holds a document, a claim or a party; then the usual grid comes back.
import {useQueryClient} from '@tanstack/react-query';
import Link from 'next/link';
import {useState} from 'react';
import type {DragEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {caseHref} from '../../lib/case-href';
import {listInvestigationsQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {seedDemo} from '../../lib/generated/sdk.gen';
import type {CaseStandingOut} from '../../lib/generated/types.gen';
import {upload} from '../documents/documents-panel';
import {HAVE} from '../new-case/new-case-setup';

/** Nothing in the case yet: no document, no claim, no party. */
export function caseIsEmpty(standing: CaseStandingOut | undefined): boolean {
  return Boolean(standing && !standing.documents.total && !standing.claims.total && !standing.network.parties);
}

/** Files dropped on a target are saved into the case one by one, with a line saying where it got to. */
export function useDropFiles(investigationId: string): {over: boolean; status: string; dropProps: {
  onDragOver: (e: DragEvent) => void; onDragLeave: () => void; onDrop: (e: DragEvent) => void;
}} {
  const queryClient = useQueryClient();
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState('');
  const onDrop = async (event: DragEvent) => {
    event.preventDefault(); setOver(false);
    const files = Array.from(event.dataTransfer.files);
    if (!files.length || !investigationId) return;
    let done = 0;
    for (const file of files) {
      setStatus(`Saving ${file.name} (${done + 1} of ${files.length})…`);
      try { await upload(investigationId, file.name.replace(/\.[^./]+$/, ''), file); done += 1; } catch (error) { setStatus(`${file.name}: ${errorMessage(error, 'not saved')}`); return; }
    }
    setStatus(`${done} document${done === 1 ? '' : 's'} saved. Reading starts now.`);
    await queryClient.invalidateQueries();
  };
  return {over, status, dropProps: {
    onDragOver: e => { e.preventDefault(); setOver(true); }, onDragLeave: () => setOver(false), onDrop: e => void onDrop(e),
  }};
}

const NAMES_HREF = HAVE.find(h => h.key === 'names')?.href ?? '/bring-in#investigation-search';

export function FirstActions({investigationId, question, onWriteQuestion, onSwitch}: {
  investigationId: string; question: string | null | undefined; onWriteQuestion: () => void; onSwitch: (id: string) => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const drop = useDropFiles(investigationId);
  const [sample, setSample] = useState<'idle' | 'busy' | string>('idle');
  const openSample = async () => {
    setSample('busy');
    try {
      const made = (await seedDemo({throwOnError: true})).data;
      await queryClient.invalidateQueries({queryKey: listInvestigationsQueryKey()});
      setSample('idle');
      onSwitch(made.investigation_id);
    } catch (error) { setSample(errorMessage(error, 'Could not open the sample case')); }
  };
  return <section className="ch-firsts" aria-label="Start this case">
    <p className="ch-eyebrow ch-firsts-head">Nothing in this case yet · start with one of these</p>
    <ol>
      <li className={`ch-first-act ch-first-drop${drop.over ? ' over' : ''}`} {...drop.dropProps}>
        <Link href={caseHref('/bring-in#the-drop', investigationId)}>
          <span className="ch-first-n" aria-hidden="true">1</span><b>Drop documents</b>
          <span aria-live="polite" title={drop.status || undefined}>{drop.status || 'Drop files here, or open the Drop.'}</span>
        </Link>
      </li>
      <li className="ch-first-act">
        <Link href={caseHref(NAMES_HREF, investigationId)}>
          <span className="ch-first-n" aria-hidden="true">2</span><b>Add a name to look up</b>
          <span>A person or company to find.</span>
        </Link>
      </li>
      <li className="ch-first-act">
        <button type="button" onClick={onWriteQuestion}>
          <span className="ch-first-n" aria-hidden="true">3</span><b>Write the question</b>
          <span>{question ? `Now: ${question}` : 'The one thing this case answers.'}</span>
        </button>
      </li>
      <li className="ch-first-act">
        <button type="button" onClick={() => void openSample()} disabled={sample === 'busy'} aria-busy={sample === 'busy'}>
          <span className="ch-first-n" aria-hidden="true">4</span><b>Open the sample case</b>
          <span role={sample !== 'idle' && sample !== 'busy' ? 'alert' : undefined}>
            {sample === 'busy' ? 'Opening the sample case…' : sample !== 'idle' ? sample : 'A teaching case to look around in.'}</span>
        </button>
      </li>
    </ol>
  </section>;
}
