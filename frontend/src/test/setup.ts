import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// @testing-library/react auto-registers this via a global `afterEach` when the
// test runner exposes one; since this project runs Vitest without `globals:
// true` (to avoid widening the app's tsconfig types), register it explicitly
// so each test starts from a clean DOM instead of leaking previous renders.
afterEach(() => {
  cleanup();
});
