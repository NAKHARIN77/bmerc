import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // The files share one seeded database and some count its rows, so run them one after another.
    fileParallelism: false,
  },
});
