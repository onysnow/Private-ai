// @vitest-environment jsdom
// The operator console page is a thin wrapper (DESIGN.md §8): it embeds the
// opsconsole UI bundle -- served by the backend itself -- in an iframe, and
// links back to the workbench. All the console's actual behavior (data
// browsing, SQL, checks, tests, logs, users, backups) lives in that bundle
// and is tested by the opsconsole package's own suite, not here.
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import ConsolePage from '../app/console/page';

afterEach(() => {
  cleanup();
});

describe('ConsolePage', () => {
  it('embeds the backend console bundle in an iframe pointed at /console', () => {
    render(<ConsolePage />);
    const frame = screen.getByTestId('console-frame') as HTMLIFrameElement;
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.src).toBe('http://localhost:8000/console');
  });

  it('links back to the workbench', () => {
    render(<ConsolePage />);
    expect(screen.getByRole('link', {name: /workbench/})).toHaveAttribute('href', '/');
  });
});
