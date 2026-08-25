/**
 * Websupport is a regional team.blue/Loopia brand, so the API host is a market
 * selector rather than a constant. The same Laravel application sits behind
 * every per-market nginx vhost — `GET /v2/docs/openapi.json` is byte-identical
 * across all of them (verified 2026-08-25) — so one set of tool schemas serves
 * every market and switching markets is configuration, not code.
 *
 * This module is the only place an API host literal may appear.
 */

export const DEFAULT_API_BASE_URL = 'https://rest.websupport.sk'

/** Hosts observed serving the API on 2026-08-25. */
export const KNOWN_API_HOSTS = [
  'rest.websupport.sk',
  'rest.websupport.cz',
  'rest.websupport.hu',
  'rest.websupport.se',
] as const

/**
 * The four documented `Accept-Language` values. There is no Swedish value even
 * though `rest.websupport.se` serves the API, so `en_us` stays the default for
 * that host too.
 */
export const ACCEPT_LANGUAGES = ['en_us', 'sk', 'cs_cz', 'hu'] as const
export type AcceptLanguage = (typeof ACCEPT_LANGUAGES)[number]
export const DEFAULT_ACCEPT_LANGUAGE: AcceptLanguage = 'en_us'

export interface ResolveBaseUrlResult {
  baseUrl: string
  /** Set when the host resolves but is outside the known live set. */
  warning?: string
}

/**
 * Validate and normalise an API base URL.
 *
 * Throws on a value that cannot work (unparseable, not `https:`, carries a
 * path). Only *warns* on an unrecognised host: Websupport may add markets, and
 * blocking a host we simply have not heard of would make a new market
 * unreachable without a code change — the exact coupling this module exists to
 * remove.
 */
export function resolveBaseUrl(raw: string | undefined): ResolveBaseUrlResult {
  const value = raw?.trim()
  if (!value) return { baseUrl: DEFAULT_API_BASE_URL }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(
      `WEBSUPPORT_API_BASE_URL is not a valid URL: ${JSON.stringify(value)}. ` +
        `Expected an absolute https: origin, e.g. ${DEFAULT_API_BASE_URL}`,
    )
  }

  if (url.protocol !== 'https:') {
    throw new Error(
      `WEBSUPPORT_API_BASE_URL must use https: — got ${url.protocol} in ${JSON.stringify(value)}. ` +
        'Request signatures cover the request-target and are sent over the wire; plaintext is not supported.',
    )
  }

  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(
      `WEBSUPPORT_API_BASE_URL must be an origin with no path, query or fragment — got ${JSON.stringify(value)}. ` +
        'Tool paths such as /v1/user/self are appended verbatim, so a base path would corrupt the signed request-target.',
    )
  }

  const baseUrl = url.origin
  const known = (KNOWN_API_HOSTS as readonly string[]).includes(url.host)
  if (known) return { baseUrl }

  return {
    baseUrl,
    warning:
      `WEBSUPPORT_API_BASE_URL host ${url.host} is not one of the known Websupport API hosts ` +
      `(${KNOWN_API_HOSTS.join(', ')}). Continuing anyway — a new market host is valid, a typo is not.`,
  }
}
