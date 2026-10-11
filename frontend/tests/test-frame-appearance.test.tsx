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
    expect(keptAppearance()).toEqual({theme: 'case-night', effects: 'full', motion: 'normal', format: 'board'});
  });
});

describe('Settings › Appearance', () => {
  it('tries a theme, shows the bar, and keeps it', async () => {
    render(<><AppearancePanel/><TryingBar/></>);
    const user = userEvent.setup();
    const card = screen.getByRole('listitem', {name: 'Rain Noir theme'});
    await user.click(within(card).getByRole('button', {name: 'Try for this session'}));
    const bar = screen.getByRole('status');
    expect(bar).toHaveTextContent('Trying Rain Noir. Nothing is saved until you keep it.');
    await user.click(within(bar).getByRole('button', {name: 'Keep Rain Noir'}));
    expect(keptAppearance().theme).toBe('rain-noir');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('turns calm motion and effects on and off', async () => {
    render(<AppearancePanel/>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', {name: /Calm motion/}));
    expect(document.documentElement.dataset.motion).toBe('calm');
    await user.click(screen.getByRole('radio', {name: /Off A plain board/}));
    expect(document.documentElement.dataset.effects).toBe('off');
    expect(screen.getByRole('radio', {name: /Desk/})).toBeDisabled();
  });
});

describe('AppFrame', () => {
  it('always shows where you are', () => {
    render(<AppFrame><p>content</p></AppFrame>);
    expect(within(screen.getByRole('navigation', {name: 'You are here'})).getByText('Settings')).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the open case in the address of every link into the case', async () => {
    act(() => useWorkbenchStore.getState().setInvestigationId('inv-7'));
    render(<AppFrame><p>content</p></AppFrame>);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Open steps and pages'}));
    const left = document.getElementById('fr-left')!;
    expect(within(left).getByRole('link', {name: 'Case home'})).toHaveAttribute('href', '/?inv=inv-7');
    expect(within(left).getByRole('link', {name: /^4\s*Act$/})).toHaveAttribute('href', '/act?inv=inv-7');
    expect(within(left).getByRole('link', {name: 'Red Flags'})).toHaveAttribute('href', '/act?inv=inv-7#red-flags');
    expect(within(left).getByRole('link', {name: 'Settings'})).toHaveAttribute('href', '/settings');
    act(() => useWorkbenchStore.getState().setInvestigationId(''));
  });

  it('opens the left edge on its handle and by the [ key, but not while typing or with single keys off', async () => {
    render(<AppFrame><input aria-label="Notes"/></AppFrame>);
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
    render(<AppFrame><p>content</p></AppFrame>);
    fireEvent.keyDown(window, {key: 'k', metaKey: true});
    const input = await screen.findByRole('combobox', {name: 'Search or command'});
    const user = userEvent.setup();
    await user.type(input, 'red flags');
    expect(screen.getByRole('option', {name: /Search the case for “red flags”/})).toBeInTheDocument();
    const place = screen.getByRole('option', {name: 'Act › Red Flags'});
    await user.click(place);
    expect(push).toHaveBeenCalledWith('/act#red-flags');
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
