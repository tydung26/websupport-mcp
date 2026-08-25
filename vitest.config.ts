import { defineConfig } from 'vitest/config'

/**
 * `*.network.test.ts` suites reach the live Websupport API (unauthenticated
 * only). They are excluded from the default run and from the blocking CI job,
 * so a Websupport outage cannot red the build. Run them with `npm run test:network`.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'src/**/*.network.test.ts'],
    environment: 'node',
  },
})
