import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/server/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'src/generated'],
    env: {
      JWT_ACCESS_SECRET: 'test-jwt-access-secret-for-dev-only',
      JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-for-dev-only',
    },
  },
});
