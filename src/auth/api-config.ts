import {
  ACCEPT_LANGUAGES,
  type AcceptLanguage,
  DEFAULT_ACCEPT_LANGUAGE,
  resolveBaseUrl,
} from './market-hosts.js'

export interface ApiCredentials {
  apiKey: string
  /**
   * HMAC-SHA1 signing key. Never logged, never serialised, never included in an
   * error message — `describeCredentials` exists so diagnostics have something
   * safe to print instead.
   */
  secret: string
}

export interface ApiConfig extends ApiCredentials {
  baseUrl: string
  acceptLanguage: AcceptLanguage
}

export type Env = Record<string, string | undefined>

function required(env: Env, name: string): string {
  const value = env[name]?.trim()
  if (value) return value
  throw new Error(
    `${name} is not set. Export it in the MCP client's server environment, or copy .env.example ` +
      'and fill in the API key and secret from https://admin.websupport.sk (Security -> API keys).',
  )
}

export function loadCredentials(env: Env = process.env): ApiCredentials {
  return {
    apiKey: required(env, 'WEBSUPPORT_API_KEY'),
    secret: required(env, 'WEBSUPPORT_API_SECRET'),
  }
}

function resolveAcceptLanguage(raw: string | undefined): AcceptLanguage {
  const value = raw?.trim()
  if (!value) return DEFAULT_ACCEPT_LANGUAGE
  if ((ACCEPT_LANGUAGES as readonly string[]).includes(value)) return value as AcceptLanguage
  throw new Error(
    `WEBSUPPORT_ACCEPT_LANGUAGE must be one of ${ACCEPT_LANGUAGES.join(', ')} — got ${JSON.stringify(value)}.`,
  )
}

/**
 * Full runtime configuration. Emits the unknown-host warning to stderr; stdout
 * belongs to the JSON-RPC transport and one stray write there kills the session.
 */
export function loadApiConfig(env: Env = process.env): ApiConfig {
  const { baseUrl, warning } = resolveBaseUrl(env.WEBSUPPORT_API_BASE_URL)
  if (warning) console.warn(`[websupport-mcp] ${warning}`)

  return {
    ...loadCredentials(env),
    baseUrl,
    acceptLanguage: resolveAcceptLanguage(env.WEBSUPPORT_ACCEPT_LANGUAGE),
  }
}

/**
 * A credential summary safe to print. Reports the secret's *length* only —
 * enough to tell "unset" from "pasted with a trailing newline", never enough to
 * reconstruct it.
 */
export function describeCredentials(credentials: ApiCredentials): string {
  return `apiKey=${credentials.apiKey} secretLength=${credentials.secret.length}`
}
