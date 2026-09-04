import { describe, expect, it, vi } from 'vitest'
import type { ApiConfig } from '../../auth/api-config.js'
import { toolByName } from '../registry.js'
import type { ApiResponse, Ctx, RequestSpec } from '../types.js'

/**
 * Handler behaviour with a stubbed transport — request construction and the
 * create-then-re-list contract, verified without a credential or a network.
 */

const CONFIG: ApiConfig = {
  apiKey: 'k',
  secret: 's',
  baseUrl: 'https://rest.websupport.sk',
  acceptLanguage: 'en_us',
}

function stubCtx(responses: ApiResponse[]) {
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

describe('ws_dns_record_create', () => {
  it('re-lists after the 204 so the caller gets a record with an id', async () => {
    const created = { id: 42, name: 'probe', content: 'hello', ttl: 600, type: 'TXT' }
    const { ctx, calls } = stubCtx([
      { status: 204, body: null },
      { status: 200, body: { currentPage: 1, data: [created] } },
    ])

    const result = (await tool('ws_dns_record_create').handler(
      { service: '12345', type: 'TXT', name: 'probe', content: 'hello', ttl: 600 },
      ctx,
    )) as { status: number; record: unknown }

    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/v2/service/12345/dns/record',
      body: { type: 'TXT', name: 'probe', content: 'hello', ttl: 600 },
    })
    expect(calls[1]).toEqual({
      method: 'GET',
      path: '/v2/service/12345/dns/record',
      query: { filters: { name: 'probe', type: ['TXT'], content: 'hello' } },
    })
    expect(result.status).toBe(204)
    expect(result.record).toEqual(created)
  })

  it('returns record: null rather than inventing one when the re-list finds nothing', async () => {
    const { ctx } = stubCtx([
      { status: 204, body: null },
      { status: 200, body: { data: [] } },
    ])
    const result = (await tool('ws_dns_record_create').handler(
      { service: '1', type: 'A', name: 'x', content: '1.2.3.4' },
      ctx,
    )) as { record: unknown }
    expect(result.record).toBeNull()
  })

  it('prefers the highest id when the filter still matches several', async () => {
    const { ctx } = stubCtx([
      { status: 204, body: null },
      { status: 200, body: { data: [{ id: 7 }, { id: 99 }, { id: 12 }] } },
    ])
    const result = (await tool('ws_dns_record_create').handler(
      { service: '1', type: 'A', name: 'x', content: '1.2.3.4' },
      ctx,
    )) as { record: { id: number } }
    expect(result.record.id).toBe(99)
  })

  it('omits unset fields from the body rather than sending nulls', async () => {
    const { ctx, calls } = stubCtx([
      { status: 204, body: null },
      { status: 200, body: { data: [] } },
    ])
    await tool('ws_dns_record_create').handler({ service: '1', type: 'A', name: 'x' }, ctx)
    expect(calls[0]?.body).toEqual({ type: 'A', name: 'x' })
  })
})

describe('ws_dns_record_list', () => {
  it('passes paging and the filters deepObject straight through', async () => {
    const { ctx, calls } = stubCtx([{ status: 200, body: { data: [] } }])
    await tool('ws_dns_record_list').handler(
      { service: '12345', page: 2, rowsPerPage: 50, filters: { name: 'www', type: ['A', 'AAAA'] } },
      ctx,
    )
    expect(calls[0]).toEqual({
      method: 'GET',
      path: '/v2/service/12345/dns/record',
      query: { page: 2, rowsPerPage: 50, filters: { name: 'www', type: ['A', 'AAAA'] } },
    })
  })
})

describe('ws_dns_record_delete', () => {
  it('builds the delete path and ignores the confirm flag as a body field', async () => {
    const { ctx, calls } = stubCtx([{ status: 204, body: null }])
    const result = await tool('ws_dns_record_delete').handler(
      { service: '12345', record: '99', confirm: true },
      ctx,
    )
    expect(calls[0]).toEqual({ method: 'DELETE', path: '/v2/service/12345/dns/record/99' })
    expect(result).toEqual({ status: 204, deleted: true })
  })
})

describe('ws_ftp_account_create', () => {
  it('sends the password but never returns it — the re-list response has no password field', async () => {
    const { ctx, calls } = stubCtx([
      { status: 204, body: null },
      { status: 200, body: { data: [{ id: 3, login: 'deploy', dir: '/web' }] } },
    ])

    const result = await tool('ws_ftp_account_create').handler(
      { service: '1', login: 'deploy', password: 'hunter2', dir: '/web' },
      ctx,
    )

    expect(calls[0]?.body).toMatchObject({ login: 'deploy', password: 'hunter2', dir: '/web' })
    expect(JSON.stringify(result)).not.toContain('hunter2')
  })
})

describe('ws_dyndns_update', () => {
  it('passes its query through permissively and returns the raw text', async () => {
    const { ctx, calls } = stubCtx([{ status: 200, body: 'good 1.2.3.4' }])
    const result = await tool('ws_dyndns_update').handler(
      { hostname: 'a.example.com', myip: '1.2.3.4' },
      ctx,
    )
    expect(calls[0]).toEqual({
      method: 'GET',
      path: '/nic/update',
      query: { hostname: 'a.example.com', myip: '1.2.3.4' },
    })
    expect(result).toBe('good 1.2.3.4')
  })

  it('accepts undeclared query keys, because upstream declares no parameters at all', () => {
    const parsed = tool('ws_dyndns_update').inputSchema.safeParse({
      hostname: 'a.example.com',
      offline: 'YES',
    })
    expect(parsed.success).toBe(true)
  })
})

describe('ws_auth_check', () => {
  it('hits /v2/check with no arguments', async () => {
    const { ctx, calls } = stubCtx([{ status: 200, body: { verified: true } }])
    const result = await tool('ws_auth_check').handler({}, ctx)
    expect(calls[0]).toEqual({ method: 'GET', path: '/v2/check' })
    expect(result).toEqual({ verified: true })
  })
})

describe('path encoding', () => {
  it('encodes a service identifier that would otherwise break the request-target', async () => {
    const { ctx, calls } = stubCtx([{ status: 200, body: {} }])
    await tool('ws_dns_zone_get').handler({ service: 'a/b c' }, ctx)
    expect(calls[0]?.path).toBe('/v2/service/a%2Fb%20c/dns/zone')
  })
})

describe('no secret reaches a tool result', () => {
  it('cannot leak through Ctx, which carries no credential at all', async () => {
    const { ctx } = stubCtx([{ status: 200, body: { verified: true } }])
    const spy = vi.spyOn(JSON, 'stringify')
    const result = await tool('ws_auth_check').handler({}, ctx)
    expect(JSON.stringify(result)).not.toContain(CONFIG.secret)
    spy.mockRestore()
  })
})
