/**
 * Retry policy for the shared request path.
 *
 * Websupport's rate limits are undocumented, so backoff is defensive rather
 * than tuned. POST is never retried: a blind retry of a create could produce a
 * duplicate DNS record, and none of the v2 mutations return an id we could use
 * to detect one.
 */

export const MAX_ATTEMPTS = 3
export const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 8000

/** GET/PUT/DELETE are idempotent by contract in this surface; POST is not. */
const RETRYABLE_METHODS = new Set(['GET', 'PUT', 'DELETE'])

export function isRetryableMethod(method: string): boolean {
  return RETRYABLE_METHODS.has(method.toUpperCase())
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * Exponential backoff with full jitter. `random` is injectable so tests get a
 * deterministic delay without stubbing globals.
 */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const exponential = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS)
  return Math.floor(random() * exponential)
}

/**
 * `Retry-After` in either documented form: delta-seconds, or an HTTP-date.
 * Returns undefined when absent or unparseable — the caller then falls back to
 * computed backoff rather than failing.
 */
export function parseRetryAfter(value: string | null, nowMs: number): number | undefined {
  if (!value) return undefined

  const seconds = Number(value.trim())
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_DELAY_MS)

  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined
  return Math.min(Math.max(date - nowMs, 0), MAX_DELAY_MS)
}

export interface RetryDecision {
  retry: boolean
  delayMs: number
}

/**
 * Decide whether to make another attempt, and how long to wait first.
 * `Retry-After` wins over computed backoff when the server sent one.
 */
export function decideRetry(input: {
  method: string
  status: number
  attempt: number
  retryAfter: string | null
  nowMs: number
  random?: () => number
}): RetryDecision {
  const { method, status, attempt, retryAfter, nowMs, random } = input

  if (attempt >= MAX_ATTEMPTS) return { retry: false, delayMs: 0 }
  if (!isRetryableMethod(method)) return { retry: false, delayMs: 0 }
  if (!isRetryableStatus(status)) return { retry: false, delayMs: 0 }

  const honoured = parseRetryAfter(retryAfter, nowMs)
  return { retry: true, delayMs: honoured ?? backoffDelayMs(attempt, random) }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
