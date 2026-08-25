import { describe, expect, it } from 'vitest'
import { buildPathWithQuery } from './build-path-with-query.js'

describe('buildPathWithQuery', () => {
  it("reproduces the docs' own signing example byte-exactly", () => {
    // This exact string is the one the v2 docs sign in their worked example,
    // and it is pinned in the Phase 1 signer vectors. If it changes, every
    // signature changes with it.
    expect(buildPathWithQuery('/v2/some/url', { attributes: 123, some: 'aaa' })).toBe(
      '/v2/some/url?attributes=123&some=aaa',
    )
  })

  it('returns the bare path with no trailing ? when the query is empty', () => {
    expect(buildPathWithQuery('/v1/user/self')).toBe('/v1/user/self')
    expect(buildPathWithQuery('/v1/user/self', {})).toBe('/v1/user/self')
    expect(buildPathWithQuery('/v1/user/self', { page: undefined, sortBy: null })).toBe(
      '/v1/user/self',
    )
  })

  it('preserves declared key order rather than sorting', () => {
    expect(buildPathWithQuery('/p', { zeta: 1, alpha: 2, mid: 3 })).toBe('/p?zeta=1&alpha=2&mid=3')
  })

  it('encodes scalars, including the ones URLSearchParams would mangle', () => {
    expect(buildPathWithQuery('/p', { q: 'a b&c=d' })).toBe('/p?q=a%20b%26c%3Dd')
    expect(buildPathWithQuery('/p', { flag: true })).toBe('/p?flag=true')
  })

  it('emits the filters deepObject with literal unencoded brackets', () => {
    expect(
      buildPathWithQuery('/v2/service/1/dns/record', {
        page: 2,
        filters: { name: 'www', type: ['A', 'AAAA'] },
      }),
    ).toBe(
      '/v2/service/1/dns/record?page=2&filters[name]=www&filters[type][]=A&filters[type][]=AAAA',
    )
  })

  it('skips unset keys inside a deepObject', () => {
    expect(buildPathWithQuery('/p', { filters: { name: 'x', type: undefined, ttl: 600 } })).toBe(
      '/p?filters[name]=x&filters[ttl]=600',
    )
  })

  it('omits the query entirely when a deepObject contributes no pairs', () => {
    expect(buildPathWithQuery('/p', { filters: {} })).toBe('/p')
  })

  it('emits repeated bracket pairs for a top-level array', () => {
    expect(buildPathWithQuery('/p', { tag: ['a', 'b'] })).toBe('/p?tag[]=a&tag[]=b')
  })

  it('percent-encodes values inside a deepObject but never the brackets', () => {
    expect(buildPathWithQuery('/p', { filters: { content: 'v=spf1 -all' } })).toBe(
      '/p?filters[content]=v%3Dspf1%20-all',
    )
  })
})
