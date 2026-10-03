'use client';
// "Ownership and control" on a dossier: who owns the entity and what it owns,
// from the investigation's Ownership and Directorship links
// (GET /api/entities/{id}/ownership-chain), drawn as a structure chart and
// listed as a table. The table is the chart in words -- every owner, how many
// paths lead to it, and the share it holds through all of them, or why that
// share is not known. Clicking a party opens its dossier.
import {useQuery} from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {getOwnershipChainOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {OwnershipChainOut} from '../../lib/generated/types.gen';
import {formatShare} from '../../lib/ownership-layout';

// React Flow is loaded on demand, client-side only, like the network drawing.
const OwnershipDiagram = dynamic(() => import('../../components/ownership-diagram').then(m => m.OwnershipDiagram),
  {ssr: false, loading: () => <p className="muted">Loading chart…</p>});

type Props = {entityId: string; onParty: (entityId: string) => void};

/** The share an owner holds, or why it is not known, in words. */
export function shareText(owner: OwnershipChainOut['owners'][number]): string {
  if (owner.effective_percentage !== null && owner.effective_percentage !== undefined) return formatShare(owner.effective_percentage);
  return `not known: ${owner.not_known_because ?? 'no reason given'}`;
}

export function OwnershipChain({entityId, onParty}: Props): ReactElement {
  const query = useQuery(getOwnershipChainOptions({path: {entity_id: entityId}}));
  const chain = query.data;
  return <div>
    <b>Ownership and control</b>
    {query.isError && <p className="muted">{errorMessage(query.error, 'Could not read the ownership chain')}</p>}
    {chain && chain.links.length === 0 && <p className="muted">No ownership or directorship links are recorded for this entity.</p>}
    {chain && chain.links.length > 0 && <>
      <OwnershipDiagram chain={chain} onParty={onParty}/>
      {chain.owners.length > 0 && <table className="text-sm" aria-label="Owners and their shares">
        <thead><tr><th scope="col">Owner</th><th scope="col">Holds</th><th scope="col">Paths</th></tr></thead>
        <tbody>
          {chain.owners.map(o => <tr key={o.entity_id}>
            <th scope="row">{chain.nodes.find(n => n.id === o.entity_id)?.caption ?? o.entity_id}</th>
            <td>{shareText(o)}</td>
            <td>{o.paths}{o.direct ? ' (one direct)' : ''}</td>
          </tr>)}
        </tbody>
      </table>}
      <p className="muted text-xs">A share through several companies is the percentages multiplied along each path and added over the paths
        (HMRC MTT17040). It is worked out only when every link on the way states a percentage, none has ended and none runs in a circle.
        It is equity arithmetic, not a finding of control or beneficial ownership.
        {chain.truncated ? ` The chain goes on past ${chain.max_depth} steps; only the first ${chain.max_depth} are shown.` : ''}</p>
    </>}
  </div>;
}
