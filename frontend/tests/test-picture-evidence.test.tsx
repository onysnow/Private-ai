// @vitest-environment jsdom
// A picture as evidence (features/documents/picture-evidence.tsx): the
// uploaded picture is shown, and its caption and the date it was taken are
// saved as an evidence record pointing at it.
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {isPicture, PictureEvidence} from '../features/documents/picture-evidence';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const picture = () => new Response(new Uint8Array([1, 2, 3]), {headers: {'content-type': 'image/png'}});

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  vi.stubGlobal('URL', Object.assign(URL, {createObjectURL: vi.fn(() => 'blob:picture'), revokeObjectURL: vi.fn()}));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('picture evidence', () => {
  it('knows a picture by its name', () => {
    expect(['hall.PNG', 'a.jpeg', 'b.jpg'].map(isPicture)).toEqual([true, true, true]);
    expect(['memo.pdf', 'scan.tiff', 'c.webp'].map(isPicture)).toEqual([false, false, false]);
  });

  it('shows the picture and saves its caption and the date it was taken', async () => {
    const api = mockApi({
      'GET /api/documents/doc-1/picture': picture,
      'POST /api/evidence': {status: 200, body: {id: 'ev-1', source_id: 'src-1', quote: 'The market hall, intact', locator: 'the whole picture',
        notes: null, document_id: 'doc-1', captured_on: '2023-10'}},
    });
    const user = userEvent.setup();
    render(<QueryProvider><PictureEvidence investigationId="inv-1" documentId="doc-1" sourceId="src-1" filename="hall.png"/></QueryProvider>);
    expect(await screen.findByAltText('The uploaded picture hall.png')).toHaveAttribute('src', 'blob:picture');
    const save = screen.getByRole('button', {name: 'Save as picture evidence'});
    expect(save).toBeDisabled();                                   // a caption first
    await user.type(screen.getByLabelText(/Caption/), 'The market hall, intact');
    await user.type(screen.getByLabelText(/Date taken/), '3 Oct 2023');
    expect(screen.getByRole('alert')).toHaveTextContent('a year (2023), a month (2023-11) or a day (2023-11-14)');
    expect(save).toBeDisabled();
    await user.clear(screen.getByLabelText(/Date taken/));
    await user.type(screen.getByLabelText(/Date taken/), '2023-10');
    await user.click(save);
    expect(await screen.findByText(/Saved as evidence, taken 2023-10/)).toBeInTheDocument();
    expect(api.lastBody('POST /api/evidence')).toEqual({source_id: 'src-1', document_id: 'doc-1', quote: 'The market hall, intact',
      locator: 'the whole picture', captured_on: '2023-10'});
  });
});
