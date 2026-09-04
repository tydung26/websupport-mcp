import { describe, expect, it, vi } from 'vitest'
import { createApiConfigSource } from './api-config.js'
import { DEFAULT_API_BASE_URL } from './market-hosts.js'

/**
 * Constructing the source must never touch a credential; only `resolve()` may.
 */

const VALID = {
  WEBSUPPORT_API_KEY: 'ak_live',
  WEBSUPPORT_API_SECRET: 's3cr3t',
}

describe('createApiConfigSource', () => {
  it('constructs with an empty environment and still reports the market', () => {
    const source = createApiConfigSource({})
    expect(source.settings.baseUrl).toBe(DEFAULT_API_BASE_URL)
    expect(source.settings.acceptLanguage).toBe('en_us')
  })

  it('defers the missing-credential error to resolve()', () => {
    const source = createApiConfigSource({})
    expect(() => source.resolve()).toThrow(/WEBSUPPORT_API_KEY is not set/)
  })

  it('resolves settings and credentials together once both are present', () => {
    const source = createApiConfigSource({
      ...VALID,
      WEBSUPPORT_API_BASE_URL: 'https://rest.websupport.cz',
      WEBSUPPORT_ACCEPT_LANGUAGE: 'cs_cz',
    })
    expect(source.resolve()).toEqual({
      apiKey: 'ak_live',
      secret: 's3cr3t',
      baseUrl: 'https://rest.websupport.cz',
      acceptLanguage: 'cs_cz',
    })
  })

  it('reads the credential once and reuses it, so a rotated env cannot split a session', () => {
    const env = { ...VALID }
    const source = createApiConfigSource(env)
    expect(source.resolve().apiKey).toBe('ak_live')
    env.WEBSUPPORT_API_KEY = 'ak_rotated'
    expect(source.resolve().apiKey).toBe('ak_live')
  })

  it('warns about an unknown host at construction, on stderr only', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    createApiConfigSource({ WEBSUPPORT_API_BASE_URL: 'https://rest.websupport.pl' })
    expect(warn).toHaveBeenCalledOnce()
    expect(log).not.toHaveBeenCalled()
    warn.mockRestore()
    log.mockRestore()
  })

  it('still rejects an undocumented language at construction', () => {
    expect(() => createApiConfigSource({ WEBSUPPORT_ACCEPT_LANGUAGE: 'sv' })).toThrow(
      /WEBSUPPORT_ACCEPT_LANGUAGE must be one of/,
    )
  })
})
