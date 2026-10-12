import path from 'node:path';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // The effect system from OnySnow Studios keeps its own '@/...' imports as '@fx/...' (ADR-0009).
      '@fx': path.resolve(__dirname, 'vendor/onysnow-effects'),
    },
  },
  test: {
    include: ['tests/**/*.{ts,tsx}', 'vendor/onysnow-effects/**/*.test.{ts,tsx}'],
    // Per-file environment via a `// @vitest-environment jsdom` doc-comment
    // lets node-only tests (like tests/test-api-client-auth.ts) skip jsdom's
    // startup cost, while component tests opt into jsdom individually
    // (STRUCT-0015). Global default stays 'node'.
    environment: 'node',
    setupFiles: ['./test-setup.ts'],
    // Vitest's default per-test limit is 5 s; a page test's first render on a
    // busy machine came close to it (see the wait in test-setup.ts).
    testTimeout: 30_000,
    // The effect system's photo-url tests check the addresses it builds against this base;
    // the app itself sets none, so it fetches no photographs from outside the computer.
    env: {NEXT_PUBLIC_PHOTO_BASE: 'https://example.supabase.co'},
  },
});
