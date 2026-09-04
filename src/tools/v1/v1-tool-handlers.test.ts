import { describe, expect, it } from 'vitest'
import { toolByName } from '../registry.js'
import type { ApiResponse, Ctx, RequestSpec } from '../types.js'

/**
 * Path construction for the v1 read surface, verified offline with a stubbed
 * transport.
 *
 * Every path asserted here was also confirmed to be a real route against the
 * live API on 2026-08-25: the server distinguishes "no such route"
 * (`404 The system is unable to find the requested action …`) from "no such
 * record" (`404 Hosting not found`), so all 30 route shapes could be validated
 * against an account owning nothing.
 */

function stubCtx(responses: ApiResponse[] = [{ status: 200, body: {} }]) {
  const calls: RequestSpec[] = []
  let index = 0
  const ctx: Ctx = {
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

/** Parse through the schema first, so defaults such as `userId` apply. */
async function callTool(name: string, input: unknown, responses?: ApiResponse[]) {
  const t = tool(name)
  const parsed = t.inputSchema.parse(input)
  const { ctx, calls } = stubCtx(responses)
  const result = await t.handler(parsed, ctx)
  return { result, calls }
}

describe('userId defaults to self', () => {
  it.each([
    ['ws_user_get', {}, '/v1/user/self'],
    ['ws_service_list', {}, '/v1/user/self/service'],
    ['ws_zone_list', {}, '/v1/user/self/zone'],
    ['ws_hosting_list', {}, '/v1/user/self/hosting'],
    ['ws_vps_list', {}, '/v1/user/self/vps'],
    ['ws_invoice_list', {}, '/v1/user/self/invoice'],
  ])('%s with no userId hits %s', async (name, input, path) => {
    const { calls } = await callTool(name, input)
    expect(calls[0]?.path).toBe(path)
  })

  it('uses an explicit id when given one', async () => {
    const { calls } = await callTool('ws_user_get', { userId: '3202473' })
    expect(calls[0]?.path).toBe('/v1/user/3202473')
  })
})

describe('path construction', () => {
  it.each([
    ['ws_service_get', { serviceId: '42' }, '/v1/user/self/service/42'],
    ['ws_zone_get', { domain: 'example.com' }, '/v1/user/self/zone/example.com'],
    ['ws_hosting_get', { hostingId: 'h1' }, '/v1/user/self/hosting/h1'],
    ['ws_hosting_vhost_list', { hostingId: 'h1' }, '/v1/user/self/hosting/h1/vhost'],
    [
      'ws_hosting_vhost_get',
      { hostingId: 'h1', vhostId: 'v2' },
      '/v1/user/self/hosting/h1/vhost/v2',
    ],
    ['ws_db_list', { hostingId: 'h1' }, '/v1/user/self/hosting/h1/db'],
    ['ws_db_get', { hostingId: 'h1', databaseId: 'd3' }, '/v1/user/self/hosting/h1/db/d3'],
    ['ws_db_users_list', { hostingId: 'h1' }, '/v1/user/self/hosting/h1/dbusers'],
    ['ws_mailbox_list', { hostingId: 'h1' }, '/v1/user/self/hosting/h1/mailbox'],
    ['ws_mailbox_get', { hostingId: 'h1', mailboxId: 'm4' }, '/v1/user/self/hosting/h1/mailbox/m4'],
    ['ws_vps_get', { vpsId: 'vps1' }, '/v1/user/self/vps/vps1'],
    ['ws_vps_vnc', { vpsId: 'vps1' }, '/v1/user/self/vps/vps1/vnc'],
    ['ws_invoice_get', { invoiceId: 'i9' }, '/v1/user/self/invoice/i9'],
  ])('%s builds %s', async (name, input, path) => {
    const { calls } = await callTool(name, input)
    expect(calls[0]?.path).toBe(path)
  })

  it('encodes an id that would otherwise break the path', async () => {
    const { calls } = await callTool('ws_zone_get', { domain: 'a/b .com' })
    expect(calls[0]?.path).toBe('/v1/user/self/zone/a%2Fb%20.com')
  })
})

describe('kind enums map to the right suffix', () => {
  it.each([
    ['size', '/v1/user/self/hosting/h1/size-stats'],
    ['domain', '/v1/user/self/hosting/h1/domain-stats'],
    ['ftp', '/v1/user/self/hosting/h1/ftp-stats'],
  ])('hosting stats kind=%s', async (kind, path) => {
    const { calls } = await callTool('ws_hosting_stats', { hostingId: 'h1', kind })
    expect(calls[0]?.path).toBe(path)
  })

  it.each([
    ['size', '/v1/user/self/hosting/h1/db/d1/size-stats'],
    ['cpu', '/v1/user/self/hosting/h1/db/d1/cpu-stats'],
  ])('db stats kind=%s', async (kind, path) => {
    const { calls } = await callTool('ws_db_stats', { hostingId: 'h1', databaseId: 'd1', kind })
    expect(calls[0]?.path).toBe(path)
  })

  it.each([
    ['cpu', '/v1/user/self/vps/v1/cpu-stats'],
    ['traffic', '/v1/user/self/vps/v1/traffic-stats'],
  ])('vps stats kind=%s', async (kind, path) => {
    const { calls } = await callTool('ws_vps_stats', { vpsId: 'v1', kind })
    expect(calls[0]?.path).toBe(path)
  })

  it.each([
    ['ws_hosting_stats', { hostingId: 'h1', kind: 'bogus' }],
    ['ws_db_stats', { hostingId: 'h1', databaseId: 'd1', kind: 'bogus' }],
    ['ws_vps_stats', { vpsId: 'v1', kind: 'bogus' }],
  ])('%s rejects an unknown kind offline', (name, input) => {
    expect(tool(name).inputSchema.safeParse(input).success).toBe(false)
  })
})

describe('ws_mail_stats domain scoping', () => {
  it('omits the domain segment when no domain is given', async () => {
    const { calls } = await callTool('ws_mail_stats', { hostingId: 'h1' })
    expect(calls[0]?.path).toBe('/v1/user/self/hosting/h1/mail/size-stats')
  })

  it('inserts the domain segment when one is given', async () => {
    const { calls } = await callTool('ws_mail_stats', { hostingId: 'h1', domain: 'example.com' })
    expect(calls[0]?.path).toBe('/v1/user/self/hosting/h1/mail/example.com/size-stats')
  })
})

describe('v1 pagination', () => {
  it.each(['ws_zone_list', 'ws_hosting_list', 'ws_vps_list', 'ws_invoice_list'])(
    '%s sends page and pagesize — not the v2 rowsPerPage',
    async (name) => {
      const { calls } = await callTool(name, { page: 2, pagesize: 50 })
      expect(calls[0]?.query).toMatchObject({ page: 2, pagesize: 50 })
    },
  )

  it('sends nothing when paging is unset', async () => {
    const { calls } = await callTool('ws_invoice_list', {})
    expect(calls[0]?.query).toEqual({})
  })

  it('rejects the v2 parameter name, so the mismatch fails loudly', () => {
    expect(tool('ws_invoice_list').inputSchema.safeParse({ rowsPerPage: 10 }).success).toBe(false)
  })

  /**
   * `/service` ignores `pagesize` where the other four list endpoints echo it
   * back — measured live 2026-08-25. The tool therefore advertises no paging
   * at all rather than an argument the server silently drops.
   */
  it('ws_service_list declares no paging arguments', () => {
    expect(tool('ws_service_list').inputSchema.safeParse({ pagesize: 10 }).success).toBe(false)
    expect(tool('ws_service_list').inputSchema.safeParse({ page: 1 }).success).toBe(false)
    expect(tool('ws_service_list').inputSchema.safeParse({}).success).toBe(true)
  })
})

describe('ws_invoice_pdf', () => {
  const pdf: ApiResponse = { status: 200, body: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]) }

  it('never inlines raw bytes in binary mode', async () => {
    const { result, calls } = await callTool(
      'ws_invoice_pdf',
      { invoiceId: 'i1', format: 'binary' },
      [pdf],
    )
    expect(calls[0]?.path).toBe('/v1/user/self/invoice/i1/raw-pdf')
    expect(calls[0]?.responseType).toBe('bytes')
    expect(result).toMatchObject({ format: 'binary', byteLength: 5 })
    expect(JSON.stringify(result)).not.toContain('JVBGR')
    expect(Object.keys(result as object)).not.toContain('base64')
  })

  it('defaults to binary rather than dumping a document into the conversation', async () => {
    const { result } = await callTool('ws_invoice_pdf', { invoiceId: 'i1' }, [pdf])
    expect(result).toMatchObject({ format: 'binary' })
  })

  it('encodes the document only when base64 is asked for, from the other endpoint', async () => {
    const { result, calls } = await callTool(
      'ws_invoice_pdf',
      { invoiceId: 'i1', format: 'base64' },
      [pdf],
    )
    expect(calls[0]?.path).toBe('/v1/user/self/invoice/i1/pdf')
    expect(result).toMatchObject({ format: 'base64', base64: 'JVBERi0=', byteLength: 5 })
  })
})
