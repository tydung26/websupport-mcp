import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { registry } from './registry.js'

/**
 * Keeps `docs/verification-matrix.md` honest.
 *
 * The matrix is the document that stops the project claiming more than it has
 * proven, which makes it exactly the document that rots first: add a tool,
 * forget the matrix, and it silently reads as "everything is verified".
 *
 * These assertions caught a real error on the matrix's first draft — one tool
 * uncategorised and a summary count that disagreed with its own list.
 */

const MATRIX = readFileSync(
  fileURLToPath(new URL('../../docs/verification-matrix.md', import.meta.url)),
  'utf8',
)

const LEVELS = ['## Live data', '## Live 4xx', '## Construction only'] as const
const AFTER_LEVELS = '## Verified independently'

function toolsIn(start: string, end: string): Set<string> {
  const from = MATRIX.indexOf(start)
  const to = MATRIX.indexOf(end)
  expect(from, `section ${start} is missing`).toBeGreaterThanOrEqual(0)
  expect(to, `section ${end} is missing`).toBeGreaterThan(from)
  return new Set(
    [...MATRIX.slice(from, to).matchAll(/`(ws_[a-z0-9_]+)`/g)].map((m) => m[1] as string),
  )
}

const sections = LEVELS.map((level, index) => toolsIn(level, LEVELS[index + 1] ?? AFTER_LEVELS))
const categorised = new Set(sections.flatMap((s) => [...s]))

describe('verification matrix covers the registry', () => {
  it('categorises every registered tool exactly once', () => {
    const names = registry.map((t) => t.name)
    const missing = names.filter((n) => !categorised.has(n))
    expect(missing, 'tools absent from every level section').toEqual([])
  })

  it('lists no tool that is not registered', () => {
    const names = new Set(registry.map((t) => t.name))
    const unknown = [...categorised].filter((n) => !names.has(n))
    expect(unknown, 'matrix names tools the registry does not have').toEqual([])
  })

  it('places each tool in exactly one level', () => {
    const duplicated = [...categorised].filter(
      (name) => sections.filter((s) => s.has(name)).length > 1,
    )
    expect(duplicated, 'tools appearing under more than one level').toEqual([])
  })

  it('states summary counts that match its own lists', () => {
    for (const [index, level] of LEVELS.entries()) {
      const label = level.replace('## ', '')
      const row = new RegExp(`\\|\\s*${label}\\s*\\|\\s*(\\d+)\\s*\\|`, 'i').exec(MATRIX)
      expect(row, `summary row for "${label}" is missing`).not.toBeNull()
      expect(Number(row?.[1]), `summary count for "${label}"`).toBe(sections[index]?.size)
    }
  })

  it('accounts for the whole registry across the three levels', () => {
    expect(categorised.size).toBe(registry.length)
  })
})
