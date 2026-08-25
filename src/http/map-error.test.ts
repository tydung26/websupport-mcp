import { describe, expect, it } from 'vitest'
import { mapError, WebsupportApiError } from './map-error.js'

const headers = (init: Record<string, string> = {}) => new Headers(init)

describe('mapError', () => {
  it('reads the {code, message} shape both v1 and v2 actually send', () => {
    const error = mapError(400, { message: 'Missing date header.', code: 400 }, headers())
    expect(error).toBeInstanceOf(WebsupportApiError)
    expect(error.status).toBe(400)
    expect(error.code).toBe(400)
    expect(error.message).toBe('Websupport API 400: Missing date header.')
  })

  it('reads the v2 InvalidData shape {type, status, title}', () => {
    const error = mapError(
      422,
      { type: 'https://websupport.sk/errors/invalid', status: 422, title: 'Invalid record type' },
      headers(),
    )
    expect(error.message).toBe('Websupport API 422: Invalid record type')
    expect(error.type).toBe('https://websupport.sk/errors/invalid')
  })

  it.each([null, undefined, '', '   '])(
    'maps an empty body (%p) to a usable message rather than throwing',
    (body) => {
      // The spec declares no body for 401/403/422/500 while the live server
      // sends JSON. Neither can be assumed, so both must land somewhere useful.
      const error = mapError(500, body, headers())
      expect(error.status).toBe(500)
      expect(error.message).toBe(
        'Websupport API 500: request failed with status 500 and no error body',
      )
      expect(error.code).toBeUndefined()
    },
  )

  it('uses a text/* body as the message, truncated', () => {
    const error = mapError(401, `<html>badauth</html>`, headers())
    expect(error.message).toContain('badauth')
  })

  it('caps a runaway text body', () => {
    const error = mapError(500, 'x'.repeat(5000), headers())
    expect(error.message.length).toBeLessThan(600)
  })

  it('surfaces the server Date header so clock skew is diagnosable', () => {
    const error = mapError(
      401,
      { message: 'Incorrect api key or signature.', code: 401 },
      headers({
        date: 'Mon, 25 Aug 2026 07:48:08 GMT',
      }),
    )
    expect(error.serverDate).toBe('Mon, 25 Aug 2026 07:48:08 GMT')
  })

  it.each([400, 401, 403, 404, 422, 500])('carries status %i through', (status) => {
    expect(mapError(status, { message: 'nope', code: status }).status).toBe(status)
  })

  it('never emits the secret or the Authorization header', () => {
    const secret = 's3cr3t'
    const error = mapError(
      401,
      { message: 'Incorrect api key or signature.', code: 401 },
      headers({
        date: 'Mon, 25 Aug 2026 07:48:08 GMT',
        // A header map that wrongly contained credentials must still not leak:
        // mapError reads only `date`.
        authorization: `Basic ${Buffer.from(`ak:${secret}`).toString('base64')}`,
      }),
    )
    const serialised = JSON.stringify(error.toJSON())
    expect(serialised).not.toContain(secret)
    expect(serialised.toLowerCase()).not.toContain('authorization')
    expect(serialised).not.toContain('Basic ')
  })

  it('ignores a non-string message field rather than stringifying junk', () => {
    const error = mapError(500, { message: 42 })
    expect(error.message).toBe(
      'Websupport API 500: request failed with status 500 and no error body',
    )
  })

  it('ignores an array body', () => {
    expect(mapError(500, [{ message: 'x' }]).message).toContain('no error body')
  })
})
