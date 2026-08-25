import type { ApiConfig } from '../auth/api-config.js'
import { type ApiVersion, signRequest } from '../auth/signer.js'
import type { ApiResponse, RequestSpec } from '../tools/types.js'
import { buildPathWithQuery } from './build-path-with-query.js'
import { mapError } from './map-error.js'
import { decideRetry, sleep } from './retry.js'

/**
 * The DynDNS endpoint is a transport exception, not a v2 path.
 *
 * Probed 2026-08-25: with no headers at all it answers
 * `401 Incorrect api key or signature.` rather than `400 Missing date header.`,
 * so it takes no date header, and it responds `text/html`. Handled before the
 * version rule so it never inherits the v2 `X-Date` behaviour.
 */
const DYNDNS_PATH = '/nic/update'

/**
 * v1 vs v2 decides the date header *name* only. Path prefix is the whole rule:
 * `/v1` is v1, everything else is v2.
 */
export function versionForPath(path: string): ApiVersion {
  return path.startsWith('/v1') ? 'v1' : 'v2'
}

export interface RequestDeps {
  fetch?: typeof globalThis.fetch
  now?: () => number
  random?: () => number
  sleep?: (ms: number) => Promise<void>
}

async function parseBody(response: Response): Promise<unknown> {
  // Every v2 mutation (all six) answers 204 with no content, so an empty body
  // is the common path, not an edge case. JSON.parse must never see one.
  if (response.status === 204) return null

  const contentLength = response.headers.get('content-length')
  if (contentLength === '0') return null

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.startsWith('text/')) return await response.text()

  const raw = await response.text()
  if (raw.trim().length === 0) return null

  try {
    return JSON.parse(raw)
  } catch {
    // A JSON content-type carrying non-JSON: hand the caller the raw text
    // rather than throwing a parse error that hides the actual response.
    return raw
  }
}

/**
 * Build the request headers.
 *
 * `spec.path` — not the request-target — is what gets signed. The live API
 * signs the path alone; including the query produces a 401 on every paginated
 * or filtered call. See `SignRequestInput.pathForSignature` for the evidence.
 */
function buildHeaders(spec: RequestSpec, config: ApiConfig, unixSeconds: number): Headers {
  const headers = new Headers({ Accept: 'application/json' })

  if (spec.path === DYNDNS_PATH) {
    // Authorization only — no date header, and no Accept-Language: the endpoint
    // answers text/html and ignores both.
    const signed = signRequest({
      method: spec.method,
      pathForSignature: spec.path,
      unixSeconds,
      apiKey: config.apiKey,
      secret: config.secret,
      version: 'v2',
    })
    headers.set('Authorization', signed.authorization)
    return headers
  }

  const signed = signRequest({
    method: spec.method,
    pathForSignature: spec.path,
    unixSeconds,
    apiKey: config.apiKey,
    secret: config.secret,
    version: versionForPath(spec.path),
  })
  headers.set('Authorization', signed.authorization)
  headers.set(signed.dateHeaderName, signed.dateHeaderValue)
  headers.set('Accept-Language', config.acceptLanguage)
  if (spec.body !== undefined) headers.set('Content-Type', 'application/json')
  return headers
}

/**
 * Send one signed request.
 *
 * The request-target is built once and sent; the *path* alone is signed. The
 * query is deliberately excluded from the canonical string — verified live
 * 2026-08-25, and contrary to the vendor docs' worked example. Retries reuse
 * the same target but re-sign, because the timestamp is part of the canonical
 * string.
 */
export async function requestJson<T = unknown>(
  spec: RequestSpec,
  config: ApiConfig,
  deps: RequestDeps = {},
): Promise<ApiResponse<T>> {
  const doFetch = deps.fetch ?? globalThis.fetch
  const now = deps.now ?? Date.now
  const wait = deps.sleep ?? sleep

  const pathWithQuery = buildPathWithQuery(spec.path, spec.query)
  const url = `${config.baseUrl}${pathWithQuery}`

  let attempt = 0
  for (;;) {
    attempt += 1
    const unixSeconds = Math.floor(now() / 1000)
    const headers = buildHeaders(spec, config, unixSeconds)

    const response = await doFetch(url, {
      method: spec.method,
      headers,
      ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
    })

    if (response.ok) {
      return { status: response.status, body: (await parseBody(response)) as T }
    }

    const decision = decideRetry({
      method: spec.method,
      status: response.status,
      attempt,
      retryAfter: response.headers.get('retry-after'),
      nowMs: now(),
      ...(deps.random ? { random: deps.random } : {}),
    })

    if (!decision.retry) {
      throw mapError(response.status, await parseBody(response), response.headers)
    }

    await wait(decision.delayMs)
  }
}
