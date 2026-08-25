import { describe, expect, it } from 'vitest'
import { KNOWN_API_HOSTS } from '../auth/market-hosts.js'
import { mapError } from './map-error.js'

/**
 * Live, unauthenticated, credential-free.
 *
 * `GET /v2/check` with no headers answers `{"message":"Missing date header.","code":400}`
 * on every live market host. That single call earns its keep twice: it exercises
 * `mapError` against a real response body rather than a fixture, and it detects
 * a market host disappearing. Non-blocking by design — see vitest.network.config.ts.
 */
describe('live market hosts', () => {
  it.each(KNOWN_API_HOSTS)('%s still returns the documented error shape', async (host) => {
    const response = await fetch(`https://${host}/v2/check`)
    expect(response.status).toBe(400)

    const body = await response.json()
    expect(body).toEqual({ message: 'Missing date header.', code: 400 })

    const error = mapError(response.status, body, response.headers)
    expect(error.message).toBe('Websupport API 400: Missing date header.')
    expect(error.code).toBe(400)
    expect(error.serverDate).toBeTruthy()
  })
})
