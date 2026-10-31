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

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {getOwnershipChainOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {OwnershipChainOut} from '../../lib/generated/types.gen';
import {formatShare} from '../../lib/ownership-layout';
import {ChartFrame, FootStat, KeyRow, KeySection, LineSwatch} from '../../components/charts/chart-frame';
import {LINK, PARTY, PARTY_ORDER, SWATCH, partyKind} from '../../lib/viz-tokens';

// React Flow is loaded on demand, client-side only, like the network drawing.
const OwnershipDiagram = dynamic(() => import('../../components/ownership-diagram').then(m => m.OwnershipDiagram),
  {ssr: false, loading: () => <p className="muted p-4">Loading the chart…</p>});

type Props = {entityId: string; onParty: (entityId: string) => void};

/** The share an owner holds, or why it is not known, in words. */
export function shareText(owner: OwnershipChainOut['owners'][number]): string {
  if (owner.effective_percentage !== null && owner.effective_percentage !== undefined) return formatShare(owner.effective_percentage);
  return `not known: ${owner.not_known_because ?? 'no reason given'}`;
}

export function OwnershipChain({entityId, onParty}: Props): ReactElement {
  const query = useQuery(getOwnershipChainOptions({path: {entity_id: entityId}}));
  const chain = query.data;
  if (query.isError) return <p className="muted">{errorMessage(query.error, 'Could not read the ownership chain')}</p>;
  if (!chain) return <p className="muted">Reading the ownership chain…</p>;
  if (chain.links.length === 0) return <p className="muted">No ownership or directorship links are recorded for this entity.</p>;
  const subject = chain.nodes.find(n => n.is_subject);
  const kinds = PARTY_ORDER.filter(k => chain.nodes.some(n => partyKind(n.schema) === k));
  const owns = chain.links.some(l => l.schema === 'Ownership'), directs = chain.links.some(l => l.schema !== 'Ownership');
  const ended = chain.links.some(l => l.ended), circular = chain.links.some(l => l.circular);
  return <ChartFrame kind="ownership" title={`Who owns and controls ${subject?.caption ?? 'this entity'}`}
    rule={{label: 'Arranged by control:', text: 'each owner or director sits above what it owns or directs; this dossier’s entity has a second ring.'}}
    legend={<>
      <KeySection title="Parties" channel="ring and icon: what it is">
        {kinds.map(k => <KeyRow key={k} swatch={<span className="oc-dot" style={{background: PARTY[k].fill, borderColor: PARTY[k].ring, width: 22, height: 22}}/>}>{PARTY[k].name}</KeyRow>)}
      </KeySection>
      <KeySection title="Links" channel="colour: what the link is; its words say the share or role">
        {owns && <KeyRow swatch={<LineSwatch colour={LINK.owns.colour} arrow/>}>Owns</KeyRow>}
        {directs && <KeyRow swatch={<LineSwatch colour={LINK.runs.colour} arrow/>}>Directs</KeyRow>}
        {ended && <KeyRow swatch={<LineSwatch colour={SWATCH.sage} dash="6 5"/>}>Ended</KeyRow>}
        {circular && <KeyRow swatch={<span style={{fontSize: 11}}>circular</span>}>Closes a circle of ownership</KeyRow>}
      </KeySection>
    </>}
    footer={<>
      <FootStat value={chain.nodes.length}>parties</FootStat>
      <FootStat value={chain.owners.length}>owners</FootStat>
      {chain.truncated && <span>The chain goes on past {chain.max_depth} steps; only the first {chain.max_depth} are shown.</span>}
    </>}>
    <OwnershipDiagram chain={chain} onParty={onParty}/>
    {chain.owners.length > 0 && <div style={{padding: '4px 16px 14px'}}>
      <table className="oc-table" aria-label="Owners and their shares">
        <thead><tr><th scope="col">Owner</th><th scope="col"><Reveal detail="A share through several companies is the percentages multiplied along each path and added over the paths (HMRC MTT17040). It is worked out only when every link on the way states a percentage, none has ended and none runs in a circle.">Holds</Reveal></th><th scope="col">Paths</th></tr></thead>
        <tbody>
          {chain.owners.map(o => <tr key={o.entity_id}>
            <th scope="row">{chain.nodes.find(n => n.id === o.entity_id)?.caption ?? o.entity_id}</th>
            <td>{shareText(o)}</td>
            <td>{o.paths}{o.direct ? ' (one direct)' : ''}</td>
          </tr>)}
        </tbody>
      </table>
      {/* How a share is worked out is on hover of "Holds"; that it is arithmetic, not a finding, stays on screen. */}
      <p className="text-xs" style={{color: SWATCH.tan, marginTop: 8}}><b aria-hidden="true">ƒ </b>Equity arithmetic, not a finding of control or beneficial ownership.</p>
    </div>}
  </ChartFrame>;
}
