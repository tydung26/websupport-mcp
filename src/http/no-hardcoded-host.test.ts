import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Structural guard: `src/auth/market-hosts.ts` is the only place an API host
 * literal may live. A host hardcoded anywhere else silently pins the server to
 * one market and defeats `WEBSUPPORT_API_BASE_URL`.
 *
 * Enforced by grep rather than review, because this is exactly the kind of
 * constant that gets reintroduced by a copy-paste six months from now.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url))
const OWNER = join(SRC, 'auth', 'market-hosts.ts')
const HOST_PATTERN = /rest\.websupport\.[a-z]{2}/

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
    } else if (entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

describe('no hardcoded API host outside market-hosts.ts', () => {
  it('finds host literals only in the module that owns them', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => file !== OWNER && !file.endsWith('.test.ts'))
      .filter((file) => HOST_PATTERN.test(readFileSync(file, 'utf8')))

    expect(offenders).toEqual([])
  })

  it('the owning module does declare them, so the guard is not vacuous', () => {
    expect(HOST_PATTERN.test(readFileSync(OWNER, 'utf8'))).toBe(true)
  })
})
