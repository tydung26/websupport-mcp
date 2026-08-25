import { defineConfig } from 'tsup'

/**
 * One entry, one output file.
 *
 * The server is launched as a bin, usually through `npx`, so startup cost is
 * module resolution rather than compute. Bundling collapses ~30 modules into a
 * single file and inlines the vendored OpenAPI spec, so nothing is resolved or
 * read from disk at runtime.
 *
 * Type checking is not tsup's job — `npm run typecheck` runs `tsc --noEmit`
 * and CI gates on it.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // tsup keeps the entry's shebang and marks the output executable, so the bin
  // runs straight from the tarball.
  // Dependencies stay external — they are installed alongside, and bundling
  // them would break the SDK's own conditional exports.
  external: ['@modelcontextprotocol/server', 'zod'],
})
