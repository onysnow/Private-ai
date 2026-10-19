// @vitest-environment jsdom
// The demo case loading bar (features/demo/load-bar): one segment per stage,
// each filling as its stage goes, with what is happening written above it.
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import {LoadBar, loadStage} from '../features/demo/load-bar';
import type {DemoCaseProgressOut} from '../lib/generated/types.gen';

afterEach(cleanup);

const at = (p: Partial<DemoCaseProgressOut>) => ({not_downloaded: [], ...p}) as DemoCaseProgressOut;

describe('Demo loading bar', () => {
  it('shows nothing before a load and once the case is ready', () => {
    expect(loadStage(at({state: 'idle'}), false)).toBeNull();
    expect(loadStage(at({state: 'ready', investigation_id: 'i', documents: 3, read: 3, failed: 0}), false)).toBeNull();
    expect(loadStage(at({state: 'failed', error: 'x'}), false)).toBeNull();
  });

  it('counts a load as downloading from the click, before the server answers', () => {
    expect(loadStage(undefined, true)?.text).toBe('Starting the download…');
    expect(loadStage(at({state: 'idle'}), true)?.stage).toBe('download');
  });

  it('fills the download segment with the documents done', () => {
    const s = loadStage(at({state: 'downloading', fetched: 51, to_fetch: 101}), true)!;
    expect(s.text).toBe('Downloading the documents: 51 of 101');
    expect(s.fill.download).toBeCloseTo(50 / 101);
    expect(s.fill.build).toBe(0);
  });

  it('works on the records, then reads the documents', () => {
    expect(loadStage(at({state: 'building', step: 'Adding the parties, payments, events and claims'}), true)).toMatchObject(
      {stage: 'build', text: 'Adding the parties, payments, events and claims', fill: {download: 1}});
    const r = loadStage(at({state: 'reading', investigation_id: 'i', documents: 10, read: 4, failed: 1}), false)!;
    expect(r.text).toBe('Reading the documents: 4 of 10 read, 1 could not be read');
    expect(r.fill).toEqual({download: 1, build: 1, read: 0.5});
  });

  it('reports overall progress to assistive technology', () => {
    render(<LoadBar progress={at({state: 'reading', investigation_id: 'i', documents: 10, read: 5, failed: 0})} starting={false}/>);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '83');
    expect(screen.getByText('Reading the documents: 5 of 10 read')).toBeInTheDocument();
    expect(screen.getByText('Add the records')).toBeInTheDocument();
  });
});
