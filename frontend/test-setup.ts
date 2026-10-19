import '@testing-library/jest-dom/vitest';
import {vi} from 'vitest';

// app/page.tsx (bulk import) and app/review/page.tsx both use next/navigation
// hooks, which throw "invariant expected app router to be mounted" outside a
// real Next.js app-router tree -- every test in this suite renders its page
// directly with React Testing Library, with no router provider. A global
// no-op default here is enough for any test that doesn't itself exercise
// navigation; a test file that needs to assert on push() or read specific
// search params calls its own vi.mock('next/navigation', ...), which
// overrides this default for that file only.
vi.mock('next/navigation', () => ({
  useRouter: () => ({push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn()}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

// jsdom has no ResizeObserver. @radix-ui/react-use-size (used by the Slider
// primitive) calls it unconditionally on mount, so any test that renders a
// Slider throws without this polyfill. A no-op stub is sufficient: nothing
// in this suite asserts on resize-driven layout.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverPolyfill {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver;
}

// jsdom implements neither the Pointer Events capture methods nor
// scrollIntoView. @radix-ui/react-select's trigger/content interaction
// (open on pointerdown, scroll the highlighted item into view) calls
// Element.hasPointerCapture/setPointerCapture/releasePointerCapture and
// Element.scrollIntoView unconditionally, so a test that clicks a Select
// trigger throws without these. No-op stubs are sufficient: nothing in
// this suite asserts on pointer capture state or scroll position.
// Guarded on `typeof Element` because some test files in this suite run
// under Vitest's 'node' environment (no DOM globals at all) rather than
// 'jsdom' -- see vitest.config.ts's per-file @vitest-environment comment.
if (typeof Element !== 'undefined') {
  if (typeof Element.prototype.hasPointerCapture === 'undefined') {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (typeof Element.prototype.setPointerCapture === 'undefined') {
    Element.prototype.setPointerCapture = () => {};
  }
  if (typeof Element.prototype.releasePointerCapture === 'undefined') {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (typeof Element.prototype.scrollIntoView === 'undefined') {
    Element.prototype.scrollIntoView = () => {};
  }
}

// How long findBy*/waitFor wait for the screen to settle (Testing Library's
// default is 1 s). The page tests render all of app/page.tsx, whose first
// render in a fresh worker took 4-5 s while other test suites shared the two
// cores (measured 2026-10-02, with the generated client of 97fc9e0 as well as
// the current one), though the same tests pass in 1-2 s on a quiet machine.
// A longer wait changes nothing for a test that passes; one that fails just
// takes longer to say so. Vitest's own per-test limit is in vitest.config.ts.
// Only the DOM tests load Testing Library; the node-environment ones skip it.
if (typeof document !== 'undefined') {
  const {configure} = await import('@testing-library/react');
  configure({asyncUtilTimeout: 5000});
}
