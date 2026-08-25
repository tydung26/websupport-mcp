import { describe, expect, it, vi } from 'vitest'
import type { ApiConfig } from '../auth/api-config.js'
import { WebsupportApiError } from './map-error.js'
import { requestJson, versionForPath } from './request-json.js'

const CONFIG: ApiConfig = {
  apiKey: 'testkey',
  secret: 'secret',
  baseUrl: 'https://rest.websupport.sk',
  acceptLanguage: 'en_us',
}

function jsonResponse(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extra },
  })
}

/** 204 with no content — every v2 mutation answers this way. */
function noContent() {
  return new Response(null, { status: 204 })
}

const noSleep = () => Promise.resolve()

describe('versionForPath', () => {
  it.each(['/v1/user/self', '/v1/user/123/zone'])('%s is v1', (path) => {
    expect(versionForPath(path)).toBe('v1')
  })

  it.each(['/v2/check', '/v2/service/1/dns/record', '/nic/update'])('%s is v2', (path) => {
    expect(versionForPath(path)).toBe('v2')
  })
})

describe('requestJson signing contract', () => {
  /**
   * The query is sent but **not** signed.
   *
   * Verified live 2026-08-25 with a real key: a request whose canonical string
   * included the query returned `401 Incorrect api key or signature.` on both
   * v1 and v2, while the identical request signed over the bare path was
   * accepted. The vendor docs' worked example says the opposite and is wrong.
   */
  it('sends the query but signs only the path', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(200, { ok: true }))
    await requestJson(
      { method: 'GET', path: '/v2/some/url', query: { attributes: 123, some: 'aaa' } },
      CONFIG,
      { fetch: fetchSpy, now: () => 1548240417000 },
    )

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://rest.websupport.sk/v2/some/url?attributes=123&some=aaa')

    const headers = init.headers as Headers
    // HMAC-SHA1('secret', 'GET /v2/some/url 1548240417') — path only.
    const pathOnly = `Basic ${Buffer.from('testkey:ea83355ceea56deb0c7a4e54eee1a239e7711f4e').toString('base64')}`
    expect(headers.get('Authorization')).toBe(pathOnly)

    // The docs' query-bearing signature is what the live server rejects.
    const withQuery = `Basic ${Buffer.from('testkey:5102cd9320b49311e881d181b3b16ee07d1735a9').toString('base64')}`
    expect(headers.get('Authorization')).not.toBe(withQuery)
  })

  it('produces the same Authorization with and without a query on the same path', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(200, {}))
    const deps = { fetch: fetchSpy, now: () => 1548240417000 }

    await requestJson({ method: 'GET', path: '/v2/check' }, CONFIG, deps)
    await requestJson({ method: 'GET', path: '/v2/check', query: { page: 1 } }, CONFIG, deps)

    const first = (fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Headers
    const second = (fetchSpy.mock.calls[1] as unknown as [string, RequestInit])[1]
      .headers as Headers
    expect(second.get('Authorization')).toBe(first.get('Authorization'))
    expect((fetchSpy.mock.calls[1] as unknown as [string])[0]).toBe(
      'https://rest.websupport.sk/v2/check?page=1',
    )
  })

  it('sends Date on v1 and X-Date on v2', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(200, {}))
    const deps = { fetch: fetchSpy, now: () => 1548240417000 }

    await requestJson({ method: 'GET', path: '/v1/user/self' }, CONFIG, deps)
    let headers = (fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Headers
    expect(headers.get('Date')).toBe('20190123T104657Z')
    expect(headers.get('X-Date')).toBeNull()

    await requestJson({ method: 'GET', path: '/v2/check' }, CONFIG, deps)
    headers = (fetchSpy.mock.calls[1] as unknown as [string, RequestInit])[1].headers as Headers
    expect(headers.get('X-Date')).toBe('20190123T104657Z')
    expect(headers.get('Date')).toBeNull()
  })

  it('sends Accept-Language from config', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(200, {}))
    await requestJson(
      { method: 'GET', path: '/v1/user/self' },
      { ...CONFIG, acceptLanguage: 'sk' },
      {
        fetch: fetchSpy,
      },
    )
    const headers = (fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1]
      .headers as Headers
    expect(headers.get('Accept-Language')).toBe('sk')
  })

  it('takes the base URL from config, so a market switch needs no code change', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(200, {}))
    await requestJson(
      { method: 'GET', path: '/v2/check' },
      { ...CONFIG, baseUrl: 'https://rest.websupport.hu' },
      {
        fetch: fetchSpy,
      },
    )
    expect((fetchSpy.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://rest.websupport.hu/v2/check',
    )
  })
})

describe('response parsing', () => {
  it('returns {status: 204, body: null} and never reaches JSON.parse', async () => {
    const parse = vi.spyOn(JSON, 'parse')
    const result = await requestJson(
      { method: 'DELETE', path: '/v2/service/1/dns/record/9' },
      CONFIG,
      {
        fetch: async () => noContent(),
      },
    )
    expect(result).toEqual({ status: 204, body: null })
    expect(parse).not.toHaveBeenCalled()
    parse.mockRestore()
  })

  it('treats content-length: 0 as an empty body', async () => {
    const result = await requestJson({ method: 'GET', path: '/v2/check' }, CONFIG, {
      fetch: async () => new Response('', { status: 200, headers: { 'content-length': '0' } }),
    })
    expect(result.body).toBeNull()
  })

  it('returns text/* bodies as strings', async () => {
    const result = await requestJson({ method: 'GET', path: '/v2/thing' }, CONFIG, {
      fetch: async () =>
        new Response('<html>good</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    })
    expect(result.body).toBe('<html>good</html>')
  })

  it('parses JSON otherwise', async () => {
    const result = await requestJson({ method: 'GET', path: '/v2/check' }, CONFIG, {
      fetch: async () => jsonResponse(200, { verified: true }),
    })
    expect(result.body).toEqual({ verified: true })
  })
})

describe('/nic/update transport exception', () => {
  it('sends no date header and returns the body as a string', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response('good 1.2.3.4', { status: 200, headers: { 'content-type': 'text/html' } }),
    )
    const result = await requestJson(
      { method: 'GET', path: '/nic/update', query: { hostname: 'a.example', myip: '1.2.3.4' } },
      CONFIG,
      { fetch: fetchSpy },
    )

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Headers
    expect(headers.get('Date')).toBeNull()
    expect(headers.get('X-Date')).toBeNull()
    expect(headers.get('Authorization')).toMatch(/^Basic /)
    expect(url).toBe('https://rest.websupport.sk/nic/update?hostname=a.example&myip=1.2.3.4')
    expect(result.body).toBe('good 1.2.3.4')
  })
})

describe('errors and retry', () => {
  it('throws a mapped error on a non-retryable failure', async () => {
    await expect(
      requestJson({ method: 'GET', path: '/v2/check' }, CONFIG, {
        fetch: async () =>
          jsonResponse(401, { message: 'Incorrect api key or signature.', code: 401 }),
      }),
    ).rejects.toThrow(WebsupportApiError)
  })

  it('maps an empty 500 body without throwing a parse error', async () => {
    await expect(
      requestJson({ method: 'POST', path: '/v2/service/1/dns/record' }, CONFIG, {
        fetch: async () => new Response(null, { status: 500 }),
      }),
    ).rejects.toThrow(/no error body/)
  })

  it('never retries POST', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(503, { message: 'busy', code: 503 }))
    await expect(
      requestJson({ method: 'POST', path: '/v2/service/1/dns/record' }, CONFIG, {
        fetch: fetchSpy,
        sleep: noSleep,
      }),
    ).rejects.toThrow(WebsupportApiError)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('retries a 503 GET up to three attempts, then throws', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(503, { message: 'busy', code: 503 }))
    await expect(
      requestJson({ method: 'GET', path: '/v2/check' }, CONFIG, {
        fetch: fetchSpy,
        sleep: noSleep,
        random: () => 0,
      }),
    ).rejects.toThrow(/busy/)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('re-signs each attempt, because the timestamp is part of the canonical string', async () => {
    let call = 0
    const fetchSpy = vi.fn(async () =>
      call++ === 0 ? jsonResponse(503, {}) : jsonResponse(200, {}),
    )
    let nowMs = 1548240417000
    await requestJson({ method: 'GET', path: '/v2/check' }, CONFIG, {
      fetch: fetchSpy,
      sleep: noSleep,
      random: () => 0,
      now: () => (nowMs += 1000),
    })

    const first = (fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Headers
    const second = (fetchSpy.mock.calls[1] as unknown as [string, RequestInit])[1]
      .headers as Headers
    expect(first.get('X-Date')).not.toBe(second.get('X-Date'))
    expect(first.get('Authorization')).not.toBe(second.get('Authorization'))
  })
})
