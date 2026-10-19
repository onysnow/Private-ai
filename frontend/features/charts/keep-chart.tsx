'use client';
// Keeping a chart made in the chart builder: at the end of a deck (as a new
// slide) or of a write-up, or in a new write-up. Only the order slip is
// sent; the server cooks, draws and checks the chart again from the deck's
// or write-up's own investigation (backend/app/services/saved_charts.py), so
// what is kept is always the Workbench's own reading of the records.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {errorMessage} from '../../lib/api-client';
import {
  addChartToDeckEndpointMutation, addChartToWriteupEndpointMutation, createWriteupEndpointMutation,
  listDecksEndpointOptions, listDecksEndpointQueryKey, listWriteupsEndpointOptions, listWriteupsEndpointQueryKey,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {VisualSpec} from '../../lib/generated/types.gen';

// A Radix select item cannot hold an empty value, so a new write-up has a
// name of its own.
const NEW_WRITEUP = 'new-writeup';

/** "deck:<id>", "writeup:<id>" or NEW_WRITEUP, as the destination picker holds it. */
export function parseDestination(value: string): {kind: 'deck' | 'writeup', id: string} | {kind: 'new-writeup'} | null {
  if (value === NEW_WRITEUP) return {kind: 'new-writeup'};
  const [kind, ...rest] = value.split(':');
  const id = rest.join(':');
  if ((kind === 'deck' || kind === 'writeup') && id) return {kind, id};
  return null;
}

type Props = {investigationId: string, spec: VisualSpec};

export function KeepChart({investigationId, spec}: Props): ReactElement {
  const queryClient = useQueryClient();
  const path = {investigation_id: investigationId};
  const decks = useQuery({...listDecksEndpointOptions({path})});
  const writeups = useQuery({...listWriteupsEndpointOptions({path})});
  const toDeck = useMutation({...addChartToDeckEndpointMutation()});
  const toWriteup = useMutation({...addChartToWriteupEndpointMutation()});
  const newWriteup = useMutation({...createWriteupEndpointMutation()});
  const [destination, setDestination] = useState('');
  const [heading, setHeading] = useState('');
  const [status, setStatus] = useState('');

  const target = parseDestination(destination);
  const busy = toDeck.isPending || toWriteup.isPending || newWriteup.isPending;

  const keep = async () => {
    if (!target) return;
    setStatus('Saving the chart…');
    try {
      if (target.kind === 'deck') {
        const deck = await toDeck.mutateAsync({path: {deck_id: target.id}, body: {spec, heading: heading.trim() || null}});
        setStatus(`Added to deck “${deck.title}” as slide ${deck.slide_count}.`);
        await queryClient.invalidateQueries({queryKey: listDecksEndpointQueryKey({path})});
        return;
      }
      const writeupId = target.kind === 'writeup' ? target.id
        : (await newWriteup.mutateAsync({body: {investigation_id: investigationId, title: spec.title}})).id;
      const writeup = await toWriteup.mutateAsync({path: {writeup_id: writeupId}, body: {spec}});
      setStatus(target.kind === 'writeup' ? `Added to the end of write-up “${writeup.title}”.` : `Started write-up “${writeup.title}” with this chart.`);
      await queryClient.invalidateQueries({queryKey: listWriteupsEndpointQueryKey({path})});
    } catch (error) {
      setStatus(errorMessage(error, 'Could not save the chart'));
    }
  };

  const deckList = decks.data?.decks ?? [];
  const writeupList = writeups.data?.writeups ?? [];
  return <fieldset>
    <legend>4. Keep this chart</legend>
    <div className="searchrow">
      <Select value={destination} onValueChange={value => { setDestination(value); setStatus(''); }}>
        <SelectTrigger className="w-auto" aria-label="Keep in"><SelectValue placeholder="Choose where to keep it"/></SelectTrigger>
        <SelectContent>
          {deckList.map(deck => <SelectItem key={deck.id} value={`deck:${deck.id}`}>Deck: {deck.title}</SelectItem>)}
          {writeupList.map(writeup => <SelectItem key={writeup.id} value={`writeup:${writeup.id}`}>Write-up: {writeup.title}</SelectItem>)}
          <SelectItem value={NEW_WRITEUP}>A new write-up</SelectItem>
        </SelectContent>
      </Select>
      {target?.kind === 'deck' && <Input value={heading} aria-label="Slide heading" placeholder={`Slide heading (default: ${spec.title})`}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setHeading(e.target.value)}/>}
      <Button onClick={keep} disabled={!target || busy}>{busy ? 'Saving…' : 'Keep chart'}</Button>
    </div>
    {deckList.length === 0 && <p className="muted">Decks are made from an AI draft; once one exists, charts can be added to it here.</p>}
    {status && <p className="muted" role="status">{status}</p>}
  </fieldset>;
}
