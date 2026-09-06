import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Scope to unit/component tests under src/ only -- tests/e2e/** are
    // Playwright specs (test.describe from @playwright/test), not Vitest ones.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
