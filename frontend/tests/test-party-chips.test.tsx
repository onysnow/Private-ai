// @vitest-environment jsdom
// A decision card's party chips: pointing at one lights it everywhere, and the click that follows keeps it lit
// rather than turning off what the pointing just lit. A second click turns it off.
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {PartyChips} from '../features/case-home/decision-card';
import {useWorkbenchStore} from '../lib/workbench-store';

const parties = [{id: 'p1', name: 'Bellcastle Holdings', schema: 'Company'}, {id: 'p2', name: 'Orrin Vale', schema: 'Person'}] as Parameters<typeof PartyChips>[0]['parties'];

beforeEach(() => useWorkbenchStore.setState({pointedParty: null}));
afterEach(() => { cleanup(); useWorkbenchStore.setState({pointedParty: null}); });

describe('Party chips', () => {
  it('keeps a party lit when it is clicked after the pointer reached it', async () => {
    render(<PartyChips parties={parties}/>);
    const chip = screen.getByRole('button', {name: /Bellcastle Holdings/});
    // A real pointer: hover, then click (which also focuses the button).
    await userEvent.setup().click(chip);
    expect(useWorkbenchStore.getState().pointedParty).toBe('p1');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip);
    expect(useWorkbenchStore.getState().pointedParty).toBeNull();
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('works the same from the keyboard: focus points, Enter keeps it, Enter again turns it off', async () => {
    render(<PartyChips parties={parties}/>);
    const user = userEvent.setup();
    await user.tab();
    await user.tab();
    const chip = screen.getByRole('button', {name: /Orrin Vale/});
    expect(chip).toHaveFocus();
    expect(useWorkbenchStore.getState().pointedParty).toBe('p2');
    await user.keyboard('{Enter}');
    expect(useWorkbenchStore.getState().pointedParty).toBe('p2');
    await user.keyboard('{Enter}');
    expect(useWorkbenchStore.getState().pointedParty).toBeNull();
  });

  it('a click on a party lit elsewhere turns it off', () => {
    useWorkbenchStore.setState({pointedParty: 'p1'});
    render(<PartyChips parties={parties}/>);
    const chip = screen.getByRole('button', {name: /Bellcastle Holdings/});
    fireEvent.mouseEnter(chip);
    fireEvent.click(chip);
    expect(useWorkbenchStore.getState().pointedParty).toBeNull();
  });
});
