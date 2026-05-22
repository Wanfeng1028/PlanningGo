import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Allow .js imports to resolve to .ts files (ESM convention)
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/server/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'src/generated'],
    server: {
      deps: {
        inline: [/.*/],
      },
    },
  },
})
