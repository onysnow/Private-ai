'use client';
// AI drafts, empty: the case's claims a draft could test (30 Oct sweep, the "fill the space" rule). Disputed and
// not-yet-shown claims first (what an AI reading of the evidence helps with most), then supported ones; ruled-out
// claims are left out. Each claim's "Ask" opens Ask the case with the claim as the question: it never runs by itself.
import {useQuery} from '@tanstack/react-query';
import type {ReactElement} from 'react';

import {StatusChip} from '../../components/status';
import type {ClaimStatus} from '../../components/status';
import {Reveal} from '../../components/ui/reveal';
import {listClaimsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {askBeforeYouRun} from './before-you-run';

const SHAPE: Record<string, ClaimStatus> = {supported: 'supported', confirmed: 'supported', disputed: 'disputed', rejected: 'ruled_out', lead: 'unshown', unverified: 'unshown'};
const ORDER: ClaimStatus[] = ['disputed', 'unshown', 'supported'];

export const draftQuestion = (text: string): string => `What does the evidence establish about this claim: “${text.trim()}”?`;

export function DraftableClaims({investigationId}: {investigationId: string}): ReactElement | null {
  const claims = useQuery({...listClaimsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const rows = (claims.data ?? []).map(c => ({...c, shape: SHAPE[c.status] ?? 'unshown'}))
    .filter(c => c.shape !== 'ruled_out')
    .sort((a, b) => ORDER.indexOf(a.shape) - ORDER.indexOf(b.shape));
  if (claims.isPending) return <section className="ai-drafts-claims" aria-busy="true" aria-label="Claims a draft could test"/>;
  if (claims.isError || !rows.length) return null;
  return <section className="ai-drafts-claims" aria-label="Claims a draft could test">
    <p className="ai-drafts-eyebrow"><Reveal detail="A case synthesis reads the evidence on a claim and says what it establishes, with every citation checked. Disputed and not-yet-shown claims first.">
      <span>Claims a draft could test</span></Reveal> <b>{rows.length}</b></p>
    <ol>{rows.map(c => <li key={c.id}>
      <StatusChip status={c.shape} focusable/>
      <span className="ai-drafts-claim">{c.text}</span>
      <Reveal tabbable={false} detail="Open Ask the case with this claim as the question. Nothing runs until you start it.">
        <button type="button" aria-label={`Ask the case about: ${c.text}`}
          onClick={() => askBeforeYouRun(investigationId, {module: 'case_synthesis', question: draftQuestion(c.text), theory: ''})}>Ask ›</button></Reveal>
    </li>)}</ol>
  </section>;
}
