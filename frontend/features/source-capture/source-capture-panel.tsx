'use client';
// Source & exact evidence capture: one reporter-controlled source plus one
// provenance-preserving evidence record. Moved out of app/page.tsx
// (Foundation Fixes fix 3); its calls and reply checks are generated from
// the API schema (fix 2).
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {errorMessage} from '../../lib/api-client';
import {listInvestigationEvidenceQueryKey, listSourcesQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {createEvidenceEndpoint, createSourceEndpoint} from '../../lib/generated/sdk.gen';

type Props = {
  investigationId: string;
  sourceCount: number;
  evidenceCount: number;
  /** Anything not reading the shared data cache reloads its copies here. */
  onSaved?: () => Promise<void> | void;
};

const SOURCE_TYPES: [string, string][] = [
  ['web', 'Web'], ['document', 'Document'], ['interview', 'Interview'],
  ['public_record', 'Public record'], ['social', 'Social'], ['other', 'Other'],
];

export function SourceCapturePanel({investigationId, sourceCount, evidenceCount, onSaved}: Props): ReactElement {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [sourceType, setSourceType] = useState('web');
  const [locator, setLocator] = useState('');
  const [quote, setQuote] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      const source = (await createSourceEndpoint({body: {
        investigation_id: investigationId, title: title.trim(), url: url.trim() || null,
        source_type: sourceType, metadata_json: {capture: 'reporter'},
      }, throwOnError: true})).data;
      const evidence = (await createEvidenceEndpoint({body: {
        source_id: source.id, quote: quote.trim() || null, locator: locator.trim() || null, notes: notes.trim() || null,
      }, throwOnError: true})).data;
      return evidence;
    },
  });

  // A status line belongs to the investigation it was about.
  useEffect(() => { setStatus(''); }, [investigationId]);

  const hasEvidence = Boolean(quote.trim() || locator.trim() || notes.trim());

  const capture = async () => {
    if (!investigationId || !title.trim()) return;
    if (!hasEvidence) {
      setStatus('Add an exact quote, locator, or reporter note before saving evidence.');
      return;
    }
    try {
      setStatus('Saving source and evidence…');
      const evidence = await save.mutateAsync();
      setTitle(''); setUrl(''); setQuote(''); setLocator(''); setNotes('');
      setStatus(`Saved evidence ${evidence.id}. It is now available for claim review.`);
      const path = {investigation_id: investigationId};
      await Promise.all([
        queryClient.invalidateQueries({queryKey: listSourcesQueryKey({path})}),
        queryClient.invalidateQueries({queryKey: listInvestigationEvidenceQueryKey({path})}),
        onSaved?.(),
      ]);
    } catch (error) {
      setStatus(errorMessage(error, 'Source/evidence capture failed'));
    }
  };

  return <Card className="card">
    <CardHeader className="pb-3">
      <CardTitle>Source & exact evidence capture</CardTitle>
      <CardDescription>Create a reporter-controlled source and a provenance-preserving evidence record. Evidence remains separate from claims until you explicitly attach it as support, contradiction, or context.</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="searchrow">
        <Input value={title} onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)} placeholder="Source title"/>
        <Input value={url} onChange={(e: ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)} placeholder="Source URL (optional)"/>
        <Select value={sourceType} onValueChange={setSourceType}>
          <SelectTrigger className="w-auto"><SelectValue/></SelectTrigger>
          <SelectContent>{SOURCE_TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="searchrow">
        <Input value={locator} onChange={(e: ChangeEvent<HTMLInputElement>) => setLocator(e.target.value)} placeholder="Exact locator — page, paragraph, timestamp, section…"/>
        <Input value={quote} onChange={(e: ChangeEvent<HTMLInputElement>) => setQuote(e.target.value)} placeholder="Exact quote / excerpt"/>
        <Input value={notes} onChange={(e: ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)} placeholder="Reporter note (optional)"/>
        <Button onClick={capture} disabled={!investigationId || !title.trim() || !hasEvidence}>Save source + evidence</Button>
      </div>
      {status && <p className="muted">{status}</p>}
      <p className="muted">{sourceCount} source(s) · {evidenceCount} evidence record(s) in this investigation.</p>
    </CardContent>
  </Card>;
}
