'use client';
// Source & exact evidence capture: one reporter-controlled source plus one
// provenance-preserving evidence record. Moved out of app/page.tsx
// (Foundation Fixes fix 3); its calls and reply checks are generated from
// the API schema (fix 2).
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {AtSign, Circle, FileText, Globe, Landmark, MessageCircle} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {useEffect, useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Reveal} from '../../components/ui/reveal';
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

/** Each type of source as an icon (globe, page, speech, seal, at-sign, dot), named on hover or focus (Ony, 29 Oct). */
export const SOURCE_TYPES: [string, string, LucideIcon][] = [
  ['web', 'Web page', Globe], ['document', 'Document', FileText], ['interview', 'Interview', MessageCircle],
  ['public_record', 'Public record', Landmark], ['social', 'Social post', AtSign], ['other', 'Other', Circle],
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
      setStatus(`Saved evidence ${evidence.id}`);
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
      <CardTitle><Reveal detail="Create a reporter-controlled source and a provenance-preserving evidence record. Evidence remains separate from claims until you explicitly attach it as support, contradiction, or context.">
        Source & exact evidence capture</Reveal></CardTitle>
    </CardHeader>
    <CardContent>
      <div className="searchrow">
        <Input value={title} onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)} placeholder="Source title"/>
        <Input value={url} onChange={(e: ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)} placeholder="Source URL (optional)"/>
        <div className="sc-types" role="radiogroup" aria-label="Type of source">{SOURCE_TYPES.map(([value, label, Icon]) =>
          <Reveal key={value} tabbable={false} describe={false} detail={label}>
            <button type="button" role="radio" aria-checked={sourceType === value} aria-label={label} className={sourceType === value ? 'on' : ''}
              onClick={() => setSourceType(value)}><Icon size={16} aria-hidden="true"/></button></Reveal>)}</div>
      </div>
      <div className="searchrow">
        <Input value={locator} onChange={(e: ChangeEvent<HTMLInputElement>) => setLocator(e.target.value)} placeholder="Exact locator — page, paragraph, timestamp, section…"/>
        <Input value={quote} onChange={(e: ChangeEvent<HTMLInputElement>) => setQuote(e.target.value)} placeholder="Exact quote / excerpt"/>
        <Input value={notes} onChange={(e: ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)} placeholder="Reporter note (optional)"/>
        <Button onClick={capture} disabled={!investigationId || !title.trim() || !hasEvidence}>Save source + evidence</Button>
      </div>
      {/* A saved record's ID is sub-text: "Saved" shows, the ID on hover. */}
      {status && (status.startsWith('Saved evidence ')
        ? <p className="muted"><Reveal detail={<><span className="rv-row rv-mono">{status}</span><span className="rv-row">It is now available for claim review.</span></>}>Saved</Reveal></p>
        : <p className="muted">{status}</p>)}
      <p className="muted sc-counts"><Reveal detail={`${sourceCount} source(s) · ${evidenceCount} evidence record(s) in this investigation.`}>
        <span><Globe size={13} aria-hidden="true"/> {sourceCount}</span> <span><FileText size={13} aria-hidden="true"/> {evidenceCount}</span></Reveal></p>
    </CardContent>
  </Card>;
}
