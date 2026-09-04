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

/**
 * Everything that is not a credential. Resolvable with no secrets present,
 * which is what lets the server start and answer `tools/list` unauthenticated.
 */
export interface ApiSettings {
  baseUrl: string
  acceptLanguage: AcceptLanguage
}

export interface ApiConfig extends ApiCredentials, ApiSettings {}

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
 * Market and language only — no credentials read, so this never throws over an
 * absent secret. Emits the unknown-host warning to stderr; stdout belongs to
 * the JSON-RPC transport and one stray write there kills the session.
 *
 * An *invalid* language still throws: an operator who set the variable to
 * something undocumented made a mistake worth failing on, unlike one who set
 * nothing at all.
 */
export function loadSettings(env: Env = process.env): ApiSettings {
  const { baseUrl, warning } = resolveBaseUrl(env.WEBSUPPORT_API_BASE_URL)
  if (warning) console.warn(`[websupport-mcp] ${warning}`)

  return {
    baseUrl,
    acceptLanguage: resolveAcceptLanguage(env.WEBSUPPORT_ACCEPT_LANGUAGE),
  }
}

/** Full runtime configuration, credentials included. */
export function loadApiConfig(env: Env = process.env): ApiConfig {
  return { ...loadCredentials(env), ...loadSettings(env) }
}

/**
 * Settings resolved now, credentials resolved on first use.
 *
 * The server must complete a handshake and answer `tools/list` with no
 * credentials present at all: registry build sandboxes, MCP Inspector and
 * client config probes all introspect before anyone holds a key. Validating
 * credentials during startup turned a missing variable into an exited process
 * and an opaque `Connection closed` on the client side. Deferring it means the
 * same missing variable surfaces as a typed error on the one call that
 * actually needs the secret.
 *
 * The credential read is memoised, so the message is identical on every call
 * and a rotated environment is not re-read mid-session.
 */
export interface ApiConfigSource {
  settings: ApiSettings
  resolve: () => ApiConfig
}

export function createApiConfigSource(env: Env = process.env): ApiConfigSource {
  const settings = loadSettings(env)
  let credentials: ApiCredentials | undefined

  return {
    settings,
    resolve: () => {
      credentials ??= loadCredentials(env)
      return { ...credentials, ...settings }
    },
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
