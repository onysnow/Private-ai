// @vitest-environment jsdom
// Spreadsheets to entities (features/documents/table-mapper.tsx; backend
// app/services/table_mappings.py): the reporter maps columns to entities and
// links, previews the first rows, and proposes everything for review. The
// request is a FollowTheMoney mapping.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {buildMapping, isTable, linkKeys, nextName, TableMapper} from '../features/documents/table-mapper';
import type {EntityDraft, LinkDraft} from '../features/documents/table-mapper';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const TABLE = 'GET /api/documents/doc-1/table';
const SCHEMAS = 'GET /api/table-mapping/schemas';
const PREVIEW = 'POST /api/documents/doc-1/table-mappings/preview';
const RUN = 'POST /api/documents/doc-1/table-mappings';
const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => connectGeneratedClient(new ApiClient('http://api.test')));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const prop = (name: string, label: string, type = 'string') => ({name, label, type});
const SCHEMA_BODY = {
  entities: [
    {name: 'Person', label: 'Person', properties: [prop('name', 'Name', 'name'), prop('nationality', 'Nationality', 'country')]},
    {name: 'Company', label: 'Company', properties: [prop('name', 'Name', 'name'), prop('registrationNumber', 'Registration number', 'identifier')]},
  ],
  links: [{name: 'Payment', label: 'Payment', source_prop: 'payer', target_prop: 'beneficiary', source_label: 'Payer', target_label: 'Beneficiary',
    properties: [prop('amount', 'Amount', 'number'), prop('date', 'Date', 'date')]}],
};
const TABLE_BODY = {
  document_id: 'doc-1', filename: 'ledger.csv', sheets: [], sheet: null, columns: ['Date', 'Payer', 'Payee', 'Amount'],
  row_count: 2, truncated: false, rows: [
    {number: 2, cells: {Date: '2024-03-03', Payer: 'Meridian Holdings Ltd', Payee: 'Bellcastle', Amount: '2400000'}},
    {number: 3, cells: {Date: '14/03/2024', Payer: 'Meridian Holdings Ltd', Payee: 'Orrin', Amount: '150000'}},
  ],
};
const mapping = {id: 'map-1', document_id: 'doc-1', sheet: null, query: {}, created_by: null, created_at: '2026-10-03T09:00:00',
  rows_read: 2, entities_proposed: 3, links_proposed: 2};

describe('TableMapper', () => {
  it('maps columns to two companies and a payment, previews and proposes them', async () => {
    const onProposed = vi.fn();
    const api = mockApi({
      [TABLE]: TABLE_BODY, [SCHEMAS]: SCHEMA_BODY,
      [PREVIEW]: {document_id: 'doc-1', sheet: null, rows: [
        {number: 2, cells: TABLE_BODY.rows[0].cells, problems: [], entities: [
          {name: 'company 1', schema: 'Company', caption: 'Meridian Holdings Ltd', properties: {}},
          {name: 'payment 1', schema: 'Payment', caption: 'Meridian Holdings Ltd → Bellcastle', properties: {amount: ['2400000']}, source: 'Meridian Holdings Ltd', target: 'Bellcastle'}]},
        {number: 3, cells: TABLE_BODY.rows[1].cells, problems: ['“14/03/2024” is not a valid date; it was left out'], entities: []},
      ]},
      [RUN]: {mapping, entities_proposed: 3, links_proposed: 2, already_proposed: 0, skipped: [{row: 3, reason: '“14/03/2024” is not a valid date; it was left out'}]},
    });
    wrap(<TableMapper documentId="doc-1" onProposed={onProposed}/>);
    const user = userEvent.setup();
    const first = within(await screen.findByRole('table', {name: 'First rows'}));
    expect(first.getByText('Meridian Holdings Ltd', {selector: 'tr:first-child td'})).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Add a link'})).toBeNull();
    expect(screen.getByRole('button', {name: 'Propose for review'})).toBeDisabled();

    await user.click(screen.getByRole('button', {name: 'Add an entity'}));
    await user.selectOptions(screen.getByLabelText('company 1: name column'), 'Payer');
    await user.click(screen.getByRole('button', {name: 'Add an entity'}));
    await user.selectOptions(screen.getByLabelText('company 2: name column'), 'Payee');
    await user.click(screen.getByRole('button', {name: 'Add a link'}));
    await user.selectOptions(screen.getByLabelText('payment 1: Payer'), 'company 1');
    await user.selectOptions(screen.getByLabelText('payment 1: Beneficiary'), 'company 2');
    const link = within(screen.getByLabelText('Link payment 1'));
    await user.click(link.getByRole('button', {name: 'Add a property'}));
    await user.selectOptions(screen.getByLabelText('payment 1: property 1'), 'amount');
    await user.selectOptions(screen.getByLabelText('payment 1: column for property 1'), 'Amount');
    await user.click(link.getByRole('button', {name: 'Add a property'}));
    await user.selectOptions(screen.getByLabelText('payment 1: property 2'), 'date');
    await user.selectOptions(screen.getByLabelText('payment 1: column for property 2'), 'Date');
    await user.type(screen.getByLabelText('payment 1: date format for property 2'), '%Y-%m-%d');

    await user.click(screen.getByRole('button', {name: 'Preview the first rows'}));
    const preview = within(await screen.findByRole('list', {name: 'Preview'}));
    expect(preview.getByText('Meridian Holdings Ltd (Company) · Meridian Holdings Ltd → Bellcastle (Payment)')).toBeInTheDocument();
    expect(preview.getByText('“14/03/2024” is not a valid date; it was left out')).toBeInTheDocument();
    expect(api.lastBody(PREVIEW)).toEqual({entities: {
      'company 1': {schema: 'Company', keys: ['Payer'], properties: {name: {column: 'Payer'}}},
      'company 2': {schema: 'Company', keys: ['Payee'], properties: {name: {column: 'Payee'}}},
      'payment 1': {schema: 'Payment', keys: ['Payer', 'Payee', 'Amount', 'Date'], properties: {
        amount: {column: 'Amount'}, date: {column: 'Date', format: '%Y-%m-%d'},
        payer: {entity: 'company 1'}, beneficiary: {entity: 'company 2'}}},
    }});

    await user.click(screen.getByRole('button', {name: 'Propose for review'}));
    expect(await screen.findByText('Proposed 3 entities and 2 link(s) to review.')).toBeInTheDocument();
    expect(screen.getByText('1 value(s) or row(s) left out')).toBeInTheDocument();
    expect(onProposed).toHaveBeenCalledTimes(1);
    expect(api.lastBody(RUN)).toEqual(api.lastBody(PREVIEW));
    expect(api.unmatched()).toEqual([]);
  });

  it('shows why a file cannot be read as a table, and a refused mapping in the server’s words', async () => {
    mockApi({[TABLE]: {status: 400, body: {detail: 'Only CSV, TSV and XLSX files can be mapped to entities'}}, [SCHEMAS]: SCHEMA_BODY});
    wrap(<TableMapper documentId="doc-1"/>);
    expect(await screen.findByText(/^Only CSV, TSV and XLSX files can be mapped to entities/)).toBeInTheDocument();
    cleanup();

    mockApi({[TABLE]: TABLE_BODY, [SCHEMAS]: SCHEMA_BODY, [RUN]: {status: 400, body: {detail: 'The sheet has more than 5000 rows'}}});
    wrap(<TableMapper documentId="doc-1"/>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Add an entity'}));
    await user.selectOptions(screen.getByLabelText('company 1: name column'), 'Payer');
    await user.click(screen.getByRole('button', {name: 'Propose for review'}));
    expect(await screen.findByText(/^The sheet has more than 5000 rows/)).toBeInTheDocument();
  });

  it('chooses a sheet of a workbook', async () => {
    const api = mockApi({[TABLE]: {...TABLE_BODY, filename: 'ledger.xlsx', sheets: ['Notes', 'Payments'], sheet: 'Notes'}, [SCHEMAS]: SCHEMA_BODY});
    wrap(<TableMapper documentId="doc-1"/>);
    await userEvent.setup().selectOptions(await screen.findByLabelText('Sheet'), 'Payments');
    expect(api.lastUrl(TABLE).searchParams.get('sheet')).toBe('Payments');
  });
});

describe('the mapping it writes', () => {
  const company = (name: string, nameColumn: string, keys: string[] | null = null): EntityDraft => ({name, schema: 'Company', nameColumn, keys, properties: []});
  const payment: LinkDraft = {name: 'payment 1', schema: 'Payment', source: 'company 1', target: 'company 2', keys: null,
    properties: [{prop: 'amount', column: 'Amount'}, {prop: '', column: 'Date'}]};

  it('keys an entity on its name column and a link on every column it reads, unless the reporter chose', () => {
    const entities = [company('company 1', 'Payer'), company('company 2', 'Payee', ['Payee', 'Date'])];
    expect(linkKeys(payment, entities)).toEqual(['Payer', 'Payee', 'Amount', 'Date']);
    expect(linkKeys({...payment, keys: ['Date']}, entities)).toEqual(['Date']);
    const body = buildMapping(entities, [payment], SCHEMA_BODY.links, 'Payments');
    expect(body.sheet).toBe('Payments');
    expect(body.entities['company 2'].keys).toEqual(['Payee', 'Date']);
    expect(body.entities['payment 1'].properties).toEqual({amount: {column: 'Amount'}, payer: {entity: 'company 1'}, beneficiary: {entity: 'company 2'}});
    expect(body.entities['payment 1'].payment_kind_column).toBeUndefined();
  });

  it('sends the column a payment\'s kind is read from, and only for a payment', () => {
    const entities = [company('company 1', 'Payer'), company('company 2', 'Payee')];
    const kinded = buildMapping(entities, [{...payment, kindColumn: 'Type'}], SCHEMA_BODY.links, null);
    expect(kinded.entities['payment 1'].payment_kind_column).toBe('Type');
    // The kind is not part of what makes rows one payment.
    expect(kinded.entities['payment 1'].keys).toEqual(['Payer', 'Payee', 'Amount', 'Date']);
    const ownership = {...SCHEMA_BODY.links[0], name: 'Ownership', label: 'Ownership', source_prop: 'owner', target_prop: 'asset', properties: []};
    const owner = buildMapping(entities, [{...payment, schema: 'Ownership', kindColumn: 'Type', properties: []}], [ownership], null);
    expect(owner.entities['payment 1'].schema).toBe('Ownership');
    expect(owner.entities['payment 1'].payment_kind_column).toBeUndefined();
  });

  it('names entities readably and knows a table by its file name', () => {
    expect(nextName('PublicBody', ['public body 1'])).toBe('public body 2');
    expect(isTable('Ledger.XLSX')).toBe(true);
    expect(isTable('ledger.pdf')).toBe(false);
  });
});
