import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { allowedTools, resolveTierPolicy } from '../policy/risk-tiers.js'
import { CONFIRM_DESCRIPTION } from './confirm.js'
import { registry } from './registry.js'

const SRC = fileURLToPath(new URL('..', import.meta.url))

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

/**
 * Registry-wide invariants. Enforced structurally rather than by author
 * discipline, because every one of them is the kind of thing that survives
 * review and then quietly stops holding on the next tool added.
 */

describe('registry hygiene', () => {
  it('has unique tool names', () => {
    const names = registry.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('names every tool ws_<group>_<action>', () => {
    for (const tool of registry) {
      expect(tool.name).toMatch(/^ws_[a-z0-9]+(_[a-z0-9]+)+$/)
    }
  })

  it('gives every tool a non-trivial description', () => {
    for (const tool of registry) {
      expect(tool.description.length).toBeGreaterThan(30)
    }
  })
})

describe('confirm gate', () => {
  it('every destructive tool declares confirm, and no other tool does', () => {
    for (const tool of registry) {
      const shape = (tool.inputSchema as unknown as { shape?: Record<string, unknown> }).shape ?? {}
      const hasConfirm = Object.hasOwn(shape, 'confirm')
      expect(hasConfirm, `${tool.name} (tier ${tool.tier})`).toBe(tool.tier === 'destructive')
    }
  })

  it('rejects a destructive call without confirm', () => {
    for (const tool of registry.filter((t) => t.tier === 'destructive')) {
      const result = tool.inputSchema.safeParse({ service: '1', record: '2', ftpAccount: '2' })
      expect(result.success, tool.name).toBe(false)
    }
  })

  it('rejects confirm: false as firmly as an omitted confirm', () => {
    for (const tool of registry.filter((t) => t.tier === 'destructive')) {
      const result = tool.inputSchema.safeParse({
        service: '1',
        record: '2',
        ftpAccount: '2',
        confirm: false,
      })
      expect(result.success, tool.name).toBe(false)
    }
  })

  it('uses one shared wording so the gate reads identically everywhere', () => {
    for (const tool of registry.filter((t) => t.tier === 'destructive')) {
      const shape = (
        tool.inputSchema as unknown as { shape: Record<string, { description?: string }> }
      ).shape
      expect(shape.confirm?.description).toBe(CONFIRM_DESCRIPTION)
    }
  })

  it('names the concrete irreversible effect in every destructive description', () => {
    for (const tool of registry.filter((t) => t.tier === 'destructive')) {
      expect(tool.description.toLowerCase()).toMatch(
        /permanently|cannot be (recovered|restored)|lost/,
      )
    }
  })
})

describe('tool surface', () => {
  const V2 = [
    'ws_auth_check',
    'ws_dns_zone_get',
    'ws_dns_record_list',
    'ws_dns_record_create',
    'ws_dns_record_update',
    'ws_dns_record_delete',
    'ws_ftp_account_list',
    'ws_ftp_account_get',
    'ws_ftp_account_create',
    'ws_ftp_account_update',
    'ws_ftp_account_delete',
    'ws_domain_assign',
    'ws_dyndns_update',
  ]

  const V1_READ = [
    'ws_user_get',
    'ws_service_list',
    'ws_service_get',
    'ws_zone_list',
    'ws_zone_get',
    'ws_hosting_list',
    'ws_hosting_get',
    'ws_hosting_vhost_list',
    'ws_hosting_vhost_get',
    'ws_hosting_stats',
    'ws_db_list',
    'ws_db_get',
    'ws_db_users_list',
    'ws_db_stats',
    'ws_mailbox_list',
    'ws_mailbox_get',
    'ws_mail_stats',
    'ws_vps_list',
    'ws_vps_get',
    'ws_vps_stats',
    'ws_vps_vnc',
    'ws_invoice_list',
    'ws_invoice_get',
    'ws_invoice_pdf',
  ]

  const V1_WRITE = [
    'ws_db_create',
    'ws_db_update',
    'ws_db_delete',
    'ws_mailbox_create',
    'ws_mailbox_update',
    'ws_mailbox_delete',
    'ws_vps_reboot',
    'ws_vps_hard_reboot',
    'ws_vps_snapshot_list',
    'ws_vps_snapshot_create',
    'ws_vps_snapshot_restore',
    'ws_vps_snapshot_delete',
    'ws_service_set_auto_extend',
  ]

  it('registers all 50 tools: 13 v2, 24 v1 read, 13 v1 mutating', () => {
    expect(registry).toHaveLength(50)
    expect(registry.map((t) => t.name)).toEqual([...V2, ...V1_READ, ...V1_WRITE])
  })

  it('splits the tiers 30 read / 13 write / 7 destructive', () => {
    const count = (tier: string) => registry.filter((t) => t.tier === tier).length
    expect({
      read: count('read'),
      write: count('write'),
      destructive: count('destructive'),
    }).toEqual({ read: 30, write: 13, destructive: 7 })
  })

  it('tiers the VPS operations by what they destroy, not by whether they write', () => {
    const tierOf = (name: string) => registry.find((t) => t.name === name)?.tier
    // Graceful reboot is recoverable; a hard power-cycle can corrupt in-flight writes.
    expect(tierOf('ws_vps_reboot')).toBe('write')
    expect(tierOf('ws_vps_hard_reboot')).toBe('destructive')
    // Taking a snapshot is additive; restoring one discards everything since.
    expect(tierOf('ws_vps_snapshot_create')).toBe('write')
    expect(tierOf('ws_vps_snapshot_restore')).toBe('destructive')
    expect(tierOf('ws_vps_snapshot_delete')).toBe('destructive')
    // Listing snapshots stays readable in a read-only deployment.
    expect(tierOf('ws_vps_snapshot_list')).toBe('read')
  })

  it('makes every v1 read tool tier read', () => {
    for (const name of V1_READ) {
      expect(registry.find((t) => t.name === name)?.tier, name).toBe('read')
    }
  })

  it('shows every read tool, and only read tools, with no env opt-ins', () => {
    const visible = allowedTools(registry, resolveTierPolicy({}))
    expect(visible.every((t) => t.tier === 'read')).toBe(true)
    // 5 v2 reads, 24 v1 reads, plus ws_vps_snapshot_list.
    expect(visible).toHaveLength(30)
    expect(visible.map((t) => t.name)).toContain('ws_vps_snapshot_list')
    for (const name of V1_READ) {
      expect(visible.map((t) => t.name)).toContain(name)
    }
  })

  it('adds write tools only with ALLOW_WRITE, destructive only with ALLOW_DESTRUCTIVE', () => {
    const write = allowedTools(registry, resolveTierPolicy({ WEBSUPPORT_ALLOW_WRITE: '1' }))
    expect(write.some((t) => t.tier === 'write')).toBe(true)
    expect(write.some((t) => t.tier === 'destructive')).toBe(false)

    const destructive = allowedTools(
      registry,
      resolveTierPolicy({ WEBSUPPORT_ALLOW_DESTRUCTIVE: '1' }),
    )
    expect(destructive.some((t) => t.tier === 'destructive')).toBe(true)
    expect(destructive.some((t) => t.tier === 'write')).toBe(false)
  })
})

describe('out-of-scope endpoints', () => {
  /**
   * Order creation and invoice/order payment are deliberately absent. That is a
   * scope boundary the project states publicly, so it is grepped out of the
   * source rather than trusted — a path literal is what would reintroduce it,
   * and a path literal is what this looks for.
   */
  it('no source file constructs an /order or /pay path', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith('.test.ts'))
      .filter((file) => /['`/]\/(order|pay)\b/.test(readFileSync(file, 'utf8')))

    expect(offenders).toEqual([])
  })
})
