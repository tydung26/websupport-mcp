import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SERVER_NAME, SERVER_VERSION } from './server.js'

/**
 * The version announced in `serverInfo` must match the published package.
 *
 * 0.1.0 shipped announcing itself as 0.0.0 because this constant was hardcoded,
 * and nothing noticed until the published package was driven over a real
 * handshake. This test is the thing that should have noticed.
 */

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { name: string; version: string }

describe('serverInfo', () => {
  it('reports the package version', () => {
    expect(SERVER_VERSION).toBe(pkg.version)
  })

  it('is never left at the placeholder once the package has been released', () => {
    // Guards the fallback path: if reading the manifest fails, the version
    // silently becomes 0.0.0 again. That must not pass unnoticed.
    expect(SERVER_VERSION).not.toBe('0.0.0')
  })

  it('reports the package name', () => {
    expect(SERVER_NAME).toBe(pkg.name)
  })
})
