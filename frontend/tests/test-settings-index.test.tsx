// @vitest-environment jsdom
// Settings' sidebar (mockup HOME_2): every setting under You / Cases / This computer with its
// value, the open one marked; search lists matches and Enter opens the first.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {SettingsNav, SettingsSearch, type SettingRow} from '../features/settings/settings-index';

afterEach(() => cleanup());

const rows: SettingRow[] = [
  {group: 'You', id: 'appearance', label: 'Appearance', value: 'Case Night', words: 'theme colour', note: 'Yours alone.'},
  {group: 'You', id: 'keyboard', label: 'Keyboard', value: 'on'},
  {group: 'Cases', id: 'ai', label: 'AI and research', value: 'ask first', words: 'model'},
  {group: 'This computer', id: 'console', label: 'Operator console', value: '', href: '/console/'},
];

describe('Settings sidebar', () => {
  it('shows each setting with its value, marks the open one, and opens another', async () => {
    const go = vi.fn();
    render(<SettingsNav rows={rows} current="appearance" onGo={go}/>);
    const you = screen.getByRole('region', {name: 'You'});
    expect(within(you).getByRole('button', {name: 'Appearance: Case Night'})).toHaveAttribute('aria-current', 'page');
    // The setting's note is revealed on the ⓘ under the sidebar.
    expect(screen.getByRole('img', {name: 'About this setting'})).toHaveAccessibleDescription('Yours alone.');
    expect(screen.getByRole('link', {name: /Operator console/})).toHaveAttribute('href', '/console/');
    await userEvent.setup().click(screen.getByRole('button', {name: 'Keyboard: on'}));
    expect(go).toHaveBeenCalledWith('keyboard');
  });

  it('searches every setting and opens the first match with Enter', async () => {
    const go = vi.fn();
    render(<SettingsSearch rows={rows} onGo={go}/>);
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox', {name: 'Search settings'}), 'model');
    expect(within(screen.getByRole('list', {name: 'Matching settings'})).getByRole('button', {name: /AI and research/})).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(go).toHaveBeenCalledWith('ai');
    await user.type(screen.getByRole('searchbox', {name: 'Search settings'}), 'zzz');
    expect(screen.getByText('No setting matches “zzz”.')).toBeInTheDocument();
  });
});
