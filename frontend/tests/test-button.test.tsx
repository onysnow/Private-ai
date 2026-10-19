// @vitest-environment jsdom
// First React Testing Library component test in this codebase (STRUCT-0015),
// establishing the jsdom + RTL pattern for future coverage of app/page.tsx's
// interactions. Starts with components/ui/button.tsx as a small, isolated,
// side-effect-free target rather than the much larger page component.
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Button} from '../components/ui/button';

// @testing-library/react's auto-cleanup only self-registers when it detects
// a global `afterEach` (e.g. Jest's globals); this project runs vitest
// without `test.globals`, so cleanup is wired explicitly here instead --
// otherwise each test's rendered button piles up in the same jsdom body and
// `getByRole` starts matching multiple elements.
afterEach(cleanup);

describe('Button', () => {
  it('renders its children as a real button element', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', {name: 'Save'});
    expect(button).toBeInTheDocument();
    expect(button.tagName).toBe('BUTTON');
  });

  it('fires onClick when clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Save</Button>);
    await user.click(screen.getByRole('button', {name: 'Save'}));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick} disabled>Save</Button>);
    await user.click(screen.getByRole('button', {name: 'Save'}));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies the destructive variant class', () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole('button', {name: 'Delete'}).className).toContain('bg-destructive');
  });

  it('renders asChild onto the wrapped element instead of a <button>', () => {
    render(
      <Button asChild>
        <a href="/somewhere">Go</a>
      </Button>
    );
    const link = screen.getByRole('link', {name: 'Go'});
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
  });
});
