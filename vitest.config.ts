import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// unplugin-swc: phát decorator metadata để Nest DI hoạt động trong test
const swcPlugin = swc.vite({
  module: { type: 'es6' },
  jsc: { transform: { legacyDecorator: true, decoratorMetadata: true } },
});

export default defineConfig({
  plugins: [swcPlugin],
  test: {
    projects: [
      {
        plugins: [swcPlugin],
        test: { name: 'unit', include: ['src/**/*.spec.ts'], environment: 'node' },
      },
      {
        plugins: [swcPlugin],
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.e2e-spec.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
