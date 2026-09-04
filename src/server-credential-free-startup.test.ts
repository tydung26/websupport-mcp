import { describe, expect, it, vi } from 'vitest'
import { createApiConfigSource } from './auth/api-config.js'
import { resolveTierPolicy } from './policy/risk-tiers.js'
import { createCtx, createServer } from './server.js'
import { registry } from './tools/registry.js'

/**
 * A server with no credentials in its environment must still build.
 *
 * 0.1.1 read the credentials in `main()`, so an unauthenticated start exited
 * before the transport opened and every automated consumer — registry build
 * sandboxes, MCP Inspector, client config probes — saw only
 * `MCP error -32000: Connection closed`. The tools are public information;
 * only calling one needs a secret.
 */

const EMPTY = {}

describe('startup without credentials', () => {
  it('builds a server and registers the read tier', () => {
    const source = createApiConfigSource(EMPTY)
    const policy = resolveTierPolicy(EMPTY)

    expect(() => createServer(source, policy)).not.toThrow()
    expect(registry.filter((tool) => tool.tier === 'read')).not.toHaveLength(0)
  })

  it('fails the first request with the actionable message, without a network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const ctx = createCtx(createApiConfigSource(EMPTY).resolve)

    await expect(ctx.request({ method: 'GET', path: '/v1/user/self' })).rejects.toThrow(
      /WEBSUPPORT_API_KEY is not set/,
    )
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
