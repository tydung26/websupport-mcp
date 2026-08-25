import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { RiskTier, ToolDef } from '../tools/types.js'
import { allowedTools, describeTierPolicy, isTierAllowed, resolveTierPolicy } from './risk-tiers.js'

function tool(name: string, tier: RiskTier): ToolDef<unknown> {
  return {
    name,
    description: name,
    tier,
    inputSchema: z.strictObject({}),
    handler: async () => null,
  }
}

const REGISTRY = [
  tool('ws_dns_record_list', 'read'),
  tool('ws_dns_record_create', 'write'),
  tool('ws_dns_record_delete', 'destructive'),
]

describe('resolveTierPolicy', () => {
  it('defaults to read only', () => {
    expect(resolveTierPolicy({})).toEqual({ read: true, write: false, destructive: false })
  })

  it.each(['0', 'true', 'yes', '', ' '])('treats %p as not opted in', (value) => {
    expect(resolveTierPolicy({ WEBSUPPORT_ALLOW_WRITE: value }).write).toBe(false)
  })

  it('accepts exactly "1", trimmed', () => {
    expect(resolveTierPolicy({ WEBSUPPORT_ALLOW_WRITE: ' 1 ' }).write).toBe(true)
  })
})

describe('tier independence', () => {
  // The two opt-ins must not imply each other: a deployment can allow a VPS
  // reboot without allowing a mailbox rewrite, and the reverse.
  it('write opt-in alone does not unlock destructive', () => {
    const policy = resolveTierPolicy({ WEBSUPPORT_ALLOW_WRITE: '1' })
    expect(policy.write).toBe(true)
    expect(policy.destructive).toBe(false)
  })

  it('destructive opt-in alone does not unlock write', () => {
    const policy = resolveTierPolicy({ WEBSUPPORT_ALLOW_DESTRUCTIVE: '1' })
    expect(policy.destructive).toBe(true)
    expect(policy.write).toBe(false)
  })
})

describe('allowedTools across all four env permutations', () => {
  it.each([
    [{}, ['ws_dns_record_list']],
    [{ WEBSUPPORT_ALLOW_WRITE: '1' }, ['ws_dns_record_list', 'ws_dns_record_create']],
    [{ WEBSUPPORT_ALLOW_DESTRUCTIVE: '1' }, ['ws_dns_record_list', 'ws_dns_record_delete']],
    [
      { WEBSUPPORT_ALLOW_WRITE: '1', WEBSUPPORT_ALLOW_DESTRUCTIVE: '1' },
      ['ws_dns_record_list', 'ws_dns_record_create', 'ws_dns_record_delete'],
    ],
  ])('env %j exposes %j', (env, expected) => {
    const names = allowedTools(REGISTRY, resolveTierPolicy(env)).map((t) => t.name)
    expect(names).toEqual(expected)
  })

  it('read tools are always registered', () => {
    expect(isTierAllowed('read', resolveTierPolicy({}))).toBe(true)
  })
})

describe('describeTierPolicy', () => {
  it.each([
    [{}, 'read'],
    [{ WEBSUPPORT_ALLOW_WRITE: '1' }, 'read+write'],
    [{ WEBSUPPORT_ALLOW_DESTRUCTIVE: '1' }, 'read+destructive'],
    [{ WEBSUPPORT_ALLOW_WRITE: '1', WEBSUPPORT_ALLOW_DESTRUCTIVE: '1' }, 'read+write+destructive'],
  ])('summarises %j as %s', (env, expected) => {
    expect(describeTierPolicy(resolveTierPolicy(env))).toBe(expected)
  })
})
