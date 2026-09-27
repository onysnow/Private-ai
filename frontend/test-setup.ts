import '@testing-library/jest-dom/vitest';

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
