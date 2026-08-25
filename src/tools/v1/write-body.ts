import { z } from 'zod'

/**
 * Request bodies for the v1 mutating tools.
 *
 * **Deliberate deviation from the `z.strictObject` house rule**, confined to
 * this file and justified per schema below.
 *
 * v1 publishes no machine-readable spec — `/v1/docs/openapi.json` and its
 * neighbours all 404, checked 2026-08-25 — and the field sets for database and
 * mailbox creation could not be observed live, because a POST to a hosting id
 * that does not exist is rejected at the resource layer before any body
 * validation runs. So the accepted fields are genuinely unknown here.
 *
 * Rejecting unknown keys under those conditions would make the tools unusable:
 * a caller holding the real field names could not pass them. Silently dropping
 * them would be worse. The schemas therefore require what a record cannot exist
 * without, and pass anything else through to the API, whose own validation
 * error is surfaced verbatim by `mapError`.
 *
 * Tighten these to `z.strictObject` as soon as the field sets are confirmed
 * against a populated account.
 */

/** Scalars and simple arrays — enough for any documented v1 body field. */
const passthroughValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
])

export const PASSTHROUGH_NOTE =
  'Additional fields are passed through to the API unchanged, because the v1 field set is not published as a machine-readable spec. If the API rejects a field it will say so verbatim in the error.'

/**
 * An object that requires its declared keys and forwards any others.
 * Use only where the upstream field set is genuinely unverified.
 */
export function passthroughObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).catchall(passthroughValue)
}

/** Strip keys the tool owns (path parameters) before sending the rest as a body. */
export function bodyWithout(
  input: Record<string, unknown>,
  omit: readonly string[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!omit.includes(key) && value !== undefined) body[key] = value
  }
  return body
}
