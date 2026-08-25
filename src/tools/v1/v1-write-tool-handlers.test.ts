import { describe, expect, it } from 'vitest'
import type { ApiConfig } from '../../auth/api-config.js'
import { allowedTools, resolveTierPolicy } from '../../policy/risk-tiers.js'
import { registry, toolByName } from '../registry.js'
import type { ApiResponse, Ctx, RequestSpec } from '../types.js'

/**
 * Request construction for the v1 mutating surface.
 *
 * `ws_vps_hard_reboot` and `ws_vps_snapshot_restore` are verified here and
 * **only** here — they are deliberately never fired at a real VPS, because one
 * corrupts in-flight writes and the other discards a disk. Asserting the exact
 * method and path is the whole verification for those two, so these assertions
 * carry more weight than usual.
 *
 * Every route below was separately confirmed to exist against the live API on
 * 2026-08-25, using ids for resources that do not exist so nothing could be
 * mutated.
 */

const CONFIG: ApiConfig = {
  apiKey: 'k',
  secret: 's',
  baseUrl: 'https://rest.websupport.sk',
  acceptLanguage: 'en_us',
}

function stubCtx(responses: ApiResponse[] = [{ status: 200, body: {} }]) {
  const calls: RequestSpec[] = []
  let index = 0
  const ctx: Ctx = {
    config: CONFIG,
    request: async (spec) => {
      calls.push(spec)
      return (responses[index++] ?? { status: 200, body: null }) as ApiResponse<never>
    },
  }
  return { ctx, calls }
}

function tool(name: string) {
  const found = toolByName(name)
  if (!found) throw new Error(`missing tool ${name}`)
  return found
}

async function callTool(name: string, input: unknown) {
  const t = tool(name)
  const parsed = t.inputSchema.parse(input)
  const { ctx, calls } = stubCtx()
  const result = await t.handler(parsed, ctx)
  return { result, calls }
}

describe('database writes', () => {
  it('creates with the supplied fields as the body', async () => {
    const { calls } = await callTool('ws_db_create', { hostingId: 'h1', name: 'shop' })
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/v1/user/self/hosting/h1/db',
      body: { name: 'shop' },
    })
  })

  it('forwards fields the schema does not declare, since the v1 field set is unpublished', async () => {
    const { calls } = await callTool('ws_db_create', {
      hostingId: 'h1',
      name: 'shop',
      password: 'p',
      note: 'n',
    })
    expect(calls[0]?.body).toEqual({ name: 'shop', password: 'p', note: 'n' })
  })

  it('never leaks path arguments into the body', async () => {
    const { calls } = await callTool('ws_db_update', {
      userId: 'u1',
      hostingId: 'h1',
      databaseId: 'd1',
      note: 'x',
    })
    expect(calls[0]?.path).toBe('/v1/user/u1/hosting/h1/db/d1')
    expect(calls[0]?.body).toEqual({ note: 'x' })
  })

  it('deletes by id', async () => {
    const { calls } = await callTool('ws_db_delete', {
      hostingId: 'h1',
      databaseId: 'd1',
      confirm: true,
    })
    expect(calls[0]).toEqual({ method: 'DELETE', path: '/v1/user/self/hosting/h1/db/d1' })
  })
})

describe('mailbox writes mirror the documented quirks', () => {
  /**
   * Writes are domain-rooted while reads are not, and update is POST rather
   * than PUT. Both confirmed live: `POST .../hosting/:hid/mailbox` — the
   * symmetrical-looking path — is not a route at all.
   */
  it('creates under the domain-rooted path, not the read path', async () => {
    const { calls } = await callTool('ws_mailbox_create', {
      hostingId: 'h1',
      domainId: 'd9',
      name: 'sales',
    })
    expect(calls[0]?.path).toBe('/v1/user/self/hosting/h1/domain/d9/mailbox')
    expect(calls[0]?.path).not.toBe('/v1/user/self/hosting/h1/mailbox')
  })

  it('updates with POST, not PUT', async () => {
    const { calls } = await callTool('ws_mailbox_update', {
      hostingId: 'h1',
      domainId: 'd9',
      mailboxId: 'm3',
      note: 'x',
    })
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.path).toBe('/v1/user/self/hosting/h1/domain/d9/mailbox/m3')
  })

  it('reads and writes use different roots, deliberately', async () => {
    const read = await callTool('ws_mailbox_list', { hostingId: 'h1' })
    const write = await callTool('ws_mailbox_create', {
      hostingId: 'h1',
      domainId: 'd9',
      name: 'x',
    })
    expect(read.calls[0]?.path).toBe('/v1/user/self/hosting/h1/mailbox')
    expect(write.calls[0]?.path).toBe('/v1/user/self/hosting/h1/domain/d9/mailbox')
  })

  it('deletes under the domain-rooted path', async () => {
    const { calls } = await callTool('ws_mailbox_delete', {
      hostingId: 'h1',
      domainId: 'd9',
      mailboxId: 'm3',
      confirm: true,
    })
    expect(calls[0]).toEqual({
      method: 'DELETE',
      path: '/v1/user/self/hosting/h1/domain/d9/mailbox/m3',
    })
  })
})

describe('VPS operations', () => {
  it('reboots gracefully with PUT', async () => {
    const { calls } = await callTool('ws_vps_reboot', { vpsId: 'v1' })
    expect(calls[0]).toEqual({ method: 'PUT', path: '/v1/user/self/vps/v1/reboot' })
  })

  /** Never live-fired. This assertion is the entire verification. */
  it('hard-reboots with PUT to the hard-reboot path', async () => {
    const { calls } = await callTool('ws_vps_hard_reboot', { vpsId: 'v1', confirm: true })
    expect(calls[0]).toEqual({ method: 'PUT', path: '/v1/user/self/vps/v1/hard-reboot' })
  })

  it('lists snapshots with GET', async () => {
    const { calls } = await callTool('ws_vps_snapshot_list', { vpsId: 'v1' })
    expect(calls[0]).toEqual({ method: 'GET', path: '/v1/user/self/vps/v1/snapshot' })
  })

  it('creates a snapshot with POST and only the name', async () => {
    const { calls } = await callTool('ws_vps_snapshot_create', { vpsId: 'v1', name: 'pre-upgrade' })
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/v1/user/self/vps/v1/snapshot',
      body: { name: 'pre-upgrade' },
    })
  })

  /** Never live-fired. This assertion is the entire verification. */
  it('restores with POST to the named snapshot path', async () => {
    const { calls } = await callTool('ws_vps_snapshot_restore', {
      vpsId: 'v1',
      name: 'pre-upgrade',
      confirm: true,
    })
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/v1/user/self/vps/v1/snapshot/pre-upgrade',
    })
  })

  it('deletes a snapshot with DELETE', async () => {
    const { calls } = await callTool('ws_vps_snapshot_delete', {
      vpsId: 'v1',
      name: 'old',
      confirm: true,
    })
    expect(calls[0]).toEqual({ method: 'DELETE', path: '/v1/user/self/vps/v1/snapshot/old' })
  })

  it('encodes a snapshot name that would otherwise break the path', async () => {
    const { calls } = await callTool('ws_vps_snapshot_delete', {
      vpsId: 'v1',
      name: 'a/b c',
      confirm: true,
    })
    expect(calls[0]?.path).toBe('/v1/user/self/vps/v1/snapshot/a%2Fb%20c')
  })
})

describe('ws_service_set_auto_extend', () => {
  it('sends autoExtend and nothing else', async () => {
    const { calls } = await callTool('ws_service_set_auto_extend', {
      serviceId: 's1',
      autoExtend: false,
    })
    expect(calls[0]).toEqual({
      method: 'PUT',
      path: '/v1/user/self/service/s1',
      body: { autoExtend: false },
    })
  })

  it('refuses arbitrary service properties, so billing terms cannot be edited through it', () => {
    const schema = tool('ws_service_set_auto_extend').inputSchema
    expect(schema.safeParse({ serviceId: 's1', autoExtend: true, price: 0 }).success).toBe(false)
    expect(
      schema.safeParse({ serviceId: 's1', autoExtend: true, expiration: '2030' }).success,
    ).toBe(false)
  })
})

describe('confirm gate on the new destructive tools', () => {
  const DESTRUCTIVE = [
    ['ws_db_delete', { hostingId: 'h1', databaseId: 'd1' }],
    ['ws_mailbox_delete', { hostingId: 'h1', domainId: 'd9', mailboxId: 'm1' }],
    ['ws_vps_hard_reboot', { vpsId: 'v1' }],
    ['ws_vps_snapshot_restore', { vpsId: 'v1', name: 'x' }],
    ['ws_vps_snapshot_delete', { vpsId: 'v1', name: 'x' }],
  ] as const

  it.each(DESTRUCTIVE)('%s refuses without confirm', (name, input) => {
    expect(tool(name).inputSchema.safeParse(input).success).toBe(false)
    expect(tool(name).inputSchema.safeParse({ ...input, confirm: false }).success).toBe(false)
    expect(tool(name).inputSchema.safeParse({ ...input, confirm: true }).success).toBe(true)
  })
})

describe('tier isolation across the full 50-tool registry', () => {
  it('ALLOW_WRITE alone exposes no destructive tool', () => {
    const visible = allowedTools(registry, resolveTierPolicy({ WEBSUPPORT_ALLOW_WRITE: '1' }))
    expect(visible.filter((t) => t.tier === 'destructive')).toEqual([])
    expect(visible).toHaveLength(43)
  })

  it('ALLOW_DESTRUCTIVE alone exposes no write tool', () => {
    const visible = allowedTools(registry, resolveTierPolicy({ WEBSUPPORT_ALLOW_DESTRUCTIVE: '1' }))
    expect(visible.filter((t) => t.tier === 'write')).toEqual([])
    expect(visible).toHaveLength(37)
  })

  it('both opt-ins expose everything', () => {
    const visible = allowedTools(
      registry,
      resolveTierPolicy({ WEBSUPPORT_ALLOW_WRITE: '1', WEBSUPPORT_ALLOW_DESTRUCTIVE: '1' }),
    )
    expect(visible).toHaveLength(50)
  })
})
