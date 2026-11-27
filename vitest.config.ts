import { defineConfig } from 'vitest/config';

// Unit tests only (Playwright E2E specs live in tests/e2e and run with `npm run e2e`).
// Tests that need localStorage opt into happy-dom with a `// @vitest-environment happy-dom` comment.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.{ts,js}'],
    environment: 'node',
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'worker/**'],
      exclude: ['src/lib/types.ts'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: {
        // src/lib reaches ~92% lines; data.tsx (the React data provider) is left to the E2E suite
        'src/lib/**': { lines: 80, statements: 80, functions: 80, branches: 80 },
        'worker/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
      },
    },
  },
});
