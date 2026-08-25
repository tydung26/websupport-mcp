import { createHmac } from 'node:crypto'

/**
 * Which API generation a request targets. Decides the date header *name* only —
 * the canonical string and signature are identical for both.
 */
export type ApiVersion = 'v1' | 'v2'

export interface SignRequestInput {
  method: string
  /**
   * The path to sign — **without** any query string.
   *
   * Verified against the live API on 2026-08-25 with a real key: the server
   * signs the path alone. Every query-bearing request whose canonical string
   * included the query returned `401 Incorrect api key or signature.`, while
   * the identical request signed over the bare path succeeded (404/200 by
   * resource). Reproduced on v1 and v2, with and without a `filters`
   * deepObject.
   *
   * The v2 documentation's worked example prints
   * `GET /v2/some/url?attributes=123&some=aaa 1548240417`, which does *not*
   * match server behaviour. Do not "fix" this back to match the docs — it
   * breaks every paginated and filtered call.
   */
  pathForSignature: string
  unixSeconds: number
  apiKey: string
  secret: string
  version: ApiVersion
}

export interface SignedRequest {
  /** `Basic base64(apiKey:signature)` */
  authorization: string
  /** `Date` for v1, `X-Date` for v2 — see `dateHeaderName`. */
  dateHeaderName: 'Date' | 'X-Date'
  /** `YYYYMMDDTHHMMSSZ`, derived from the same `unixSeconds` as the signature. */
  dateHeaderValue: string
  /** The exact string that was signed. Safe to log — it contains no secret. */
  canonicalString: string
  /** Hex HMAC-SHA1 of the canonical string. */
  signature: string
}

const TWO = 2
const FOUR = 4

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

/**
 * `YYYYMMDDTHHMMSSZ` in UTC, built from explicit UTC components.
 *
 * Deliberately not `toISOString()` with characters stripped: that couples the
 * output format to a serialisation whose separators could change, and hides the
 * UTC requirement behind an implementation detail.
 */
export function formatDateHeader(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  const date = `${pad(d.getUTCFullYear(), FOUR)}${pad(d.getUTCMonth() + 1, TWO)}${pad(d.getUTCDate(), TWO)}`
  const time = `${pad(d.getUTCHours(), TWO)}${pad(d.getUTCMinutes(), TWO)}${pad(d.getUTCSeconds(), TWO)}`
  return `${date}T${time}Z`
}

/**
 * The date header *name* differs by API generation.
 *
 * Verified live 2026-08-25 (no credentials needed): v1 requires `Date` and
 * rejects `X-Date` with `400 Missing date header.`; v2 accepts **either**. The
 * split is therefore a v1 constraint, not a v2 one — do not "simplify" both
 * sides onto one header name, it breaks v1.
 */
export function dateHeaderNameFor(version: ApiVersion): 'Date' | 'X-Date' {
  return version === 'v1' ? 'Date' : 'X-Date'
}

/**
 * Sign one request. Pure and synchronous: the timestamp is an argument, so
 * tests need no clock mocking and the signature is reproducible from a vector.
 */
export function signRequest(input: SignRequestInput): SignedRequest {
  const { method, pathForSignature, unixSeconds, apiKey, secret, version } = input
  const canonicalString = `${method.toUpperCase()} ${pathForSignature} ${unixSeconds}`
  const signature = createHmac('sha1', secret).update(canonicalString).digest('hex')
  const authorization = `Basic ${Buffer.from(`${apiKey}:${signature}`).toString('base64')}`

  return {
    authorization,
    dateHeaderName: dateHeaderNameFor(version),
    dateHeaderValue: formatDateHeader(unixSeconds),
    canonicalString,
    signature,
  }
}
