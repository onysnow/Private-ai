'use client';
// "How are these two connected?" (docs/discovery/README.md, "Overlays";
// backend app/services/paths.py): pick two parties, see every chain of links
// between them, shortest first, each with how sure its weakest link is.
// Choosing a chain lights it in the network above.
import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {howAreTheyConnectedOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {ChainOut} from '../../lib/generated/types.gen';
import {CERTAINTY, SWATCH} from '../../lib/viz-tokens';

export type Chain = ChainOut;

type Props = {
  investigationId: string;
  parties: {id: string; label: string}[];
  chain: Chain | null;
  onChain: (chain: Chain | null) => void;
};

const WEAKEST: Record<string, string> = {
  supported: 'every link supported',
  unsupported: 'at least one link not yet supported',
  contested: 'at least one link contested',
};

export function Connections({investigationId, parties, chain, onChain}: Props): ReactElement {
  const sorted = [...parties].sort((a, b) => a.label.localeCompare(b.label));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [asked, setAsked] = useState<{from: string; to: string} | null>(null);
  const result = useQuery({...howAreTheyConnectedOptions({path: {investigation_id: investigationId}, query: {from: asked?.from ?? '', to: asked?.to ?? ''}}),
    enabled: Boolean(asked)});
  const name = (id: string) => parties.find(p => p.id === id)?.label ?? id;
  const key = (c: Chain) => c.links.map(l => l.id).join('|');

  return <details className="nc" open={Boolean(asked)}>
    <summary>How are these two connected?</summary>
    <form className="nc-pick" onSubmit={e => { e.preventDefault(); if (from && to && from !== to) { onChain(null); setAsked({from, to}); } }}>
      <select className="cf-tool" aria-label="First party" value={from} onChange={(e: ChangeEvent<HTMLSelectElement>) => setFrom(e.target.value)}>
        <option value="">First party…</option>{sorted.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <span aria-hidden>and</span>
      <select className="cf-tool" aria-label="Second party" value={to} onChange={(e: ChangeEvent<HTMLSelectElement>) => setTo(e.target.value)}>
        <option value="">Second party…</option>{sorted.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <button type="submit" className="cf-tool" disabled={!from || !to || from === to}>Show every chain</button>
      {chain && <button type="button" className="cf-tool" onClick={() => onChain(null)}>Stop lighting the chain</button>}
    </form>
    {asked && result.isFetching && <p className="muted">Looking for chains…</p>}
    {asked && result.isError && <p className="muted">{errorMessage(result.error, 'Could not look for chains')}</p>}
    {asked && result.data && <>
      <p className="nc-sum">{result.data.total === 0
        ? `No chain of up to ${result.data.max_len} links joins ${name(asked.from)} and ${name(asked.to)}.`
        : `${result.data.total} ${result.data.total === 1 ? 'chain' : 'chains'} of up to ${result.data.max_len} links, shortest first${result.data.truncated ? `; the first ${result.data.chains.length} are shown` : ''}. Choose one to light it in the network.`}</p>
      <ol className="nc-list">
        {result.data.chains.map(c => <li key={key(c)}>
          <button type="button" className={`nc-chain${chain && key(chain) === key(c) ? ' on' : ''}`} aria-pressed={Boolean(chain && key(chain) === key(c))}
            onClick={() => onChain(chain && key(chain) === key(c) ? null : c)}>
            <span className="nc-steps">{c.parties.map((p, i) => <span key={p.id}>
              {i > 0 && <span className="nc-link" style={{borderColor: CERTAINTY[c.links[i - 1].certainty].dash ? SWATCH.taupe : SWATCH.sage}}>
                {c.links[i - 1].from === p.id ? '←' : ''} {c.links[i - 1].schema} {c.links[i - 1].from === p.id ? '' : '→'}</span>}
              <b>{p.name}</b></span>)}</span>
            <small>{c.links.length} {c.links.length === 1 ? 'link' : 'links'} · {WEAKEST[c.weakest]}</small>
          </button>
        </li>)}
      </ol>
    </>}
  </details>;
}
