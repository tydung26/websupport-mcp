import { defineConfig } from 'tsdown'

/**
 * One entry, one output file.
 *
 * The server is launched as a bin, usually through `npx`, so startup cost is
 * module resolution rather than compute. Bundling collapses ~30 modules into a
 * single file and inlines the vendored OpenAPI spec, so nothing is resolved or
 * read from disk at runtime.
 *
 * Type checking is deliberately not the bundler's job — `npm run typecheck`
 * runs `tsc --noEmit` and CI gates on it separately.
 *
 * Node 20 reached end of life on 2026-04-30 and is not supported. The package
 * targets Node >= 22, which also clears tsdown's own floor of
 * ^22.18 || >=24.11, so building and running need the same runtimes.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Nothing here is consumed as a library — the package exposes a bin, not an
  // API — so emitting declarations would only add weight to the tarball.
  dts: false,
  // The package is `"type": "module"`, so ESM output belongs in `.js`. Without
  // this tsdown emits `.mjs` and the `bin` entry points at a file that is not
  // there.
  outExtensions: () => ({ js: '.js' }),
  deps: {
    // Runtime dependencies are installed alongside the package. Bundling the
    // SDK would defeat its own conditional exports.
    neverBundle: ['@modelcontextprotocol/server', 'zod'],
  },
})
