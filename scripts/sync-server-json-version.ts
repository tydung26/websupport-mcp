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
