import { describe, expect, it } from 'vitest'
import { annotationsFor } from './server.js'
import { registry } from './tools/registry.js'

/**
 * Every tool must declare all four hints as explicit booleans. A missing hint
 * reads as unknown, not false, and at least one directory rejects the tool for
 * it outright.
 */

const HINTS = ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const

describe('tool annotations', () => {
  it.each(registry.map((tool) => [tool.name, tool] as const))('%s declares all four', (_, tool) => {
    const annotations = annotationsFor(tool)
    for (const hint of HINTS) {
      expect(typeof annotations[hint], hint).toBe('boolean')
    }
  })

  it.each(registry.map((tool) => [tool.name, tool] as const))(
    '%s hints match its tier',
    (_, tool) => {
      const { readOnlyHint, destructiveHint, idempotentHint, openWorldHint } = annotationsFor(tool)
      expect(readOnlyHint).toBe(tool.tier === 'read')
      expect(destructiveHint).toBe(tool.tier === 'destructive')
      // A write is not repeatable without further effect; a read is, and so is
      // deleting something already gone.
      expect(idempotentHint).toBe(tool.idempotent ?? tool.tier !== 'write')
      // Every tool reaches the account through the Websupport API.
      expect(openWorldHint).toBe(true)
    },
  )

  it('reports a hard reboot as non-idempotent, unlike every other destructive tool', () => {
    const byName = (name: string) => registry.find((tool) => tool.name === name)
    const hardReboot = byName('ws_vps_hard_reboot')
    const recordDelete = byName('ws_dns_record_delete')
    expect(hardReboot && annotationsFor(hardReboot).idempotentHint).toBe(false)
    expect(recordDelete && annotationsFor(recordDelete).idempotentHint).toBe(true)
  })

  it('never marks a tool both read-only and destructive', () => {
    for (const tool of registry) {
      const { readOnlyHint, destructiveHint } = annotationsFor(tool)
      expect(readOnlyHint && destructiveHint).toBe(false)
    }
  })
})
