// @vitest-environment jsdom
// Reveal (components/ui/reveal.tsx): keyboard focus opens the card; the focus a click gives does not, so the card
// does not stay stuck over what the click opened (sweep of 30 Oct: "0% confidence" stuck over the claims list).
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import {Reveal} from '../components/ui/reveal';

afterEach(cleanup);

describe('Reveal', () => {
  it('opens on keyboard focus of the control it wraps', () => {
    render(<Reveal tabbable={false} detail="40% confidence"><button type="button">A claim</button></Reveal>);
    fireEvent.focus(screen.getByRole('button', {name: 'A claim'}));
    expect(screen.getByRole('tooltip')).toHaveTextContent('40% confidence');
  });

  it('does not open on the focus a pointer press gives', () => {
    render(<Reveal tabbable={false} detail="40% confidence"><button type="button">A claim</button></Reveal>);
    const button = screen.getByRole('button', {name: 'A claim'});
    fireEvent.pointerDown(button);
    fireEvent.focus(button);
    fireEvent.click(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
    // The next keyboard focus opens it again.
    fireEvent.blur(button);
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent('40% confidence');
  });
});
