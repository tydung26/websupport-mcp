import { describe, expect, it } from 'vitest'
import {
  BASE_DELAY_MS,
  backoffDelayMs,
  decideRetry,
  isRetryableMethod,
  isRetryableStatus,
  MAX_ATTEMPTS,
  parseRetryAfter,
} from './retry.js'

describe('retryable method', () => {
  it.each(['GET', 'PUT', 'DELETE', 'get', 'delete'])('retries %s', (method) => {
    expect(isRetryableMethod(method)).toBe(true)
  })

  it('never retries POST — a blind retry could double-create a record', () => {
    expect(isRetryableMethod('POST')).toBe(false)
    expect(isRetryableMethod('post')).toBe(false)
  })
})

describe('retryable status', () => {
  it.each([429, 500, 502, 503, 504])('retries %i', (status) => {
    expect(isRetryableStatus(status)).toBe(true)
  })

  it.each([200, 204, 400, 401, 403, 404, 422])('does not retry %i', (status) => {
    expect(isRetryableStatus(status)).toBe(false)
  })
})

describe('backoffDelayMs', () => {
  it('grows exponentially before jitter', () => {
    const full = () => 1
    expect(backoffDelayMs(1, full)).toBe(BASE_DELAY_MS)
    expect(backoffDelayMs(2, full)).toBe(BASE_DELAY_MS * 2)
    expect(backoffDelayMs(3, full)).toBe(BASE_DELAY_MS * 4)
  })

  it('applies full jitter — the floor is zero', () => {
    expect(backoffDelayMs(3, () => 0)).toBe(0)
  })

  it('caps the ceiling', () => {
    expect(backoffDelayMs(20, () => 1)).toBe(8000)
  })
})

describe('parseRetryAfter', () => {
  const now = Date.parse('2026-08-25T00:00:00Z')

  it('reads delta-seconds', () => {
    expect(parseRetryAfter('2', now)).toBe(2000)
  })

  it('reads an HTTP-date', () => {
    expect(parseRetryAfter('Tue, 25 Aug 2026 00:00:03 GMT', now)).toBe(3000)
  })

  it('clamps a past HTTP-date to zero', () => {
    expect(parseRetryAfter('Mon, 24 Aug 2026 00:00:00 GMT', now)).toBe(0)
  })

  it.each([null, '', 'soon'])('returns undefined for %p so backoff takes over', (value) => {
    expect(parseRetryAfter(value, now)).toBeUndefined()
  })
})

describe('decideRetry', () => {
  const base = { attempt: 1, retryAfter: null, nowMs: 0, random: () => 1 }

  it('retries a 503 GET', () => {
    expect(decideRetry({ ...base, method: 'GET', status: 503 })).toEqual({
      retry: true,
      delayMs: BASE_DELAY_MS,
    })
  })

  it('refuses to retry a 503 POST', () => {
    expect(decideRetry({ ...base, method: 'POST', status: 503 }).retry).toBe(false)
  })

  it('refuses to retry a 404 GET', () => {
    expect(decideRetry({ ...base, method: 'GET', status: 404 }).retry).toBe(false)
  })

  it(`stops at attempt ${MAX_ATTEMPTS}`, () => {
    expect(decideRetry({ ...base, method: 'GET', status: 500, attempt: MAX_ATTEMPTS }).retry).toBe(
      false,
    )
    expect(
      decideRetry({ ...base, method: 'GET', status: 500, attempt: MAX_ATTEMPTS - 1 }).retry,
    ).toBe(true)
  })

  it('honours Retry-After over computed backoff', () => {
    expect(decideRetry({ ...base, method: 'GET', status: 429, retryAfter: '2' })).toEqual({
      retry: true,
      delayMs: 2000,
    })
  })
})
