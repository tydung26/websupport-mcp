import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Keeps `server.json`, `package.json` and the registry naming convention in
 * agreement.
 *
 * These three drift independently and silently: `changeset version` bumps only
 * `package.json`, and nothing but this test notices when the MCP Registry then
 * advertises a version or a package name that does not exist on npm.
 *
 * Schema *validity* is checked separately by the network suite, against the
 * live schema rather than a remembered copy.
 */

const read = (rel: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'))

const pkg = read('../../package.json') as {
  name: string
  version: string
  mcpName?: string
  bin?: Record<string, string>
}
const server = read('../../server.json') as {
  name: string
  version: string
  packages?: { registryType: string; identifier: string; version?: string }[]
}

describe('server.json agrees with package.json', () => {
  it('advertises the same version', () => {
    expect(server.version).toBe(pkg.version)
  })

  it('names the npm package that actually gets published', () => {
    const npm = server.packages?.find((p) => p.registryType === 'npm')
    expect(npm?.identifier).toBe(pkg.name)
    expect(npm?.version).toBe(pkg.version)
  })

  it('matches the mcpName declared in the manifest', () => {
    // MCP clients key on this pairing; a mismatch makes the registry entry
    // unresolvable rather than merely wrong.
    expect(pkg.mcpName).toBe(server.name)
  })

  it('uses the io.github.<owner>/<repo> namespace the registry expects', () => {
    expect(server.name).toMatch(/^io\.github\.[a-z0-9-]+\/[a-z0-9._-]+$/i)
  })

  it('declares a stdio transport, which is what this server speaks', () => {
    const npm = server.packages?.find((p) => p.registryType === 'npm') as
      | { transport?: { type: string } }
      | undefined
    expect(npm?.transport?.type).toBe('stdio')
  })

  it('documents every environment variable the server reads', () => {
    const declared = new Set(
      (
        (server.packages?.[0] as { environmentVariables?: { name: string }[] })
          ?.environmentVariables ?? []
      ).map((v) => v.name),
    )
    for (const name of [
      'WEBSUPPORT_API_KEY',
      'WEBSUPPORT_API_SECRET',
      'WEBSUPPORT_API_BASE_URL',
      'WEBSUPPORT_ACCEPT_LANGUAGE',
      'WEBSUPPORT_ALLOW_WRITE',
      'WEBSUPPORT_ALLOW_DESTRUCTIVE',
    ]) {
      expect(declared, `server.json does not document ${name}`).toContain(name)
    }
  })

  it('marks the secret as secret and the key as not', () => {
    const vars = (
      server.packages?.[0] as {
        environmentVariables?: { name: string; isSecret?: boolean }[]
      }
    ).environmentVariables
    expect(vars?.find((v) => v.name === 'WEBSUPPORT_API_SECRET')?.isSecret).toBe(true)
    expect(vars?.find((v) => v.name === 'WEBSUPPORT_API_KEY')?.isSecret).toBe(false)
  })
})

describe('package manifest', () => {
  it('exposes the bundled entrypoint as the bin', () => {
    expect(pkg.bin?.['websupport-mcp']).toBe('dist/index.js')
  })
})
