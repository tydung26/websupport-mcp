/**
 * Websupport error shapes, and the fact that neither can be assumed.
 *
 * - v1 and v2 both send `{code, message}` in practice.
 * - v2 validation failures send `InvalidData` — `{type, status, title}`.
 * - The OpenAPI spec declares **no body at all** for 401/403/422/500, while the
 *   live server does send JSON. Verified 2026-08-25. So an empty body must map
 *   to a usable message rather than throw.
 *
 * Nothing in here may carry the Authorization header or the API secret.
 */

export interface ApiErrorDetail {
  status: number
  /** The API's own wording, verbatim — v1 field names come from HTML docs and drift. */
  message: string
  /** Numeric `code` when the body carried one. */
  code?: number
  /** v2 `InvalidData.type`, a URI identifying the validation failure class. */
  type?: string
  /** The server's `Date` response header, so clock skew is diagnosable. */
  serverDate?: string
}

export class WebsupportApiError extends Error {
  readonly status: number
  readonly code: number | undefined
  readonly type: string | undefined
  readonly serverDate: string | undefined

  constructor(detail: ApiErrorDetail) {
    super(`Websupport API ${detail.status}: ${detail.message}`)
    this.name = 'WebsupportApiError'
    this.status = detail.status
    this.code = detail.code
    this.type = detail.type
    this.serverDate = detail.serverDate
  }

  toJSON(): ApiErrorDetail {
    return {
      status: this.status,
      message: this.message,
      ...(this.code === undefined ? {} : { code: this.code }),
      ...(this.type === undefined ? {} : { type: this.type }),
      ...(this.serverDate === undefined ? {} : { serverDate: this.serverDate }),
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' ? value : undefined
}

/**
 * Turn a non-2xx response into a typed error.
 *
 * `body` is whatever `requestJson` parsed — a JSON value, a string for
 * `text/*`, or `null` for an empty body. Every shape must land on a usable
 * message; falling back to the status alone is correct, throwing is not.
 */
export function mapError(
  status: number,
  body: unknown,
  headers?: Pick<Headers, 'get'>,
): WebsupportApiError {
  const serverDate = headers?.get('date') ?? undefined

  let message: string | undefined
  let code: number | undefined
  let type: string | undefined

  if (isRecord(body)) {
    // `{code, message}` (v1 + v2) and `InvalidData` `{type, status, title}`.
    message = readString(body, 'message') ?? readString(body, 'title')
    code = readNumber(body, 'code')
    type = readString(body, 'type')
  } else if (typeof body === 'string' && body.trim().length > 0) {
    // `text/*` responses, e.g. an HTML error page from /nic/update.
    message = body.trim().slice(0, 500)
  }

  return new WebsupportApiError({
    status,
    message: message ?? `request failed with status ${status} and no error body`,
    ...(code === undefined ? {} : { code }),
    ...(type === undefined ? {} : { type }),
    ...(serverDate === undefined ? {} : { serverDate }),
  })
}
