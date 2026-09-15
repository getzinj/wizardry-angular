import angular from '@analogjs/vite-plugin-angular';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [angular({ tsconfig: path.resolve(import.meta.dirname, 'tsconfig.spec.json') })],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
    pool: 'forks',
    maxWorkers: 4,
    // Sharing the module registry across spec files is much faster, at the cost of vi.mock().
    // Nothing here needs it - the runtime is built from plain classes that a spec can just construct.
    isolate: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.spec.ts',
        'src/test-setup.ts',
        'src/main.ts',
        '**/*.d.ts',
        'src/app/data/scenario-fixture.ts',
      ],
    },
  },
});
