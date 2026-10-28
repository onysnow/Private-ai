// @vitest-environment jsdom
// Case home's "See · who is linked": link years and certainty marks, party shapes.
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {MiniNetwork, linkWord, linkYear, shapeOf} from '../features/case-home/mini-network';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import type {RelationshipOut} from '../lib/generated/types.gen';
import {mockApi} from '../test-support/mock-api';
import {emptyCaseHomeRoutes, emptyGraph, relationshipFixture} from '../test-support/page-routes';

const STANDING = 'GET /api/investigations/inv-1/standing';
/** The case's standing numbers, with every party in the case counted (the label's "in the case"). */
const standing = (parties: number) => {
  const empty = emptyCaseHomeRoutes('inv-1')[STANDING] as {network: {parties: number; links: number}};
  return {[STANDING]: {...empty, network: {parties, links: 2}}};
};

const edge = (id: string, s: string, t: string, properties: Record<string, string[]>, state = '') => ({
  id, schema: 'Ownership', properties, advisory: {support_state: state},
  source: {id: s, caption: s, schema: 'Company'}, target: {id: t, caption: t, schema: t === 'Harbour plot' ? 'RealEstate' : 'Company'},
}) as unknown as RelationshipOut;

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); useWorkbenchStore.setState({investigationId: 'inv-1', pointedParty: null}); });
afterEach(() => { cleanup(); useWorkbenchStore.setState({pointedParty: null, asOf: null}); });

describe('MiniNetwork', () => {
  it('reads a link year from its own dates and a shape from the kind of party', () => {
    expect(linkYear(edge('l', 'a', 'b', {startDate: ['2017-03-01']}))).toBe('2017');
    expect(linkYear(edge('l', 'a', 'b', {date: ['unknown']}))).toBeNull();
    expect(shapeOf('RealEstate')).toBe('property');
    expect(shapeOf('Person')).toBe('person');
    expect(shapeOf('Company')).toBe('company');
    const pay = (amount: string) => relationshipFixture({schema: 'Payment', properties: {amount: [amount], currency: ['EUR']}}) as RelationshipOut;
    expect(linkWord([pay('9800'), pay('9800'), pay('9800')])).toBe('paid €29,400');
    expect(linkWord([pay('2400000'), relationshipFixture({schema: 'Ownership'}) as RelationshipOut])).toBe('owns · paid €2.4M');
    expect(linkWord([pay('420000'), pay('29400')])).toBe('paid €449k');
    expect(linkWord(relationshipFixture({schema: 'Directorship'}) as RelationshipOut)).toBe('director');
  });

  it('labels each link with its year and whether it is shown or disputed', async () => {
    const node = (id: string, schema = 'Company') => ({id, ftm_id: `ftm-${id}`, caption: id, schema, properties: {}});
    const end = (id: string, schema = 'Company') => ({id, ftm_id: `ftm-${id}`, caption: id, schema});
    const link = (id: string, s: string, t: string, properties: Record<string, string[]>, state: string, schema = 'Company') =>
      relationshipFixture({id, properties, source: end(s), target: end(t, schema),
        advisory: {...(relationshipFixture().advisory as object), support_state: state}});
    mockApi({...standing(11), 'GET /api/investigations/inv-1/graph': {...emptyGraph([
      link('l1', 'Meridian', 'Bellcastle', {date: ['2017']}, 'independent_support'),
      link('l2', 'Bellcastle', 'Harbour plot', {startDate: ['2019-05']}, 'challenged_support', 'RealEstate'),
    ]), nodes: [node('Meridian'), node('Bellcastle'), node('Harbour plot', 'RealEstate')]}});
    render(<QueryProvider><MiniNetwork investigationId="inv-1"/></QueryProvider>);
    expect(await screen.findByText('owns 2017 ✓')).toBeInTheDocument();
    expect(screen.getByText('owns 2019 ×')).toBeInTheDocument();
    // The parties with a link, against every party in the case (counted on the server).
    expect(await screen.findByText('3 linked · 11 in the case')).toBeInTheDocument();
  });

  it('counts only the linked parties until the case total arrives', async () => {
    twoLinks(false);
    expect(await screen.findByText('3 linked')).toBeInTheDocument();
  });

  const twoLinks = (withStanding = true) => {
    const node = (id: string) => ({id, ftm_id: `ftm-${id}`, caption: id, schema: 'Company', properties: {}});
    const end = (id: string) => ({id, ftm_id: `ftm-${id}`, caption: id, schema: 'Company'});
    const link = (id: string, s: string, t: string, properties: Record<string, string[]>) =>
      relationshipFixture({id, properties, source: end(s), target: end(t)});
    mockApi({...(withStanding ? standing(11) : {}), 'GET /api/investigations/inv-1/graph': {...emptyGraph([
      link('l1', 'Meridian', 'Bellcastle', {startDate: ['2017']}),
      link('l2', 'Bellcastle', 'Orrin', {startDate: ['2020-05']}),
    ]), nodes: [node('Meridian'), node('Bellcastle'), node('Orrin')]}});
    render(<QueryProvider><MiniNetwork investigationId="inv-1"/></QueryProvider>);
  };

  it('keeps a party lit when it is clicked after the pointer reached it, and a second click turns it off', async () => {
    twoLinks();
    const party = await screen.findByRole('button', {name: 'Bellcastle, 2 links'});
    fireEvent.mouseEnter(party);
    fireEvent.click(party);
    expect(useWorkbenchStore.getState().pointedParty).toBe('Bellcastle');
    expect(party).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(party);
    expect(useWorkbenchStore.getState().pointedParty).toBeNull();
    // From the keyboard: focus points, Enter keeps it, Enter again turns it off.
    const other = screen.getByRole('button', {name: 'Orrin, 1 links'});
    fireEvent.focus(other);
    fireEvent.keyDown(other, {key: 'Enter'});
    expect(useWorkbenchStore.getState().pointedParty).toBe('Orrin');
    fireEvent.keyDown(other, {key: 'Enter'});
    expect(useWorkbenchStore.getState().pointedParty).toBeNull();
    // The whole party takes the pointer, not only its mark.
    expect(party.querySelector('.ch-node-hit')).not.toBeNull();
  });

  it('shows the links that held as of the year chosen on the year rail', async () => {
    twoLinks();
    expect(await screen.findByText('3 linked · 11 in the case')).toBeInTheDocument();
    act(() => useWorkbenchStore.setState({asOf: 2018}));
    expect(screen.getByText('2 linked · 11 in the case · as of 2018')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /^Orrin/})).toBeNull();
    act(() => useWorkbenchStore.setState({asOf: 2016}));
    expect(screen.getByText(/No link had started by 2016/)).toBeInTheDocument();
    act(() => useWorkbenchStore.setState({asOf: null}));
  });
});
