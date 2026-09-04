import type { z } from 'zod'
import type { Query } from '../http/build-path-with-query.js'

/**
 * Risk tier. Gates tool **registration**, not just execution: the server
 * filters the registry before `registerTool`, so an unauthorised tier never
 * appears in `tools/list` and never consumes client context.
 *
 * - `read`        — always registered.
 * - `write`       — requires `WEBSUPPORT_ALLOW_WRITE=1`.
 * - `destructive` — requires `WEBSUPPORT_ALLOW_DESTRUCTIVE=1` *and* a
 *                   `confirm: true` argument on every call.
 */
export type RiskTier = 'read' | 'write' | 'destructive'

export interface RequestSpec {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** Path only. The base URL is prepended by the transport from `Ctx`. */
  path: string
  query?: Query
  body?: unknown
  /**
   * `'bytes'` returns the raw response as a `Uint8Array` instead of parsing it.
   * Needed for binary payloads such as invoice PDFs, where running the bytes
   * through `response.text()` would silently corrupt them. The tool layer, not
   * the transport, decides what to do with the bytes.
   */
  responseType?: 'auto' | 'bytes'
}

export interface ApiResponse<T = unknown> {
  status: number
  /** `null` for 204 and empty bodies; a string for `text/*`; parsed JSON otherwise. */
  body: T
}

/**
 * Everything a handler needs, injected rather than imported, so a market switch
 * is configuration and tests need no module mocking.
 */
export interface Ctx {
  request: <T = unknown>(spec: RequestSpec) => Promise<ApiResponse<T>>
}

/**
 * SDK-agnostic on purpose. Only `src/server.ts` knows about the MCP SDK, so the
 * SDK line is swappable through that one adapter file.
 */
export interface ToolDef<I = unknown> {
  /** `ws_<group>_<action>` */
  name: string
  title?: string
  description: string
  tier: RiskTier
  inputSchema: z.ZodType<I>
  handler: (input: I, ctx: Ctx) => Promise<unknown>
}

/**
 * The registry is heterogeneous — every tool has its own input type — so the
 * array element type has to erase it. `defineTool` keeps the inference at the
 * definition site, where it is actually useful.
 */
// biome-ignore lint/suspicious/noExplicitAny: erasing per-tool input types is the point.
export type AnyToolDef = ToolDef<any>

/** Infers `I` from `inputSchema`, so handlers get typed arguments. */
export function defineTool<S extends z.ZodType>(def: {
  name: string
  title?: string
  description: string
  tier: RiskTier
  inputSchema: S
  handler: (input: z.output<S>, ctx: Ctx) => Promise<unknown>
}): ToolDef<z.output<S>> {
  return def as ToolDef<z.output<S>>
}
