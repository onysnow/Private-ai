// @vitest-environment jsdom
// The workbench page's frame (components/layout/workbench-page.tsx): the rail
// names the five stages in order and jumps to each part; the tiles say where
// things stand, in how-sure colours, and link to their part.
import {cleanup, render, screen, within} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import {StageRail, StageSection, StandingTiles} from '../components/layout/workbench-page';
import type {Standing} from '../components/layout/workbench-page';

afterEach(cleanup);

const standing: Standing = {
  claims: {total: 3, sure: {supported: 1, disputed: 1, not_yet: 1}},
  evidence: {total: 4, sources: 2},
  documents: 0,
  network: {parties: 6, links: 5, sure: {supported: 1, not_yet: 3, disputed: 1}},
  timeline: {total: 6, from: '2019', to: '2024', sure: {supported: 3, not_yet: 2, disputed: 1}},
  leads: {open: 3, status: {active: 1, unreviewed: 2}, urgent: 1},
  places: 0,
};

describe('Workbench page frame', () => {
  it('lists the five stages in order, each part a jump with its count', () => {
    render(<StageRail investigationName="Demo Investigation" standing={standing}/>);
    const rail = screen.getByRole('navigation', {name: 'Parts of the investigation'});
    expect(within(rail).getAllByRole('link').filter(a => a.getAttribute('href')?.startsWith('#stage-')).map(a => a.textContent))
      .toEqual(['1Collect', '2Verify', '3Map', '4Report', '5Keep']);
    expect(within(rail).getByRole('link', {name: /^Sources & evidence\s*2 · 4$/})).toHaveAttribute('href', '#source-capture');
    expect(within(rail).getByRole('link', {name: /^Relationships\s*6 · 5$/})).toHaveAttribute('href', '#relationship-graph');
    expect(within(rail).getByRole('link', {name: /^Leads\s*3$/})).toHaveAttribute('href', '#leads');
  });

  it('says where things stand and links each tile to its part', () => {
    render(<StandingTiles standing={standing}/>);
    const tiles = screen.getByRole('region', {name: 'Where things stand'});
    expect(within(tiles).getByRole('link', {name: /Claims\s*3 claims/})).toHaveAttribute('href', '#claim-verification');
    expect(within(within(tiles).getByRole('link', {name: /^Claims/})).getByText('1 disputed')).toBeInTheDocument();
    expect(within(tiles).getByText('1 contested')).toBeInTheDocument();
    expect(within(tiles).getByText(', 2019–2024', {exact: false})).toBeInTheDocument();
    expect(within(tiles).getByText('1 urgent')).toBeInTheDocument();
  });

  it('numbers each stage section and states what it is for', () => {
    render(<StageSection stage="verify"><p>body</p></StageSection>);
    expect(screen.getByRole('heading', {level: 2, name: 'Verify'})).toBeInTheDocument();
    expect(screen.getByText(/Decide what the evidence shows/)).toBeInTheDocument();
  });
});
