import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['test/**/*.jsx', 'jsdom'],
      ['test/**/*.dom.test.js', 'jsdom'],
    ],
    setupFiles: ['./test/setup.js'],
    globals: true,
  },
});
