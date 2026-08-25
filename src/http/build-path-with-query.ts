/**
 * The single place a request-target is assembled.
 *
 * The signature covers the query string, so the string returned here is both
 * signed and sent — byte-identically. `URLSearchParams` is deliberately not
 * used: it percent-encodes `[` and `]` (breaking the v2 `deepObject` filter
 * encoding) and its `sort()` would reorder keys away from the declared order.
 */

export type QueryScalar = string | number | boolean
/** `filters` is the one nested parameter in the v2 surface; it is a deepObject. */
export type QueryDeepObject = Record<string, QueryScalar | QueryScalar[] | undefined | null>
export type QueryValue = QueryScalar | QueryScalar[] | QueryDeepObject
export type Query = Record<string, QueryValue | undefined | null>

function encodeScalar(value: QueryScalar): string {
  return encodeURIComponent(String(value))
}

/**
 * OpenAPI `style: deepObject, explode: true` — `filters[name]=x`,
 * `filters[type][]=A`. The brackets stay literal and unencoded; that is what
 * the spec declares and what the server parses.
 */
function deepObjectPairs(key: string, object: QueryDeepObject): string[] {
  const pairs: string[] = []
  for (const [innerKey, innerValue] of Object.entries(object)) {
    if (innerValue === undefined || innerValue === null) continue
    if (Array.isArray(innerValue)) {
      for (const item of innerValue) pairs.push(`${key}[${innerKey}][]=${encodeScalar(item)}`)
    } else {
      pairs.push(`${key}[${innerKey}]=${encodeScalar(innerValue)}`)
    }
  }
  return pairs
}

/**
 * Build `path` + `?query`. Keys are emitted in declared insertion order,
 * `undefined`/`null` entries are skipped, and an empty query yields the bare
 * path with no trailing `?`.
 */
export function buildPathWithQuery(path: string, query: Query = {}): string {
  const pairs: string[] = []

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue

    if (Array.isArray(value)) {
      for (const item of value) pairs.push(`${encodeURIComponent(key)}[]=${encodeScalar(item)}`)
      continue
    }

    if (typeof value === 'object') {
      pairs.push(...deepObjectPairs(key, value))
      continue
    }

    pairs.push(`${encodeURIComponent(key)}=${encodeScalar(value)}`)
  }

  return pairs.length === 0 ? path : `${path}?${pairs.join('&')}`
}
