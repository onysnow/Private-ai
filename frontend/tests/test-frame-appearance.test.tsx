// @vitest-environment jsdom
// The app frame (components/frame/app-frame.tsx) and Settings › Appearance (features/appearance): the breadcrumb is
// always there; the left edge opens on its handle or the [ key (not while typing); ⌘K opens the command palette,
// which offers a search of the case and every place; a theme can be tried for the session, then kept or dropped;
// status chips always carry a word.
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {AppFrame} from '../components/frame/app-frame';
import {LevelChip, StatusChip} from '../components/status';
import {AppearancePanel, TryingBar} from '../features/appearance/appearance-panel';
import {currentAppearance, keepAppearance, keptAppearance, tryTheme} from '../lib/theme';
import {setSingleKeys} from '../lib/shortcuts';
import {useWorkbenchStore} from '../lib/workbench-store';
import {QueryProvider} from '../lib/query-client';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {mockApi} from '../test-support/mock-api';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({push, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn()}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/settings',
}));

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); push.mockReset(); });
afterEach(() => cleanup());

describe('theme storage', () => {
  it('keeps a theme, tries another for the session only, and drops the trial', () => {
    keepAppearance({theme: 'archive'});
    expect(document.documentElement.dataset.theme).toBe('archive');
    tryTheme('rain-noir');
    expect(currentAppearance().theme).toBe('rain-noir');
    expect(keptAppearance().theme).toBe('archive');
    expect(document.documentElement.dataset.theme).toBe('rain-noir');
    tryTheme(null);
    expect(document.documentElement.dataset.theme).toBe('archive');
  });

  it('ignores unknown or unready values', () => {
    window.localStorage.setItem('pai:appearance', JSON.stringify({theme: 'neon-pink', format: 'desk', effects: 'loud'}));
    expect(keptAppearance()).toEqual({theme: 'case-night', effects: 'full', motion: 'normal', format: 'board', off: ['neon'], custom: null});
  });
});

describe('Settings › Appearance', () => {
  it('tries a theme by choosing its card, shows the bar, and keeps it', async () => {
    connectGeneratedClient(new ApiClient('http://api.test'));
    mockApi({'GET /api/investigations': []});
    render(<QueryProvider><AppearancePanel/><TryingBar/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', {name: 'Rain Noir theme'}));
    const bar = screen.getByRole('status');
    expect(bar).toHaveTextContent('Trying Rain Noir · nothing is saved until you keep it');
    expect(within(bar).getByRole('button', {name: /Go back to Case Night/})).toBeInTheDocument();
    await user.click(within(bar).getByRole('button', {name: 'Keep Rain Noir'}));
    expect(keptAppearance().theme).toBe('rain-noir');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('moves through the themes with arrows, previewing each, and keeps one with K', async () => {
    connectGeneratedClient(new ApiClient('http://api.test'));
    mockApi({'GET /api/investigations': []});
    render(<QueryProvider><AppearancePanel/></QueryProvider>);
    const user = userEvent.setup();
    screen.getByRole('radio', {name: /Case Night theme/}).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', {name: 'Rain Noir theme'})).toHaveFocus();
    expect(screen.getByText('Lowest text pair 5.90:1 · AA').closest('dl')).toHaveAttribute('aria-label', 'Rain Noir in four facts');
    await user.keyboard('k');
    expect(keptAppearance().theme).toBe('rain-noir');
  });

  it('goes back from a trial with Esc', async () => {
    connectGeneratedClient(new ApiClient('http://api.test'));
    mockApi({'GET /api/investigations': []});
    render(<QueryProvider><AppearancePanel/><TryingBar/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', {name: 'Archive theme'}));
    expect(screen.getByRole('status')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('status')).toBeNull();
    expect(keptAppearance().theme).toBe('case-night');
  });

  it('turns calm motion, effects and a named effect on and off', async () => {
    connectGeneratedClient(new ApiClient('http://api.test'));
    mockApi({'GET /api/investigations': []});
    render(<QueryProvider><AppearancePanel/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('switch', {name: /Calm motion/}));
    expect(document.documentElement.dataset.motion).toBe('calm');
    await user.click(screen.getByRole('switch', {name: /Film grain/}));
    expect(document.documentElement.dataset.fxOff).toBe('grain neon');
    expect(screen.getByRole('switch', {name: /Rain on the case-home pane/})).toBeDisabled();
    await user.click(screen.getByRole('radio', {name: 'Off'}));
    expect(document.documentElement.dataset.effects).toBe('off');
    expect(screen.getByRole('switch', {name: /Film grain/})).toBeDisabled();
    expect(screen.getByRole('radio', {name: /Desk/})).toBeDisabled();
  });

  it('shows the four facts of the theme pointed at', async () => {
    connectGeneratedClient(new ApiClient('http://api.test'));
    mockApi({'GET /api/investigations': []});
    render(<QueryProvider><AppearancePanel/></QueryProvider>);
    await userEvent.setup().hover(screen.getByRole('radio', {name: 'Indigo Clarity theme'}));
    const facts = screen.getByText('Lowest text pair 6.39:1 · AA').closest('dl')!;
    expect(facts).toHaveAttribute('aria-label', 'Indigo Clarity in four facts');
    expect(within(facts).getByText('Inclusive Sans · Lexend · Plex Mono')).toBeInTheDocument();
    expect(await screen.findByText('Open or start a case to see its Case home here in each theme.')).toBeInTheDocument();
  });
});

describe('AppFrame', () => {
  it('always shows where you are', () => {
    render(<QueryProvider><AppFrame><p>content</p></AppFrame></QueryProvider>);
    expect(within(screen.getByRole('navigation', {name: 'You are here'})).getByText('Settings')).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the open case in the address of every link into the case', async () => {
    act(() => useWorkbenchStore.getState().setInvestigationId('inv-7'));
    render(<QueryProvider><AppFrame><p>content</p></AppFrame></QueryProvider>);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Open steps and pages'}));
    const left = document.getElementById('fr-left')!;
    expect(within(left).getByRole('link', {name: 'Case home'})).toHaveAttribute('href', '/?inv=inv-7');
    expect(within(left).getByRole('link', {name: /^4\s*Act$/})).toHaveAttribute('href', '/act?inv=inv-7');
    expect(within(left).getByRole('link', {name: 'Red Flags'})).toHaveAttribute('href', '/act?inv=inv-7#red-flags');
    expect(within(left).getByRole('link', {name: 'Settings'})).toHaveAttribute('href', '/settings');
    act(() => useWorkbenchStore.getState().setInvestigationId(''));
  });

  it('ignores unsafe destinations in saved case places', async () => {
    connectGeneratedClient(new ApiClient('http://api.test'));
    mockApi({'GET /api/investigations': [
      {id: 'inv-2', name: 'Example Holdings', description: null, question: null, is_demo: false, type_areas: null, created_at: '2026-10-02T00:00:00'},
    ]});
    window.localStorage.setItem('pai:case-places', JSON.stringify({
      'inv-2': {href: 'javascript:alert(1)', label: 'Cases › Example Holdings › Act'},
    }));
    render(<QueryProvider><AppFrame><p>content</p></AppFrame></QueryProvider>);
    fireEvent.keyDown(window, {key: 'o', ctrlKey: true});
    await userEvent.setup().click(await screen.findByRole('option', {name: /Example Holdings/}));
    expect(push).toHaveBeenCalledWith('/?inv=inv-2');
  });

  it('opens the left edge on its handle and by the [ key, but not while typing or with single keys off', async () => {
    render(<QueryProvider><AppFrame><input aria-label="Notes"/></AppFrame></QueryProvider>);
    const left = document.getElementById('fr-left')!;
    expect(left).not.toHaveClass('open');
    await userEvent.setup().click(screen.getByRole('button', {name: 'Open steps and pages'}));
    expect(left).toHaveClass('open');
    fireEvent.keyDown(window, {key: 'Escape'});
    expect(left).not.toHaveClass('open');
    fireEvent.keyDown(window, {key: '['});
    expect(left).toHaveClass('open');
    fireEvent.keyDown(window, {key: '['});
    fireEvent.keyDown(screen.getByRole('textbox', {name: 'Notes'}), {key: '['});
    expect(left).not.toHaveClass('open');
    act(() => setSingleKeys(false));
    fireEvent.keyDown(window, {key: '['});
    expect(left).not.toHaveClass('open');
  });

  it('opens the command palette with ⌘K, offers a search of the case, and goes to a place', async () => {
    act(() => useWorkbenchStore.getState().setInvestigationId(''));
    render(<QueryProvider><AppFrame><p>content</p></AppFrame></QueryProvider>);
    fireEvent.keyDown(window, {key: 'k', metaKey: true});
    const input = await screen.findByRole('combobox', {name: 'Search or command'});
    const user = userEvent.setup();
    await user.type(input, 'red flags');
    expect(screen.getByRole('option', {name: /Search the case for “red flags”/})).toBeInTheDocument();
    const place = screen.getByRole('option', {name: 'Act › Red Flags'});
    await user.click(place);
    expect(push).toHaveBeenCalledWith('/act#red-flags');
  });

  it('opens edges with Alt and an arrow, pins one on this computer, and lists where you have been', async () => {
    render(<QueryProvider><AppFrame><p>content</p></AppFrame></QueryProvider>);
    const left = document.getElementById('fr-left')!;
    expect(screen.getByText('Steps and pages', {selector: '.fr-hint'})).toBeInTheDocument();
    fireEvent.keyDown(window, {key: 'ArrowRight', altKey: true});
    expect(left).toHaveClass('open');
    expect(screen.queryByText('Steps and pages', {selector: '.fr-hint'})).not.toBeInTheDocument();
    fireEvent.keyDown(window, {key: 'ArrowLeft', altKey: true});
    expect(left).not.toHaveClass('open');
    fireEvent.keyDown(window, {key: '['});
    const user = userEvent.setup();
    await user.click(within(left).getByRole('button', {name: 'Pin'}));
    expect(JSON.parse(window.localStorage.getItem('pai:edge-pins')!)).toEqual({left: true, top: false});
    fireEvent.keyDown(window, {key: 'Escape'});
    expect(left).toHaveClass('open');
    expect(window.localStorage.getItem('pai:trail')).toContain('Settings');
  });

  it('does not render unsafe destinations from the saved place history', async () => {
    act(() => useWorkbenchStore.getState().setInvestigationId(''));
    window.localStorage.setItem('pai:trail', JSON.stringify([
      {href: 'javascript:alert(1)', label: 'Unsafe place'},
      {href: '//attacker.invalid/path', label: 'External place'},
      {href: '/act?inv=inv-1#red-flags', label: 'Red Flags'},
    ]));
    render(<QueryProvider><AppFrame><p>content</p></AppFrame></QueryProvider>);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Open steps and pages'}));
    const left = document.getElementById('fr-left')!;
    expect(within(left).queryByText('Unsafe place')).not.toBeInTheDocument();
    expect(within(left).queryByText('External place')).not.toBeInTheDocument();
    expect(within(left.querySelector('.fr-places')!).getByRole('link', {name: 'Red Flags'})).toHaveAttribute('href', '/act?inv=inv-1#red-flags');
  });

  it('switches case with ⌘O, and Hide screen covers everything until asked back', async () => {
    connectGeneratedClient(new ApiClient('http://api.test'));
    mockApi({'GET /api/investigations': [
      {id: 'inv-1', name: 'Kestrel SA', description: null, question: 'Who owns the harbour land?', is_demo: false, type_areas: null, created_at: '2026-10-01T00:00:00'},
      {id: 'inv-2', name: 'Meridian payments', description: null, question: null, is_demo: false, type_areas: null, created_at: '2026-10-02T00:00:00'}]});
    window.localStorage.setItem('pai:case-places', JSON.stringify({'inv-2': {href: '/check?inv=inv-2#claim-verification', label: 'Cases › Meridian payments › Check › Claims'}}));
    render(<QueryProvider><AppFrame><p>content</p></AppFrame></QueryProvider>);
    fireEvent.keyDown(window, {key: 'o', ctrlKey: true});
    const user = userEvent.setup();
    await user.type(await screen.findByRole('combobox', {name: 'Find a case'}), 'meridian');
    const option = await screen.findByRole('option', {name: /Meridian payments/});
    expect(option).toHaveTextContent('last at Check › Claims');
    await user.click(option);
    expect(push).toHaveBeenCalledWith('/check?inv=inv-2#claim-verification');
    expect(useWorkbenchStore.getState().investigationId).toBe('inv-2');
    act(() => useWorkbenchStore.getState().setInvestigationId(''));

    fireEvent.keyDown(window, {key: 'h', ctrlKey: true, shiftKey: true});
    const cover = screen.getByRole('dialog', {name: 'Screen hidden'});
    await user.click(within(cover).getByRole('button', {name: 'Show the screen'}));
    expect(screen.queryByRole('dialog', {name: 'Screen hidden'})).not.toBeInTheDocument();
  });
});

describe('status grammar', () => {
  it('always shows a word and a shape, not only a colour', () => {
    render(<><StatusChip status="disputed"/><StatusChip status="unshown"/><LevelChip level="strong" showMeaning/></>);
    expect(screen.getByText('Disputed').closest('.st')).toHaveTextContent('✕Disputed');
    expect(screen.getByText('Not yet shown').closest('.st')).toHaveClass('st-unshown');
    expect(screen.getByText('Strong').closest('.lv')).toHaveTextContent('▮▮▯Strong · it looks serious');
  });
});
