// @vitest-environment jsdom
// Settings at a glance: rows under You / Cases / This computer with their values; search narrows them.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {SettingsIndex} from '../features/settings/settings-index';

afterEach(() => cleanup());

const rows = [
  {group: 'You' as const, label: 'Theme', value: 'Case Night', target: 't1', words: 'colour'},
  {group: 'You' as const, label: 'Calm motion', value: 'Off', target: 't1'},
  {group: 'This computer' as const, label: 'Private AI', value: 'qwen3:8b', target: 't2', words: 'model'},
];

describe('SettingsIndex', () => {
  it('shows each setting with its value, and search narrows them and jumps to the first', async () => {
    document.body.insertAdjacentHTML('beforeend', '<section id="t2" tabindex="-1">AI</section>');
    const target = document.getElementById('t2')!;
    target.scrollIntoView = vi.fn();
    render(<SettingsIndex rows={rows}/>);
    expect(within(screen.getByRole('region', {name: 'You'})).getByRole('button', {name: 'Theme: Case Night'})).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox', {name: 'Search settings'}), 'model{Enter}');
    expect(screen.queryByRole('region', {name: 'You'})).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Private AI: qwen3:8b'})).toBeInTheDocument();
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(target);
    await user.clear(screen.getByRole('searchbox', {name: 'Search settings'}));
    await user.type(screen.getByRole('searchbox', {name: 'Search settings'}), 'zzz');
    expect(screen.getByText('No setting matches “zzz”.')).toBeInTheDocument();
    target.remove();
  });
});
