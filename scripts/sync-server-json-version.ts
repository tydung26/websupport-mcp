#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Copy the package version into `server.json`.
 *
 * `changeset version` bumps `package.json` and knows nothing about the MCP
 * Registry manifest. Left alone the two drift, and the Registry then advertises
 * a version that does not match the published package. Run as part of
 * `release:version`, before the release commit is made.
 *
 * Re-serialising the document does not reproduce Biome's formatting — short
 * arrays get expanded onto separate lines — so `release:version` formats this
 * file, and only this file, immediately afterwards. Formatting the whole tree
 * instead reflows unrelated markdown, which `biome check` never flags because
 * it ignores markdown, so the churn would land in every release commit
 * unnoticed. Do not try to match the formatter by hand
 * here; it will drift and fail the lint gate on a release pull request, which
 * is exactly how this was found.
 */

const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url))
const serverPath = fileURLToPath(new URL('../server.json', import.meta.url))

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string; name: string }
const server = JSON.parse(readFileSync(serverPath, 'utf8')) as {
  version: string
  packages?: { identifier: string; version?: string }[]
}

server.version = pkg.version
for (const entry of server.packages ?? []) {
  if (entry.identifier === pkg.name) entry.version = pkg.version
}

writeFileSync(serverPath, `${JSON.stringify(server, null, 2)}\n`)
console.error(`server.json synced to ${pkg.version}`)
