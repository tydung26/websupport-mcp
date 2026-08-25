import { describe, expect, it } from 'vitest'
import { DEFAULT_API_BASE_URL, KNOWN_API_HOSTS, resolveBaseUrl } from './market-hosts.js'

describe('resolveBaseUrl', () => {
  it.each([undefined, '', '   '])('defaults to Slovakia for %p', (value) => {
    expect(resolveBaseUrl(value)).toEqual({ baseUrl: DEFAULT_API_BASE_URL })
  })

  it.each(KNOWN_API_HOSTS)('accepts known host %s without a warning', (host) => {
    expect(resolveBaseUrl(`https://${host}`)).toEqual({ baseUrl: `https://${host}` })
  })

  it('normalises a trailing slash to a bare origin', () => {
    expect(resolveBaseUrl('https://rest.websupport.cz/')).toEqual({
      baseUrl: 'https://rest.websupport.cz',
    })
  })

  it('warns rather than throws on an unknown host, so a new market stays usable', () => {
    const result = resolveBaseUrl('https://rest.websupport.example')
    expect(result.baseUrl).toBe('https://rest.websupport.example')
    expect(result.warning).toMatch(/not one of the known Websupport API hosts/)
  })

  it('rejects a non-https scheme', () => {
    expect(() => resolveBaseUrl('http://rest.websupport.sk')).toThrow(/must use https:/)
  })

  it.each([
    'https://rest.websupport.sk/api',
    'https://rest.websupport.sk/?a=1',
    'https://rest.websupport.sk/#x',
  ])('rejects %s because a base path corrupts the signed request-target', (value) => {
    expect(() => resolveBaseUrl(value)).toThrow(/must be an origin with no path/)
  })

  it('rejects an unparseable value', () => {
    expect(() => resolveBaseUrl('rest.websupport.sk')).toThrow(/is not a valid URL/)
  })
})
