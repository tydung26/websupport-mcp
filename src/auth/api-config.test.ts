import { describe, expect, it, vi } from 'vitest'
import { describeCredentials, loadApiConfig, loadCredentials } from './api-config.js'
import { DEFAULT_API_BASE_URL } from './market-hosts.js'

const VALID = {
  WEBSUPPORT_API_KEY: 'ak_live',
  WEBSUPPORT_API_SECRET: 's3cr3t',
}

describe('loadCredentials', () => {
  it('reads both values from the supplied env', () => {
    expect(loadCredentials(VALID)).toEqual({ apiKey: 'ak_live', secret: 's3cr3t' })
  })

  it('trims surrounding whitespace, so a pasted trailing newline still works', () => {
    expect(
      loadCredentials({ WEBSUPPORT_API_KEY: ' ak \n', WEBSUPPORT_API_SECRET: '\ts3\n' }),
    ).toEqual({ apiKey: 'ak', secret: 's3' })
  })

  it.each([
    ['WEBSUPPORT_API_KEY', { WEBSUPPORT_API_SECRET: 's3cr3t' }],
    ['WEBSUPPORT_API_SECRET', { WEBSUPPORT_API_KEY: 'ak_live' }],
  ])('throws actionably when %s is absent', (name, env) => {
    expect(() => loadCredentials(env)).toThrow(new RegExp(`${name} is not set`))
    expect(() => loadCredentials(env)).toThrow(/\.env\.example/)
  })

  it('treats a whitespace-only value as absent', () => {
    expect(() => loadCredentials({ ...VALID, WEBSUPPORT_API_SECRET: '   ' })).toThrow(
      /WEBSUPPORT_API_SECRET is not set/,
    )
  })

  it('never echoes the secret in the thrown message', () => {
    try {
      loadCredentials({ WEBSUPPORT_API_SECRET: 's3cr3t' })
      expect.unreachable('expected a throw')
    } catch (error) {
      expect(String(error)).not.toContain('s3cr3t')
    }
  })
})

describe('loadApiConfig', () => {
  it('defaults the base URL and language', () => {
    const config = loadApiConfig(VALID)
    expect(config.baseUrl).toBe(DEFAULT_API_BASE_URL)
    expect(config.acceptLanguage).toBe('en_us')
  })

  it('accepts a configured market host without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadApiConfig({
      ...VALID,
      WEBSUPPORT_API_BASE_URL: 'https://rest.websupport.se',
    })
    expect(config.baseUrl).toBe('https://rest.websupport.se')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('warns to stderr, not stdout, on an unknown host', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const config = loadApiConfig({
      ...VALID,
      WEBSUPPORT_API_BASE_URL: 'https://rest.websupport.pl',
    })
    expect(config.baseUrl).toBe('https://rest.websupport.pl')
    expect(warn).toHaveBeenCalledOnce()
    expect(log).not.toHaveBeenCalled()
    warn.mockRestore()
    log.mockRestore()
  })

  it.each(['en_us', 'sk', 'cs_cz', 'hu'])('accepts documented language %s', (value) => {
    expect(loadApiConfig({ ...VALID, WEBSUPPORT_ACCEPT_LANGUAGE: value }).acceptLanguage).toBe(
      value,
    )
  })

  it('rejects an undocumented language, including the plausible Swedish one', () => {
    expect(() => loadApiConfig({ ...VALID, WEBSUPPORT_ACCEPT_LANGUAGE: 'sv' })).toThrow(
      /WEBSUPPORT_ACCEPT_LANGUAGE must be one of/,
    )
  })
})

describe('describeCredentials', () => {
  it('reports the secret length rather than the secret', () => {
    const summary = describeCredentials({ apiKey: 'ak_live', secret: 's3cr3t' })
    expect(summary).toBe('apiKey=ak_live secretLength=6')
    expect(summary).not.toContain('s3cr3t')
  })
})
