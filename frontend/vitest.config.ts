import path from 'node:path';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    include: ['tests/**/*.{ts,tsx}'],
    // Per-file environment via a `// @vitest-environment jsdom` doc-comment
    // lets node-only tests (like tests/test-api-client-auth.ts) skip jsdom's
    // startup cost, while component tests opt into jsdom individually
    // (STRUCT-0015). Global default stays 'node'.
    environment: 'node',
    setupFiles: ['./test-setup.ts'],
  },
});
