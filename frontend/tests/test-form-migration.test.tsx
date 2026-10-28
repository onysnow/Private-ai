// @vitest-environment jsdom
// Issue #41, the forms: the hand-wired boxes now on the shared layer (lib/forms.ts). An empty or bad field says what
// to do under it, is marked invalid and sends nothing; a save the server refuses shows under the field it names, or
// as the form's own message, and what the reporter typed stays.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {RecordPicker} from '../components/presentation/record-picker';
import {BeforeYouRun} from '../features/ai/before-you-run';
import {Watchlist} from '../features/corpus/watchlist';
import {MarksPanel} from '../features/marks/marks-panel';
import {NewCaseSetup} from '../features/new-case/new-case-setup';
import {StoryScreen} from '../features/story/story-screen';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';
import {tagsBody, watchlistBody} from '../test-support/page-routes';

const push = vi.fn();
vi.mock('next/navigation', () => ({useRouter: () => ({push}), usePathname: () => '/', useSearchParams: () => new URLSearchParams()}));
vi.mock('next/dynamic', () => ({default: () => () => <div data-testid="editor-stub"/>}));

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);
beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); push.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const refused = (field: string, msg: string) => ({status: 422, body: {detail: [{type: 'value_error', loc: ['body', field], msg, input: ''}]}});
const failed = (detail: string) => ({status: 500, body: {detail}});

describe('the watchlist box', () => {
  const LIST = 'GET /api/investigations/inv-1/watchlist';
  const ADD = 'POST /api/investigations/inv-1/watchlist';

  it('asks for a name before anything is sent', async () => {
    const api = mockApi({[LIST]: watchlistBody('inv-1')});
    wrap(<Watchlist investigationId="inv-1"/>);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name or search to watch'), '   ');
    await user.click(screen.getByRole('button', {name: 'Watch'}));
    expect(await screen.findByText('Type a name or a search to watch.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name or search to watch')).toHaveAttribute('aria-invalid', 'true');
    expect(api.calls(ADD)).toHaveLength(0);
    // Typing again takes the message away.
    await user.type(screen.getByLabelText('Name or search to watch'), 'Kestrel');
    await waitFor(() => expect(screen.queryByText('Type a name or a search to watch.')).not.toBeInTheDocument());
  });

  it('puts what the server refused under the field it names, and keeps what was typed', async () => {
    const api = mockApi({[LIST]: watchlistBody('inv-1'), [ADD]: refused('query', 'String should have at most 512 characters')});
    wrap(<Watchlist investigationId="inv-1"/>);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name or search to watch'), 'Zanzibar Trading');
    await user.click(screen.getByRole('button', {name: 'Watch'}));
    expect(await screen.findByText('String should have at most 512 characters')).toBeInTheDocument();
    expect(api.calls(ADD)).toHaveLength(1);
    expect(screen.getByLabelText('Name or search to watch')).toHaveValue('Zanzibar Trading');
    expect(screen.getByLabelText('Name or search to watch')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('starting a case', () => {
  it('asks for a name, and shows a failed start without losing the name', async () => {
    const api = mockApi({'GET /api/catalogue/areas': [], 'POST /api/investigations': failed('The database is busy')});
    wrap(<NewCaseSetup/>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Start the case'}));
    expect(await screen.findByText('Give the case a name.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', {name: 'Name'})).toHaveAttribute('aria-invalid', 'true');
    expect(api.calls('POST /api/investigations')).toHaveLength(0);

    await user.type(screen.getByRole('textbox', {name: 'Name'}), '  Harbour ');
    await user.click(screen.getByRole('button', {name: 'Start the case'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('The database is busy');
    expect(api.lastBody('POST /api/investigations')).toEqual({name: 'Harbour', question: null});
    expect(screen.getByRole('textbox', {name: 'Name'})).toHaveValue('  Harbour ');
    expect(push).not.toHaveBeenCalled();
  });
});

describe('a note in the marks panel', () => {
  const NOTE = 'POST /api/investigations/inv-1/notes';
  const routes = {
    'GET /api/investigations/inv-1/tags': tagsBody('inv-1'),
    'GET /api/investigations/inv-1/collections': {investigation_id: 'inv-1', collections: []},
    'GET /api/investigations/inv-1/notes': {investigation_id: 'inv-1', notes: []},
  };

  it('needs words, shows a failed save in its own form, and clears once kept', async () => {
    let fail = true;
    const api = mockApi({...routes, [NOTE]: () => (fail ? failed('Notes are read-only here')
      : {id: 'n-1', record_type: null, record_id: null, caption: null, chart_ref: null, text: 'Ask the registry', lead_id: null,
        created_at: '2026-10-19T09:00:00', updated_at: '2026-10-19T09:00:00'})});
    wrap(<MarksPanel investigationId="inv-1" target={null}/>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Add note'}));
    expect(await screen.findByText('Write the note first.')).toBeInTheDocument();
    expect(api.calls(NOTE)).toHaveLength(0);

    await user.type(screen.getByLabelText('New note'), 'Ask the registry');
    await user.click(screen.getByRole('button', {name: 'Add note'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Notes are read-only here');
    expect(screen.getByLabelText('New note')).toHaveValue('Ask the registry');

    fail = false;
    await user.click(screen.getByRole('button', {name: 'Add note'}));
    await waitFor(() => expect(screen.getByLabelText('New note')).toHaveValue(''));
    expect(api.lastBody(NOTE)).toEqual({text: 'Ask the registry'});
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks for a name for a new collection', async () => {
    const api = mockApi(routes);
    wrap(<MarksPanel investigationId="inv-1" target={null}/>);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Add collection'}));
    expect(await screen.findByText('Give the collection a name.')).toBeInTheDocument();
    expect(api.calls('POST /api/investigations/inv-1/collections')).toHaveLength(0);
  });
});

describe('the story screen', () => {
  const PATH = '/api/investigations/inv-1/story';
  const gate = (key: string, label: string) => ({key, label, state: 'open', detail: 'not recorded'});
  const STORY = {
    id: 's1', investigation_id: 'inv-1', thesis: 'Kestrel SA ended up with the harbour land', writeup_id: null, sections: [],
    counts: {claims: 0, shown: 0, disputed: 0, unshown: 0}, critical: [],
    gates: [gate('right_of_reply', 'Right of reply sent'), gate('legal_read', 'Legal read')],
    gates_passed: 0, sentences: {total: 0, uncited: 0}, ready: null, can_ready: false, unplaced: [],
  };

  it('records a gate only with who and the day', async () => {
    const api = mockApi({[`GET ${PATH}`]: STORY, [`PUT ${PATH}/gates`]: STORY});
    wrap(<StoryScreen investigationId="inv-1"/>);
    const user = userEvent.setup();
    const reply = (await screen.findByText('Right of reply sent')).closest('li')!;
    await user.click(within(reply).getByRole('button', {name: 'Record'}));
    await user.click(within(reply).getByRole('button', {name: 'Record'}));
    expect(await within(reply).findByText('Write who it was sent to.')).toBeInTheDocument();
    expect(within(reply).getByText('Pick the day.')).toBeInTheDocument();
    expect(within(reply).getByLabelText('On')).toHaveAttribute('aria-invalid', 'true');
    expect(api.calls(`PUT ${PATH}/gates`)).toHaveLength(0);

    await user.type(within(reply).getByRole('textbox', {name: 'Sent to'}), 'The press office');
    await user.type(within(reply).getByLabelText('On'), '2026-10-11');
    await user.click(within(reply).getByRole('button', {name: 'Record'}));
    await waitFor(() => expect(api.lastBody(`PUT ${PATH}/gates`)).toEqual({gate: 'right_of_reply', who: 'The press office', on: '2026-10-11'}));
    await waitFor(() => expect(within(reply).queryByRole('textbox', {name: 'Sent to'})).not.toBeInTheDocument());
  });

  it('shows a section the server would not add in its own form, once, with the title kept', async () => {
    const api = mockApi({[`GET ${PATH}`]: STORY, [`POST ${PATH}/sections`]: failed('The story is being restored')});
    wrap(<StoryScreen investigationId="inv-1"/>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Add section'}));
    expect(await screen.findByText('Write what the section will say.')).toBeInTheDocument();
    expect(api.calls(`POST ${PATH}/sections`)).toHaveLength(0);

    await user.type(screen.getByLabelText('A new section'), 'Who bought the land');
    await user.click(screen.getByRole('button', {name: 'Add section'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('The story is being restored');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByLabelText('A new section')).toHaveValue('Who bought the land');
  });
});

describe('the record picker', () => {
  it('asks for something to search for, and shows a failed search under the row', async () => {
    const api = mockApi({'GET /api/search': failed('Search is not ready')});
    wrap(<RecordPicker investigationId="inv-1" selected={[]} onChange={() => undefined}/>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Search'}));
    expect(await screen.findByText('Type something to search for.')).toBeInTheDocument();
    expect(screen.getByLabelText('Search records to add')).toHaveAttribute('aria-invalid', 'true');
    expect(api.calls('GET /api/search')).toHaveLength(0);

    await user.type(screen.getByLabelText('Search records to add'), 'registry{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Search is not ready');
    expect(api.lastUrl('GET /api/search').searchParams.get('q')).toBe('registry');
    expect(screen.getByLabelText('Search records to add')).toHaveValue('registry');
  });
});

describe('asking the case', () => {
  it('needs a question, and a theory when testing one', async () => {
    mockApi({'GET /api/investigations/inv-1/ai-runs': {runs: []}});
    wrap(<BeforeYouRun investigationId="inv-1"/>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Next: instructions and plan'}));
    expect(await screen.findByText('Write your question first.')).toBeInTheDocument();
    expect(screen.getByLabelText('Your question')).toHaveAttribute('aria-invalid', 'true');

    await user.click(screen.getByRole('radio', {name: 'Test a theory'}));
    await user.type(screen.getByLabelText('Your question'), 'Who controlled Fernhill?');
    await user.click(screen.getByRole('button', {name: 'Next: instructions and plan'}));
    expect(await screen.findByText('Write the theory to test.')).toBeInTheDocument();
    expect(screen.queryByText('Write your question first.')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'Ask the case'})).toBeInTheDocument();
  });
});
