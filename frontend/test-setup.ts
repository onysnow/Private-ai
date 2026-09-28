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
