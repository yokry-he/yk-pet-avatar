import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@yk-pet/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@yk-pet/2d': path.resolve(__dirname, 'packages/renderer-2d/src/index.ts'),
      '@yk-pet/3d': path.resolve(__dirname, 'packages/renderer-3d/src/index.ts'),
      '@yk-pet/element': path.resolve(__dirname, 'packages/element/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
  },
})
