// @vitest-environment jsdom
// The app lock on screen (ADR-0016, mockups ACCOUNT_1-4): the lock screen hides the case and opens with the passphrase
// or a PIN, a 423 from any call brings it down, first open asks a name and fills nothing in, the recovery words must
// be checked before going on, Locking saves what is chosen, and adding a person makes a one-time key for this case.
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import type {Routes} from '../test-support/mock-api';

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()}), usePathname: () => '/'}));

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

const OPEN = {protection: 'passphrase', locked: false, pin: false, known: true, name: 'Reporter One', idle_minutes: 10, lock_on_hide: true,
  lock_on_sleep: true, quick_pin: false, pin_set: false, backups_encrypted: true, locked_cases: [],
  disk: {state: 'unknown', system: 'docker', why: 'Inside a container the app cannot see the disk.', how_to: '', answered: false}};
const LOCKED = {protection: 'passphrase', locked: true, pin: false, known: true};

async function renderGate(routes: Routes) {
  window.localStorage.setItem('pai:session', 'sess-1');
  const api = mockApi(routes);
  vi.resetModules();
  const {LockGate} = await import('../features/lock/lock-gate');
  const {QueryProvider} = await import('../lib/query-client');
  render(<QueryProvider><LockGate><p>Kestrel harbour case</p></LockGate></QueryProvider>);
  return api;
}

describe('The lock screen', () => {
  it('hides the case while locked and opens with the passphrase', async () => {
    const api = await renderGate({'GET /api/session': LOCKED, 'POST /api/session/unlock': OPEN});
    await screen.findByRole('dialog', {name: 'The app is locked'});
    expect(screen.queryByText('Kestrel harbour case')).not.toBeVisible();
    await userEvent.type(screen.getByLabelText('Passphrase'), 'four unrelated words here');
    await userEvent.click(screen.getByRole('button', {name: 'Unlock'}));
    await waitFor(() => expect(screen.queryByRole('dialog', {name: 'The app is locked'})).not.toBeInTheDocument());
    expect(screen.getByText('Kestrel harbour case')).toBeVisible();
    expect(api.lastBody('POST /api/session/unlock')).toEqual({passphrase: 'four unrelated words here'});
    expect(new Headers(api.calls('POST /api/session/unlock')[0].init.headers).get('x-workbench-session')).toBe('sess-1');
  });

  it('offers the PIN when the server allows it, and says a wrong one', async () => {
    const api = await renderGate({'GET /api/session': {...LOCKED, pin: true},
      'POST /api/session/unlock-pin': {status: 401, body: {detail: 'That is not the PIN.'}}});
    await userEvent.type(await screen.findByLabelText('Quick PIN'), '12a34');
    expect(screen.getByLabelText('Quick PIN')).toHaveValue('1234');
    expect(screen.getByLabelText('Quick PIN')).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', {name: 'Unlock'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('That is not the PIN.');
    expect(api.lastBody('POST /api/session/unlock-pin')).toEqual({pin: '1234'});
    await userEvent.click(screen.getByRole('button', {name: 'use the passphrase instead'}));
    expect(screen.getByLabelText('Passphrase')).toBeInTheDocument();
  });

  it('comes down when any call answers 423 Locked', async () => {
    await renderGate({'GET /api/session': OPEN});
    await screen.findByText('Kestrel harbour case');
    expect(screen.queryByRole('dialog', {name: 'The app is locked'})).not.toBeInTheDocument();
    const {LOCKED_EVENT} = await import('../lib/api-client');
    window.localStorage.setItem('sv-recent:inv-1', '[{"q":"Fernhill"}]');
    window.localStorage.setItem('workbench.your-safety.inv-1', '{"plan":{"who":"my editor"}}');
    act(() => { window.dispatchEvent(new Event(LOCKED_EVENT)); });
    expect(await screen.findByRole('dialog', {name: 'The app is locked'})).toBeInTheDocument();
    // Locking forgets the names searched for; the safety plan stays (DECISIONS_LOG 59).
    expect(window.localStorage.getItem('sv-recent:inv-1')).toBeNull();
    expect(window.localStorage.getItem('workbench.your-safety.inv-1')).not.toBeNull();
  });

  it('works as before when the server has no app lock', async () => {
    await renderGate({});
    expect(await screen.findByText('Kestrel harbour case')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('First open', () => {
  it('asks the name, fills nothing in, and says how earlier decisions read', async () => {
    const api = await renderGate({'GET /api/session': {...OPEN, protection: 'none', name: null, unsigned_decisions: 214},
      'PUT /api/me/name': {...OPEN, protection: 'none', name: 'Maya Rees'}});
    const name = await screen.findByLabelText('Your name');
    expect(name).toHaveValue('');
    expect(screen.getByText('214')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Type your name to continue'})).toBeDisabled();
    await userEvent.type(name, 'Maya Rees');
    expect(screen.getAllByText('Maya Rees').length).toBeGreaterThan(1);   // the "how it will read" lines fill in
    await userEvent.click(screen.getByRole('button', {name: 'Continue ⏎'}));
    await waitFor(() => expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument());
    expect(api.lastBody('PUT /api/me/name')).toEqual({name: 'Maya Rees'});
  });

  it('with a passphrase, shows the recovery words once and asks one back', async () => {
    const words = ['abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident'];
    vi.spyOn(Math, 'random').mockReturnValue(0.5);   // asks word 7
    const api = await renderGate({'GET /api/session': {...OPEN, protection: 'none', name: null},
      'PUT /api/me/name': {...OPEN, protection: 'none', name: 'Maya Rees'}, 'POST /api/me/protection': {words}, 'GET /api/me': OPEN});
    await userEvent.type(await screen.findByLabelText('Your name'), 'Maya Rees');
    await userEvent.click(screen.getByRole('radio', {name: /Protect with a passphrase/}));
    await userEvent.click(screen.getByRole('button', {name: 'Continue ⏎'}));
    await userEvent.type(await screen.findByLabelText('Passphrase'), 'harbour lantern copper meadow');
    await userEvent.type(screen.getByLabelText('Passphrase again'), 'harbour lantern copper meadow');
    await userEvent.click(screen.getByRole('button', {name: 'Protect now'}));
    expect(await screen.findByText('absorb')).toBeInTheDocument();
    const done = screen.getByRole('button', {name: 'I have them · open the app'});
    expect(done).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Word 7'), 'absorb');
    expect(done).toBeEnabled();
    await userEvent.click(done);
    await waitFor(() => expect(screen.queryByText('absorb')).not.toBeInTheDocument());
    expect(api.lastBody('POST /api/me/protection')).toEqual({passphrase: 'harbour lantern copper meadow'});
    vi.restoreAllMocks();
  });
});

describe('Settings › Your safety and People and access', () => {
  it('saves when the app locks, and asks the reporter about a disk the app cannot see', async () => {
    const api = mockApi({'PUT /api/me/locking': {...OPEN, idle_minutes: 30}, 'PUT /api/me/disk': {...OPEN, disk: {...OPEN.disk, state: 'encrypted', answered: true}}});
    vi.resetModules();
    const {useLockStore} = await import('../lib/app-lock');
    const {LockingPane} = await import('../features/lock/locking-pane');
    useLockStore.getState().set(OPEN as never);
    render(<LockingPane/>);
    await userEvent.click(screen.getByRole('radio', {name: '30 min'}));
    await waitFor(() => expect(screen.getByRole('radio', {name: '30 min'})).toHaveAttribute('aria-checked', 'true'));
    expect(api.lastBody('PUT /api/me/locking')).toEqual({idle_minutes: 30});
    await userEvent.click(screen.getByRole('button', {name: 'It is encrypted'}));
    expect(await screen.findByText(/as you said/)).toBeInTheDocument();
    expect(api.lastBody('PUT /api/me/disk')).toEqual({answer: 'encrypted'});
    // Why the disk matters is revealed on its state; Hide the screen sits with the passphrase's actions.
    expect(screen.getByText('This computer’s disk is encrypted').closest('.rv')).toHaveAccessibleDescription(/operating system’s job/);
    expect(screen.getByRole('button', {name: 'Hide the screen now'}).closest('.lk-status')).not.toBeNull();
  });

  it('shows how your name will read as you type it, and how many decisions stay “a person”', async () => {
    mockApi({});
    vi.resetModules();
    const {useLockStore} = await import('../lib/app-lock');
    const {NamePane} = await import('../features/lock/name-pane');
    useLockStore.getState().set({...OPEN, name: '', unsigned_decisions: 214} as never);
    render(<NamePane/>);
    expect(screen.getAllByText('your name')).toHaveLength(3);
    await userEvent.type(screen.getByLabelText('Your name'), 'Jo Okafor');
    expect(screen.getAllByText('Jo Okafor')).toHaveLength(3);
    expect(screen.getByText('214')).toBeInTheDocument();
    // What happens to past decisions is revealed on the heading.
    expect(screen.getByText('Your name, as it goes on your work').closest('.rv')).toHaveAccessibleDescription(/Past decisions keep the name/);
  });

  it('adds a person to this case with a one-time key, and says network access is off', async () => {
    const api = mockApi({'GET /api/settings/security/users': [], 'GET /api/investigations/inv-1/deciders': {days: 30, people: [{name: 'Reporter One', decisions: 3}, {name: null, decisions: 2}]},
      'POST /api/settings/security/users': {id: 'u-1', display_name: 'Jo Okafor', global_role: 'member', token: 'jw_secret_key_41', token_expires_at: '2026-11-18T00:00:00Z', token_notice: ''},
      'PUT /api/settings/security/users/u-1/investigations/inv-1': {user_id: 'u-1', investigation_id: 'inv-1', role: 'viewer'}});
    vi.resetModules();
    const {useLockStore} = await import('../lib/app-lock');
    const {PeoplePane} = await import('../features/lock/people-pane');
    const {QueryProvider} = await import('../lib/query-client');
    useLockStore.getState().set(OPEN as never);
    render(<QueryProvider><PeoplePane investigationId="inv-1" caseName="Kestrel harbour case" networkOn={false} onAccess={() => undefined}/></QueryProvider>);
    // Why decisions read "a person", and what network access being off means, are revealed on them, not said at rest.
    expect((await screen.findByText('a person')).closest('.rv')).toHaveAccessibleDescription('Decided before names were kept. They stay that way.');
    expect(screen.queryByText(/before names were kept/, {selector: 'p'})).not.toBeInTheDocument();
    expect(screen.getByText('Network access is off').closest('.rv')).toHaveAccessibleDescription(/Keys work only after you turn network access on/);
    await userEvent.type(screen.getByLabelText('Their name'), 'Jo Okafor');
    await userEvent.click(screen.getByRole('radio', {name: /Viewer/}));
    await userEvent.click(screen.getByRole('radio', {name: '90 days'}));
    await userEvent.click(screen.getByRole('button', {name: 'Make a one-time key for Jo'}));
    expect(await screen.findByText('jw_secret_key_41')).toBeInTheDocument();
    expect(api.lastBody('POST /api/settings/security/users')).toEqual({display_name: 'Jo Okafor', global_role: 'member', key_days: 90});
    expect(api.lastBody('PUT /api/settings/security/users/u-1/investigations/inv-1')).toEqual({role: 'viewer'});
  });
});
