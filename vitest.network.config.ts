import { defineConfig } from 'vitest/config'

/** Network-dependent suites only. Never part of the blocking CI job. */
export default defineConfig({
  test: {
    include: ['src/**/*.network.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
})
