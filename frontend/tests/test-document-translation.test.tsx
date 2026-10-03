// @vitest-environment jsdom
// A document's machine translation (features/documents/document-translation.tsx;
// backend app/services/openaleph_translation.py).
import {cleanup, render, screen, within} from '@testing-library/react';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {DocumentTranslation, languagePair} from '../features/documents/document-translation';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const ROUTE = 'GET /api/documents/doc-1/translation';
const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);
const body = (overrides: Record<string, unknown> = {}) => ({
  document_id: 'doc-1', state: 'translated', detail: null, detected_languages: ['deu'], translated_language: 'eng', parts: [
    {locator: 'page 1', page_number: 1, original: 'Die Zahlung wurde freigegeben.', translated: 'The payment was released.'},
    {locator: 'page 2', page_number: 2, original: 'Niemand hat widersprochen.', translated: null},
  ], ...overrides});

beforeEach(() => connectGeneratedClient(new ApiClient('http://api.test')));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('DocumentTranslation', () => {
  it('shows each page beside its translation, labelled as machine translation', async () => {
    mockApi({[ROUTE]: body()});
    wrap(<DocumentTranslation documentId="doc-1"/>);
    const table = within(await screen.findByRole('table', {name: 'Original and translation'}));
    expect(table.getByText('The payment was released.')).toBeInTheDocument();
    expect(table.getByText('Not translated')).toBeInTheDocument();
    expect(screen.getByText('deu → eng')).toBeInTheDocument();
    expect(screen.getByText(/quotes and evidence come from the original/)).toBeInTheDocument();
  });

  it('says why there is no translation', async () => {
    mockApi({[ROUTE]: body({state: 'not_translated', detail: 'OpenAleph has no translation of this document.', parts: []})});
    wrap(<DocumentTranslation documentId="doc-1"/>);
    expect(await screen.findByText('OpenAleph has no translation of this document.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('names the languages it knows', () => {
    expect(languagePair([], null)).toBe('unknown language');
    expect(languagePair(['deu', 'fra'], 'eng')).toBe('deu, fra → eng');
  });
});
