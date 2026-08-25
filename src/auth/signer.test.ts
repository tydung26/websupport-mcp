import { describe, expect, it } from 'vitest'
import { dateHeaderNameFor, formatDateHeader, signRequest } from './signer.js'

/**
 * Known-answer vectors. Independently recomputed 2026-08-25. They exist so the
 * canonical-string format cannot silently drift: a change to spacing, casing or
 * the timestamp position breaks them immediately.
 *
 * **Vector 2 is a documentation artefact, not a client contract.** The
 * Websupport v2 docs print `GET /v2/some/url?attributes=123&some=aaa
 * 1548240417` as their worked example, and the HMAC of that exact string is
 * pinned below — but the live server does **not** sign query strings. Verified
 * with a real key on 2026-08-25: signing the query yields
 * `401 Incorrect api key or signature.` on every paginated or filtered call,
 * while signing the bare path succeeds. `requestJson` therefore passes
 * `spec.path`, never the request-target; see `signs the path only` below.
 */
const VECTORS = [
  {
    label: 'v1 user self',
    apiKey: 'testkey',
    secret: 'secret',
    method: 'GET',
    pathForSignature: '/v1/user/self',
    unixSeconds: 1548240417,
    version: 'v1' as const,
    canonical: 'GET /v1/user/self 1548240417',
    signature: '292e87581c04369f2a636ba2739833f460e42399',
    date: '20190123T104657Z',
  },
  {
    label: 'v2 docs signing example (docs-only — see the note below)',
    apiKey: 'testkey',
    secret: 'secret',
    method: 'GET',
    pathForSignature: '/v2/some/url?attributes=123&some=aaa',
    unixSeconds: 1548240417,
    version: 'v2' as const,
    canonical: 'GET /v2/some/url?attributes=123&some=aaa 1548240417',
    signature: '5102cd9320b49311e881d181b3b16ee07d1735a9',
    date: '20190123T104657Z',
  },
  {
    label: 'v2 record create',
    apiKey: 'ak_live',
    secret: 's3cr3t',
    method: 'POST',
    pathForSignature: '/v2/service/12345/dns/record',
    unixSeconds: 1700000000,
    version: 'v2' as const,
    canonical: 'POST /v2/service/12345/dns/record 1700000000',
    signature: '74a450196639337b3e205656f57fa4e43ecf88a5',
    date: '20231114T221320Z',
  },
]

describe('signRequest pinned vectors', () => {
  for (const v of VECTORS) {
    it(`reproduces ${v.label}`, () => {
      const signed = signRequest({
        method: v.method,
        pathForSignature: v.pathForSignature,
        unixSeconds: v.unixSeconds,
        apiKey: v.apiKey,
        secret: v.secret,
        version: v.version,
      })

      expect(signed.canonicalString).toBe(v.canonical)
      expect(signed.signature).toBe(v.signature)
      expect(signed.dateHeaderValue).toBe(v.date)
    })
  }

  it('builds the documented Basic header for vector 1', () => {
    const signed = signRequest({
      method: 'GET',
      pathForSignature: '/v1/user/self',
      unixSeconds: 1548240417,
      apiKey: 'testkey',
      secret: 'secret',
      version: 'v1',
    })
    expect(signed.authorization).toBe(
      'Basic dGVzdGtleToyOTJlODc1ODFjMDQzNjlmMmE2MzZiYTI3Mzk4MzNmNDYwZTQyMzk5',
    )
  })
})

describe('date header name', () => {
  /**
   * Probed live 2026-08-25 with a junk key, no real credential needed:
   *   GET /v1/user/self with `Date`   -> 401 Incorrect api key or signature.
   *   GET /v1/user/self with `X-Date` -> 400 Missing date header.
   *   GET /v2/check     with either   -> 401 Incorrect api key or signature.
   * So v1 *requires* `Date` and rejects `X-Date`, while v2 accepts either. The
   * asymmetry is a v1 constraint. Collapsing both onto one header name looks
   * like a simplification and breaks every v1 call.
   */
  it('emits Date for v1', () => {
    expect(dateHeaderNameFor('v1')).toBe('Date')
  })

  it('emits X-Date for v2', () => {
    expect(dateHeaderNameFor('v2')).toBe('X-Date')
  })

  it('carries the name through signRequest', () => {
    const base = {
      method: 'GET',
      pathForSignature: '/x',
      unixSeconds: 0,
      apiKey: 'k',
      secret: 's',
    }
    expect(signRequest({ ...base, version: 'v1' }).dateHeaderName).toBe('Date')
    expect(signRequest({ ...base, version: 'v2' }).dateHeaderName).toBe('X-Date')
  })
})

describe('formatDateHeader', () => {
  it('pads every component and stays UTC', () => {
    // 2009-02-13T23:31:30Z
    expect(formatDateHeader(1234567890)).toBe('20090213T233130Z')
    // 1970-01-01T00:00:00Z — proves zero-padding across the board.
    expect(formatDateHeader(0)).toBe('19700101T000000Z')
    // 2001-09-09T01:46:40Z — single-digit month, day, hour.
    expect(formatDateHeader(1000000000)).toBe('20010909T014640Z')
  })

  it('ignores sub-second precision', () => {
    expect(formatDateHeader(1548240417)).toBe(formatDateHeader(Math.floor(1548240417)))
  })
})

describe('the query string is not signed', () => {
  /**
   * Live-verified 2026-08-25 with a real key, on v1 and v2, with and without a
   * `filters` deepObject. This is the single most load-bearing correction in
   * the client: the vendor docs say otherwise and are wrong.
   */
  it('signs whatever path it is handed, and the caller hands it the bare path', () => {
    const bare = signRequest({
      method: 'GET',
      pathForSignature: '/v2/some/url',
      unixSeconds: 1548240417,
      apiKey: 'testkey',
      secret: 'secret',
      version: 'v2',
    })
    expect(bare.canonicalString).toBe('GET /v2/some/url 1548240417')
    expect(bare.signature).toBe('ea83355ceea56deb0c7a4e54eee1a239e7711f4e')

    // Signing the docs' query-bearing form produces a different signature —
    // the one the live server rejects.
    const withQuery = signRequest({
      method: 'GET',
      pathForSignature: '/v2/some/url?attributes=123&some=aaa',
      unixSeconds: 1548240417,
      apiKey: 'testkey',
      secret: 'secret',
      version: 'v2',
    })
    expect(withQuery.signature).not.toBe(bare.signature)
  })
})

describe('secret handling', () => {
  it('never returns the secret in any field', () => {
    const secret = 'super-secret-value'
    const signed = signRequest({
      method: 'GET',
      pathForSignature: '/v1/user/self',
      unixSeconds: 1548240417,
      apiKey: 'testkey',
      secret,
      version: 'v1',
    })
    const serialised = JSON.stringify(signed)
    expect(serialised).not.toContain(secret)
    // The Basic header carries the *signature*, not the secret — decode it and
    // confirm the secret is absent there too.
    const decoded = Buffer.from(signed.authorization.slice('Basic '.length), 'base64').toString()
    expect(decoded).not.toContain(secret)
    expect(decoded).toBe(`testkey:${signed.signature}`)
  })

  it('canonical string is safe to log', () => {
    const signed = signRequest({
      method: 'GET',
      pathForSignature: '/v1/user/self',
      unixSeconds: 1548240417,
      apiKey: 'testkey',
      secret: 'secret',
      version: 'v1',
    })
    expect(signed.canonicalString).not.toContain('secret:')
    expect(signed.canonicalString).toBe('GET /v1/user/self 1548240417')
  })
})
