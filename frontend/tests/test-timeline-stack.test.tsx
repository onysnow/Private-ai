// @vitest-environment jsdom
// Timeline › Stack in depth (features/timeline/stack.tsx; mockup TIME_2): layers as fine as the dates allow, a dashed
// layer for evidence known only to its month, gaps said in words, and the keys and buttons that move one layer.
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {TimelinePanel} from '../features/timeline/timeline-panel';
import {autoStep, gapWords, layersFor, stackLayers} from '../features/timeline/stack';
import type {TimelineLaneEventOut} from '../lib/generated/types.gen';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';
import {lanesBody} from '../test-support/page-routes';

const ev = (id: string, title: string, date: string): TimelineLaneEventOut => ({
  id, kind: 'relationship_date', investigation_id: 'inv-1', title, description: null, date_start: date, date_end: null,
  precision: date.length === 7 ? 'month' : 'day', verification_status: 'asserted', synthetic: true,
  refs: {}, provenance: {}, context: null, sort_key: date, parties: [], source_key: 'you', source_label: 'Typed by you',
  fact: 'not_yet', fact_note: null});
const events = [ev('a', 'Transfer one', '2018-02-06'), ev('b', 'Email: three transfers', '2018-02-07'), ev('c', 'Bank details change', '2018-02-08'),
  ev('d', 'An email, March', '2018-03'), ev('e', 'Transfer two', '2018-03-06'), ev('f', 'Transfer three', '2018-04-09')];

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('stack model', () => {
  it('groups by week, gives a month-only date its own layer at the month\'s start, and says the gaps', () => {
    const layers = layersFor(events, 'week');
    expect(layers.map(l => [l.label, l.events.length, l.fuzzy, l.gap ?? null])).toEqual([
      ['Week of 5 Feb 2018', 3, false, null],
      ['Sometime in Mar 2018', 1, true, null],
      ['Week of 5 Mar 2018', 1, false, null],
      ['Week of 9 Apr 2018', 1, false, '5 weeks later'],
    ]);
    expect(layersFor(events, 'month').map(l => l.label)).toEqual(['Feb 2018', 'Mar 2018', 'Apr 2018']);
    expect(autoStep(events)).toBe('day');
    expect(gapWords(3 * 365.25 * 86_400_000)).toBe('3 years');
  });
});

describe('stack in a case with far-off records', () => {
  const busy = [...events, ev('g', 'Transfer four', '2018-05-02'), ev('h', 'Transfer five', '2018-06-18'), ev('i', 'Transfer six', '2018-07-02'),
    ev('j', 'Transfer seven', '2018-07-20'), ev('k', 'Transfer eight', '2018-08-01'), ev('l', 'Transfer nine', '2018-08-21')];
  const wide = [ev('old', 'Incorporation', '1952-11-10'), ev('old2', 'Birth', '1969-03-25'), ...busy, ev('late', 'Ruling', '2026-06-01')];
  it('folds the outliers into one layer at each end, picks the step from the busy part, and opens on it', () => {
    const {layers, step, start, years} = stackLayers(wide, 'auto');
    expect(step).toBe(autoStep(busy));
    expect(years).toBe('2018');
    expect(layers[0]).toMatchObject({label: '1952–1969', fold: 'early'});
    expect(layers[0].events.map(e => e.id)).toEqual(['old', 'old2']);
    expect(layers[layers.length - 1]).toMatchObject({label: '2026', fold: 'late', gap: '8 years later'});
    expect(start).toBe(1);
    expect(layers[start].fold).toBeUndefined();
  });

  it('opens the stack on the busy part, with the folded years one step back', async () => {
    mockApi({'GET /api/investigations/inv-1/timeline/lanes': lanesBody('inv-1', wide)});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', {name: 'Stack'}));
    expect(screen.queryByRole('heading', {name: 'Incorporation'})).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: /Back/}));
    expect(screen.getByRole('heading', {name: 'Incorporation'})).toBeInTheDocument();
  });
});

describe('Stack', () => {
  it('steps through the layers and shows the picked card', async () => {
    mockApi({'GET /api/investigations/inv-1/timeline/lanes': lanesBody('inv-1', events)});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', {name: 'Stack'}));
    await user.click(screen.getByRole('button', {name: 'week'}));
    expect(screen.getByText('Next · Sometime in Mar 2018')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: /Email: three transfers/}));
    expect(screen.getByRole('heading', {name: 'Email: three transfers'})).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: /Next layer/}));
    expect(screen.getByText('Next · Week of 5 Mar 2018')).toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'An email, March'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'minute'})).toBeDisabled();
  });
});
