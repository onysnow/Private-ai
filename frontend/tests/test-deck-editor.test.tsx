// @vitest-environment jsdom
// Decks (features/decks/deck-editor.tsx; mockups DECK_1 and DECK_2): a deck made from the story, each slide's check
// badge, a one-click fix sent back with Save, and Present warning about a draft slide before it starts (never blocking).
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {DecksScreen, applyFix} from '../features/decks/deck-editor';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const LONG = 'Kestrel SA was told the price before the tender closed and bid exactly that';
const DECK = {id: 'd1', investigation_id: 'inv-1', title: 'Who bought the harbour land', slide_count: 2, style: {theme: 'dark-academia', fonts: 'default'},
  source_ai_candidate_id: null, created_by: 'local-owner', created_at: '2026-10-29T08:00:00', updated_at: '2026-10-29T08:00:00',
  slides: [{kind: 'title', heading: 'Who bought the harbour land', bullets: [], evidence: [], notes: '', visual: null, prose: '', made_with: {}},
    {kind: 'content', heading: 'The sale', bullets: [LONG], evidence: [{record_type: 'claim', record_id: 'c2'}], notes: '', visual: null, prose: '', made_with: {c2: 'unverified'}}]};
const CHECKS = {deck_id: 'd1', drafts: [2], changed: [], slides: [{slide: 1, problems: [], draft: false, changed: false},
  {slide: 2, draft: true, changed: false, problems: [{kind: 'draft', text: 'Cites a claim not yet shown (not yet shown): “Kestrel SA…”', claim_id: 'c2'},
    {kind: '7x7', text: 'Line 1 has 15 words: at most 7 (7×7)', fix: 'words_to_notes', line: 1}]}]};
const THEME = {cover_line: '2B3439', cover_text: 'ECE3D2', cover_muted: 'B5A88F', cover_accent: 'B98D34', accent_text: '8A6420', panel: 'EDE4D3', rule: 'D9CDB6',
  text: '1F1B16', muted: '6B5B44', bar_muted: 'CDBFA6', heading_font: 'Georgia', body_font: 'Calibri', palette: []};
const CATALOG = {defaults: {theme: 'dark_academia', fonts: 'theme'}, font_pairs: [{id: 'theme', label: 'Theme default', heading: '', body: ''}],
  themes: [{...THEME, id: 'dark_academia', label: 'Dark Academia', description: 'Warm, archival.', cover_bg: '141B1F', accent: 'B98D34', alert: '672C1A', page: 'F7F2E8'},
    {...THEME, id: 'newsprint', label: 'Newsprint', description: 'White pages, black type, a red accent.', cover_bg: '111111', accent: 'C8102E', alert: '8B0A1E', page: 'FFFFFF'}],
  visual_presets: {bar: [], figures: [], timeline: []}, visual_options: {bar: {}, figures: {}, timeline: {}}, chart_families: {}, chart_options: {}, chart_presets: {}};
const CLAIMS = [{id: 'c2', investigation_id: 'inv-1', text: LONG, status: 'unverified'}];
// A story as GET /story answers it; only the thesis and the sections matter to the deck screen.
const storyOf = (thesis: string, sections: unknown[]) => ({investigation_id: 'inv-1', thesis, sections, can_ready: false, critical: [], gates: [], gates_passed: 0,
  counts: {claims: 0, disputed: 0, shown: 0, unshown: 0}, sentences: {total: 0, uncited: 0}, unplaced: []});

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('decks', () => {
  it('moves a long line to the notes and keeps a changed claim once read', () => {
    const slide = {heading: 'The sale', bullets: [LONG], evidence: [], notes: 'Earlier note'};
    const fixed = applyFix(slide, {kind: '7x7', text: '', fix: 'words_to_notes', line: 1}, () => undefined);
    expect(fixed.bullets).toEqual(['Kestrel SA was told the price before…']);
    expect(fixed.notes).toBe(`Earlier note\n${LONG}`);
    const read = applyFix({...slide, made_with: {c1: 'supported'}}, {kind: 'changed', text: '', fix: 'accept_change', claim_id: 'c1'}, () => 'disputed');
    expect(read.made_with).toEqual({c1: 'disputed'});
  });

  it('shows each slide’s badge, applies a fix, saves it, and warns before presenting a draft', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/decks': {decks: [DECK]}, 'GET /api/decks/d1/checks': CHECKS,
      'GET /api/investigations/inv-1/claims': CLAIMS, 'PATCH /api/decks/d1': DECK});
    render(<QueryProvider><DecksScreen investigationId="inv-1"/></QueryProvider>);
    const strip = await screen.findByRole('navigation', {name: 'Slides'});
    expect(await within(strip).findByRole('button', {name: 'Slide 2: The sale, 2 to look at'})).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(strip).getByRole('button', {name: /Slide 2: The sale/}));
    expect(screen.getByLabelText('Draft: cites a claim not yet shown')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Move the rest to notes'}));
    await user.click(screen.getByRole('button', {name: 'Save'}));
    const sent = api.lastBody('PATCH /api/decks/d1') as {slides_json: Array<{bullets: string[]; notes: string}>};
    expect(sent.slides_json[1].bullets).toEqual(['Kestrel SA was told the price before…']);
    expect(sent.slides_json[1].notes).toBe(LONG);

    await user.click(screen.getByRole('button', {name: /^Present/}));
    const before = screen.getByRole('alert');
    expect(within(before).getByText(/Slide 2: cites a claim not yet shown \(Draft\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Present anyway'}));
    expect(screen.getByText(/If they ask · 1 claim behind this slide/)).toBeInTheDocument();
  });

  it('takes its keys only on screen, never while typing or with Ctrl, Cmd or Alt, and Present likewise', async () => {
    mockApi({'GET /api/investigations/inv-1/decks': {decks: [DECK]}, 'GET /api/decks/d1/checks': CHECKS, 'GET /api/investigations/inv-1/claims': CLAIMS});
    render(<QueryProvider><section id="decks"><DecksScreen investigationId="inv-1"/></section><div contentEditable="true" data-testid="writeup"/></QueryProvider>);
    const strip = await screen.findByRole('navigation', {name: 'Slides'});
    await within(strip).findByRole('button', {name: /Slide 2: The sale/});
    const current = () => within(strip).getAllByRole('button', {hidden: true}).findIndex(b => b.getAttribute('aria-current') === 'true');
    expect(current()).toBe(0);
    fireEvent.keyDown(screen.getByTestId('writeup'), {key: 'j'});
    fireEvent.keyDown(window, {key: 'p', ctrlKey: true});
    fireEvent.keyDown(window, {key: 'j', altKey: true});
    expect(current()).toBe(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    (document.getElementById('decks') as HTMLElement).hidden = true;
    fireEvent.keyDown(window, {key: 'j'});
    fireEvent.keyDown(window, {key: 'p'});
    expect(current()).toBe(0);
    expect(screen.queryByRole('dialog', {hidden: true})).toBeNull();
    (document.getElementById('decks') as HTMLElement).hidden = false;
    fireEvent.keyDown(window, {key: 'j'});
    expect(current()).toBe(1);
    fireEvent.keyDown(window, {key: 'p'});
    expect(screen.getByRole('dialog', {name: /^Presenting/})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Present anyway'}));
    expect(screen.getByText(/Slide 2 of 2/)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('writeup'), {key: 'ArrowLeft'});
    fireEvent.keyDown(window, {key: 'ArrowLeft', metaKey: true});
    expect(screen.getByText(/Slide 2 of 2/)).toBeInTheDocument();
    const esc = new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true});
    window.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog', {name: /^Presenting/})).toBeNull());
  });

  it('shows what a deck from the story would hold when there is none, and makes it', async () => {
    const story = storyOf('Who bought the harbour land', [
      {id: 's1', title: 'The sale', position: 0, status: 'unshown', shown: 1, total: 2, claims: []},
      {id: 's2', title: 'The money', position: 1, status: 'shown', shown: 3, total: 3, claims: []}]);
    const api = mockApi({'GET /api/investigations/inv-1/decks': {decks: []}, 'GET /api/investigations/inv-1/story': story,
      'POST /api/investigations/inv-1/decks': {status: 201, body: DECK}});
    render(<QueryProvider><DecksScreen investigationId="inv-1"/></QueryProvider>);
    const empty = await screen.findByRole('region', {name: 'No deck yet'});
    // A title slide and a slide per part; the part with a claim not yet shown would be a draft.
    const fromStory = await within(empty).findByRole('button', {name: 'New deck from the story: 3 slides'});
    expect(fromStory.querySelectorAll('.dk-ghost')).toHaveLength(3);
    expect(fromStory.querySelectorAll('.dk-ghost.draft')).toHaveLength(1);
    expect(within(fromStory).getByText('claims cited').parentElement).toHaveTextContent('5 claims cited');
    await userEvent.setup().click(fromStory);
    expect(api.lastBody('POST /api/investigations/inv-1/decks')).toEqual({source: 'story', title: ''});
  });

  it('cannot make a deck from a story with no parts, but can start blank', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/decks': {decks: []}, 'GET /api/investigations/inv-1/story': storyOf('', []),
      'POST /api/investigations/inv-1/decks': {status: 201, body: DECK}});
    render(<QueryProvider><DecksScreen investigationId="inv-1"/></QueryProvider>);
    expect(await screen.findByRole('button', {name: /New deck from the story/})).toBeDisabled();
    await userEvent.setup().click(screen.getByRole('button', {name: /Blank deck/}));
    expect(api.lastBody('POST /api/investigations/inv-1/decks')).toEqual({source: 'blank', title: ''});
  });

  it('names where each claim comes from and where the slide was made from, and fixes every long line at once', async () => {
    const two = {...DECK, slides: [DECK.slides[0], {...DECK.slides[1], bullets: [LONG, `${LONG} again`]}]};
    const checks = {...CHECKS, slides: [CHECKS.slides[0], {...CHECKS.slides[1], problems: [CHECKS.slides[1].problems[0],
      {kind: '7x7', text: 'Line 1 has 15 words: at most 7 (7×7)', fix: 'words_to_notes', line: 1},
      {kind: '7x7', text: 'Line 2 has 16 words: at most 7 (7×7)', fix: 'words_to_notes', line: 2}]}]};
    const story = storyOf('', [{id: 's1', title: 'The sale', position: 0, status: 'unshown', shown: 0, total: 1,
      claims: [{id: 'c2', text: LONG, status: 'unverified', state: 'unshown', single_source: true, evidence: [{id: 'e1', stance: 'supports', label: 'Council minutes', locator: 'page 4', quote: ''}]}]}]);
    const api = mockApi({'GET /api/investigations/inv-1/decks': {decks: [two]}, 'GET /api/decks/d1/checks': checks,
      'GET /api/investigations/inv-1/claims': CLAIMS, 'GET /api/investigations/inv-1/story': story, 'PATCH /api/decks/d1': two});
    render(<QueryProvider><DecksScreen investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await within(await screen.findByRole('navigation', {name: 'Slides'})).findByRole('button', {name: /Slide 2: The sale/}));
    const side = screen.getByRole('complementary', {name: 'This slide'});
    expect((await within(side).findAllByText('Council minutes · page 4'))[0]).toBeInTheDocument();
    expect(within(side).getByText(/Story tree · part “The sale”/)).toBeInTheDocument();
    expect(within(side).getByText('2 lines over 7 words')).toBeInTheDocument();
    await user.click(within(side).getByRole('button', {name: 'Move the rest of each to notes'}));
    await user.click(screen.getByRole('button', {name: 'Save'}));
    const sent = api.lastBody('PATCH /api/decks/d1') as {slides_json: Array<{bullets: string[]; notes: string}>};
    expect(sent.slides_json[1].bullets).toEqual(['Kestrel SA was told the price before…', 'Kestrel SA was told the price before…']);
    expect(sent.slides_json[1].notes.split('\n').sort()).toEqual([LONG, `${LONG} again`].sort());
  });

  it('restyles the whole deck from Style and exports the handout PDF, saving first', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/decks': {decks: [DECK]}, 'GET /api/decks/d1/checks': CHECKS, 'GET /api/presentation-styles': CATALOG,
      'GET /api/investigations/inv-1/claims': CLAIMS, 'PATCH /api/decks/d1': DECK,
      'GET /api/decks/d1/export.pdf': {status: 200, body: '%PDF-1.7', headers: {'content-type': 'application/pdf'}}});
    vi.stubGlobal('URL', Object.assign(URL, {createObjectURL: () => 'blob:deck', revokeObjectURL: () => undefined}));
    render(<QueryProvider><DecksScreen investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Style'}));
    const themes = await screen.findByRole('radiogroup', {name: 'Theme'});
    expect(within(themes).getByRole('radio', {name: /Dark Academia/})).toHaveAttribute('aria-checked', 'true');
    await user.click(within(themes).getByRole('radio', {name: /Newsprint/}));
    expect(within(themes).getByRole('radio', {name: /Newsprint/})).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/light paper version of the theme/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Export ▾'}));
    await user.click(screen.getByRole('menuitem', {name: /PDF handout/}));
    expect((api.lastBody('PATCH /api/decks/d1') as {style_json: {theme: string}}).style_json.theme).toBe('newsprint');
    await waitFor(() => expect(api.calls('GET /api/decks/d1/export.pdf')).toHaveLength(1));
    expect(api.calls('GET /api/decks/d1/export.pdf')[0].url.searchParams.get('handout')).toBe('true');
    await user.click(screen.getByRole('button', {name: 'Close style'}));
    expect(screen.getByRole('complementary', {name: 'This slide'})).toBeInTheDocument();
  });
});
