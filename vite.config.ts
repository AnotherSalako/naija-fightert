import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // three.js in its own chunk so a game-code change does not bust the cached renderer
        manualChunks: (id: string) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  test: {
    testTimeout: 30000,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as never);
