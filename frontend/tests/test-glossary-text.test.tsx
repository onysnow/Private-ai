// @vitest-environment jsdom
// Hover cards for glossary terms (features/glossary/glossary-text.tsx): a term written in the app's text is marked
// the first time it appears, as a whole word; acronyms and the app's own names only as written. The card follows
// WCAG 1.4.13: it opens after a dwell (not on a pointer passing by) or at once on focus, the pointer can move into
// it and it stays while the pointer is on the term or the card, and Esc closes it. One card at a time.
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {CLOSE_GRACE_MS, GlossaryText, OPEN_DWELL_MS, buildTermIndex, findTerms} from '../features/glossary/glossary-text';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const hint = (term: string, definition: string, areas: string[], names: {text: string; exact: boolean}[], more: {related?: string[]; definitions?: number} = {}) =>
  ({term, definition, areas, names, related: more.related ?? [], definitions: more.definitions ?? 1});
const hints = [
  hint('Beneficial owner', 'The real person who owns or controls a company.', ['BO'], [{text: 'Beneficial owner', exact: false}]),
  hint('Nominee', 'Someone who holds a post or shares in name for another.', ['BO', 'ML'], [{text: 'Nominee', exact: false}], {related: ['Beneficial owner'], definitions: 2}),
  hint('PEP (politically exposed person)', 'Someone in a prominent public role.', ['CO'], [{text: 'PEP', exact: true}, {text: 'politically exposed person', exact: false}]),
  hint('Strong', 'The second level of a Red Flag.', ['APP'], [{text: 'Strong', exact: true}]),
];

beforeEach(() => connectGeneratedClient(new ApiClient('http://api.test')));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('findTerms', () => {
  const index = buildTermIndex(hints)!;
  const marked = (text: string, skip?: string) => findTerms(index, text, skip).filter(p => typeof p !== 'string').map(p => (p as {text: string}).text);

  it('marks whole words once each, in any case unless the name is exact', () => {
    expect(marked('The beneficial owner used a nominee; the nominee signed.')).toEqual(['beneficial owner', 'nominee']);
    expect(marked('Nominees and pep talks')).toEqual(['Nominees']);
    expect(marked('Nominated, PEPs')).toEqual(['PEPs']);
    expect(marked('A PEP, a Politically Exposed Person')).toEqual(['PEP']);
    expect(marked('a strong case; Strong level')).toEqual(['Strong']);
  });

  it('keeps every letter of the text and leaves out the term being defined', () => {
    const text = 'A nominee for the Beneficial owner.';
    expect(findTerms(index, text).map(p => (typeof p === 'string' ? p : p.text)).join('')).toBe(text);
    expect(marked(text, 'Nominee')).toEqual(['Beneficial owner']);
  });
});

describe('GlossaryText hover cards', () => {
  const renderText = async (text: string) => {
    mockApi({'GET /api/catalogue/terms': hints});
    render(<QueryProvider><p><GlossaryText text={text}/></p></QueryProvider>);
    return screen.findByRole('link', {name: 'nominee'});
  };

  it('reads the definition to screen readers and links to the full entry', async () => {
    const term = await renderText('Held through a nominee director.');
    expect(term).toHaveAttribute('href', '/glossary?q=Nominee');
    expect(term).toHaveAccessibleDescription(/Someone who holds a post/);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens only after a dwell, stays while the pointer is in the card, and closes after the pointer leaves both', async () => {
    const term = await renderText('Held through a nominee director.');
    vi.useFakeTimers();
    fireEvent.mouseEnter(term);
    act(() => { vi.advanceTimersByTime(OPEN_DWELL_MS - 50); });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseLeave(term);
    act(() => { vi.advanceTimersByTime(OPEN_DWELL_MS); });
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(term);
    act(() => { vi.advanceTimersByTime(OPEN_DWELL_MS); });
    const card = screen.getByRole('tooltip');
    expect(card).toHaveTextContent('Nominee');
    expect(card).toHaveTextContent('Someone who holds a post or shares in name for another.');
    expect(card).toHaveTextContent('Defined in 2 areas');
    expect(card).toHaveTextContent('Related: Beneficial owner');
    expect(card).toHaveTextContent('↵ open · Esc');

    fireEvent.mouseLeave(term);
    fireEvent.mouseEnter(card);
    act(() => { vi.advanceTimersByTime(CLOSE_GRACE_MS * 3); });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.mouseLeave(card);
    act(() => { vi.advanceTimersByTime(CLOSE_GRACE_MS + 10); });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens at once on keyboard focus and closes on Esc', async () => {
    const term = await renderText('Held through a nominee director.');
    act(() => term.focus());
    expect(screen.getByRole('tooltip')).toHaveTextContent('Nominee');
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows one card at a time', async () => {
    mockApi({'GET /api/catalogue/terms': hints});
    render(<QueryProvider><p><GlossaryText text="A nominee for the beneficial owner."/></p></QueryProvider>);
    const nominee = await screen.findByRole('link', {name: 'nominee'});
    const owner = screen.getByRole('link', {name: 'beneficial owner'});
    act(() => nominee.focus());
    act(() => owner.focus());
    expect(screen.getAllByRole('tooltip')).toHaveLength(1);
    expect(screen.getByRole('tooltip')).toHaveTextContent('The real person who owns or controls a company.');
  });

  it('is plain text when the terms cannot be loaded', async () => {
    const api = mockApi({});
    render(<QueryProvider><GlossaryText text="nominee director"/></QueryProvider>);
    await vi.waitFor(() => expect(api.calls('GET /api/catalogue/terms').length).toBeGreaterThan(0));
    expect(screen.getByText('nominee director')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
