'use client';
// A picture as evidence (before-and-after images; backend
// app/services/evidence.py): an uploaded picture becomes an evidence record
// with its caption as the quote and the date it was taken, as its source
// states it, to the precision the source gives (a year, a month or a day).
// Two such records can then be compared as before and after (the chart
// builder's "Place" question, "Pictures compared"). The picture is shown
// whole, so the reporter captions what they see.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {api} from '../../lib/api-instance';
import {errorMessage} from '../../lib/api-client';
import {dateWords} from '../../lib/dates';
import {investigationVisualCatalogQueryKey, listInvestigationEvidenceQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {createEvidenceEndpoint} from '../../lib/generated/sdk.gen';

// The pictures the app shows (backend app/services/image_reader.py IMAGE_EXTENSIONS), and the HEIC and camera RAW
// photos it shows through a viewable copy (app/services/photos.py PHOTO_EXTENSIONS, ADR-0021).
const PICTURE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.heic', '.heif', '.dng', '.cr2', '.cr3', '.nef', '.nrw', '.arw', '.raf', '.rw2', '.pef', '.orf'];
// A date as the timeline records one: a year, a month or a day.
const PARTIAL_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

export function isPicture(filename: string): boolean {
  const lower = filename.toLowerCase();
  return PICTURE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

type Props = {investigationId: string; documentId: string; sourceId: string; filename: string};

export function PictureEvidence({investigationId, documentId, sourceId, filename}: Props): ReactElement {
  const queryClient = useQueryClient();
  const picture = useQuery({queryKey: ['document-picture', documentId], queryFn: () => api.blob(`/api/documents/${documentId}/picture`),
    staleTime: Infinity});
  const [url, setUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [taken, setTaken] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!picture.data) return;
    const made = URL.createObjectURL(picture.data);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [picture.data]);

  const save = useMutation({
    mutationFn: async () => (await createEvidenceEndpoint({body: {
      source_id: sourceId, document_id: documentId, quote: caption.trim(), locator: 'the whole picture', captured_on: taken.trim() || null,
    }, throwOnError: true})).data,
  });
  const dateOk = !taken.trim() || PARTIAL_DATE.test(taken.trim());

  const submit = async () => {
    try {
      const evidence = await save.mutateAsync();
      setCaption(''); setTaken('');
      setStatus(evidence.captured_on ? `Saved as evidence, taken ${dateWords(evidence.captured_on)}. It can be compared as before or after.`
        : 'Saved as evidence. Add the date it was taken to compare it as before or after.');
      const path = {investigation_id: investigationId};
      await Promise.all([queryClient.invalidateQueries({queryKey: listInvestigationEvidenceQueryKey({path})}),
        queryClient.invalidateQueries({queryKey: investigationVisualCatalogQueryKey({path})})]);
    } catch (error) {
      setStatus(errorMessage(error, 'Could not save the picture as evidence'));
    }
  };

  return <section aria-label={`Picture evidence from ${filename}`} data-testid="picture-evidence">
    {picture.isError ? <p className="muted" role="alert">{errorMessage(picture.error, 'The picture could not be shown')}</p>
      // A blob: URL of the fetched picture: next/image optimises files a server hosts, which this is not.
      // eslint-disable-next-line @next/next/no-img-element
      : url ? <img src={url} alt={`The uploaded picture ${filename}`} style={{maxWidth: '100%', maxHeight: 320, objectFit: 'contain', display: 'block'}}/>
        : <p className="muted">Loading the picture…</p>}
    <div className="searchrow">
      <label className="text-sm">Caption: what the picture shows
        <Input value={caption} onChange={(e: ChangeEvent<HTMLInputElement>) => setCaption(e.target.value)}
          placeholder="The market hall, intact"/></label>
      <label className="text-sm">Date taken, as its source states it
        <Input value={taken} onChange={(e: ChangeEvent<HTMLInputElement>) => setTaken(e.target.value)} placeholder="YYYY, YYYY-MM or YYYY-MM-DD"
          aria-invalid={!dateOk}/></label>
      <Button onClick={submit} disabled={!caption.trim() || !dateOk || save.isPending}>Save as picture evidence</Button>
    </div>
    {!dateOk && <p className="muted" role="alert">Write the date as a year (2023), a month (2023-11) or a day (2023-11-14).</p>}
    {status && <p className="muted" aria-live="polite">{status}</p>}
  </section>;
}
