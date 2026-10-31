// @vitest-environment jsdom
// Check a pack (mockup CHECK_4): a pack sent back is read here; each file is as made, changed, missing or not in the
// list, in shape and word; a changed exhibit shows what rests on it; the check exports as a table.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {CheckAPack, checkTable} from '../features/pack-check/check-a-pack';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import type {PackCheckOut} from '../lib/generated/types.gen';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const RESULT: PackCheckOut = {
  file: 'kestrel-pack.zip', files: 5, pack_id: 'pack-1234abcd', made_here: true, made_in_other_case: null, made_at: '2026-10-28T17:44:00',
  made_by: 'local-owner', title: 'Who owns the harbour land', draft: false, compared_with: 'the list kept here when it was made',
  list_changed: false, whole: false, counts: {as_made: 2, changed: 1, missing: 1, extra: 1},
  rows: [
    {name: 'index.html', state: 'as_made', listed: A, now: A},
    {name: 'exhibits/007/page.png', state: 'changed', listed: A, now: B},
    {name: 'custody/c12.txt', state: 'missing', listed: A, now: null, about: 'the chain of custody of “Fernhill paid Loop Two”'},
    {name: 'notes.txt', state: 'extra', listed: null, now: B},
    {name: 'VERIFY.txt', state: 'as_made', listed: A, now: A},
  ],
  signature: {state: 'valid', fingerprint: '1a2b 3c4d 5e6f 7a8b 9c0d 1e2f 3a4b 5c6d', ours: true, as_made: true},
  exhibits: [{number: 7, file: 'page.png', state: 'changed', document: 'statement.pdf', case_file: 'matches',
    claims: ['Fernhill paid Loop Two €29,400 in March 2019'], ours: 'data:image/png;base64,AA==', theirs: 'data:image/png;base64,AA==',
    differs: {left: 0.1, top: 0.5, width: 0.8, height: 0.1}, redrawn: true}],
};

beforeEach(() => connectGeneratedClient(new ApiClient('http://api.test')));
afterEach(() => cleanup());

describe('Check a pack', () => {
  it('reads a dropped pack and says what is as made, changed, missing and not in the list', async () => {
    const api = mockApi({'POST /api/investigations/inv-1/evidence-pack/check': RESULT});
    render(<QueryProvider><CheckAPack investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('Choose an evidence pack'), new File(['PK'], 'kestrel-pack.zip', {type: 'application/zip'}));
    await waitFor(() => expect(api.calls('POST /api/investigations/inv-1/evidence-pack/check')).toHaveLength(1));
    const result = await screen.findByRole('region', {name: 'Result'});
    expect(result).toHaveTextContent('✕ Not as it was made');
    expect(result).toHaveTextContent('compared with the list kept here when it was made');
    expect(result).toHaveTextContent('Signed with this computer’s key (1a2b 3c4d 5e6f 7a8b 9c0d 1e2f 3a4b 5c6d).');
    const files = screen.getByRole('region', {name: 'Every file against the list'});
    const rows = within(files).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('exhibits/007/page.png');  // what is not as made comes first
    expect(rows[0]).toHaveTextContent('listed aaaa aaaa … · now bbbb bbbb …');
    expect(within(files).getByText('the chain of custody of “Fernhill paid Loop Two”')).toBeInTheDocument();
    await user.click(within(files).getByRole('button', {name: 'Not in the list 1'}));
    expect(within(files).getAllByRole('listitem')).toHaveLength(1);
    const exhibit = screen.getByRole('region', {name: 'Exhibit 7 changed'});
    expect(exhibit).toHaveTextContent('The pictures differ inside the marked band.');
    const rests = screen.getByRole('region', {name: 'What rests on it'});
    expect(rests).toHaveTextContent('Exhibit 7: “Fernhill paid Loop Two €29,400 in March 2019”');
    expect(rests).toHaveTextContent('statement.pdf: SHA-256 checked now, matches');
    expect(rests).toHaveTextContent('Missing: the chain of custody of “Fernhill paid Loop Two”');
    expect(screen.getByText('Check another')).toBeInTheDocument();
  });

  it('with no pack yet, shows a large drop target, what the check does, the floor, and a way to try it', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/evidence-pack.zip': {status: 200, body: 'zip'},
      'POST /api/investigations/inv-1/evidence-pack/check': {...RESULT, whole: true}});
    render(<QueryProvider><CheckAPack investigationId="inv-1"/></QueryProvider>);
    expect(screen.getByText('Drop an evidence pack here')).toBeInTheDocument();
    const how = screen.getByRole('region', {name: 'What the check does'});
    expect(within(how).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      expect.stringContaining('Recomputes each file’s fingerprint'), expect.stringContaining('Compares it with the pack’s own list'),
      expect.stringContaining('Says what changed, is missing or was added')]);
    expect(screen.getByText(/Read on this computer\. Nothing is sent anywhere/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', {name: 'Make a pack from this case and check it'}));
    await waitFor(() => expect(api.calls('POST /api/investigations/inv-1/evidence-pack/check')).toHaveLength(1));
    expect(api.calls('GET /api/investigations/inv-1/evidence-pack.zip')).toHaveLength(1);
    expect(await screen.findByRole('region', {name: 'Result'})).toHaveTextContent('As it was made');
  });

  it('folds the files as made past the first few into one line', async () => {
    const many = Array.from({length: 12}, (_, i) => ({name: `f${String(i).padStart(2, '0')}.txt`, state: 'as_made' as const, listed: A, now: A}));
    mockApi({'POST /api/investigations/inv-1/evidence-pack/check': {...RESULT, rows: [...RESULT.rows, ...many]}});
    render(<QueryProvider><CheckAPack investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('Choose an evidence pack'), new File(['PK'], 'p.zip'));
    const files = await screen.findByRole('region', {name: 'Every file against the list'});
    expect(within(files).getAllByRole('listitem')).toHaveLength(3 + 8);
    await user.click(within(files).getByRole('button', {name: '… 6 more, all as made'}));
    expect(within(files).getAllByRole('listitem')).toHaveLength(17);
  });

  it('says a refused file in words', async () => {
    mockApi({'POST /api/investigations/inv-1/evidence-pack/check': {status: 422, body: {detail: 'No MANIFEST.sha256 in it: not an evidence pack, or its list was taken out'}}});
    render(<QueryProvider><CheckAPack investigationId="inv-1"/></QueryProvider>);
    await userEvent.setup().upload(screen.getByLabelText('Choose an evidence pack'), new File(['x'], 'x.zip'));
    expect(await screen.findByRole('alert')).toHaveTextContent('No MANIFEST.sha256');
  });

  it('exports the check as a table', () => {
    const table = checkTable(RESULT);
    expect(table).toContain('Result\tnot as it was made');
    expect(table).toContain(`exhibits/007/page.png\tchanged\t${A}\t${B}`);
    expect(table).toContain('notes.txt\tnot in the list\t\t');
  });
});
