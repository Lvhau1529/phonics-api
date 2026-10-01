import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  preview: {
    buckets: {
      resources: { access: 'public_read' },
    },
  },
});
