import { readFileSync } from 'node:fs'
import { McpServer } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import type { ApiConfig, ApiConfigSource } from './auth/api-config.js'
import { WebsupportApiError } from './http/map-error.js'
import { requestJson } from './http/request-json.js'
import { allowedTools, describeTierPolicy, type TierPolicy } from './policy/risk-tiers.js'
import { registry } from './tools/registry.js'
import type { AnyToolDef, Ctx } from './tools/types.js'

/**
 * The only file that knows about the MCP SDK.
 *
 * Everything else speaks `ToolDef` and `Ctx`, so swapping the SDK line means
 * rewriting this adapter and nothing else.
 */

export const SERVER_NAME = 'websupport-mcp'

/**
 * The version reported to clients in `serverInfo`.
 *
 * Read from `package.json` rather than hardcoded, because a hardcoded constant
 * silently drifts from the published version — 0.1.0 shipped announcing itself
 * as 0.0.0, which is how this was found.
 *
 * The relative path resolves from both `src/server.ts` and the bundled
 * `dist/index.js`, since each sits exactly one level below the package root,
 * and `package.json` is always present in a published tarball. Falling back to
 * `0.0.0` keeps a missing or unreadable manifest from taking the server down
 * over a cosmetic field.
 */
function readPackageVersion(): string {
  try {
    const manifest = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    return (JSON.parse(manifest) as { version?: string }).version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export const SERVER_VERSION = readPackageVersion()

/**
 * `resolve` is called per request rather than once, so a deployment that never
 * sets credentials still starts, registers its tools and answers `tools/list`;
 * the missing variable surfaces as a typed tool error on the first call that
 * needs to sign something.
 */
export function createCtx(resolve: () => ApiConfig): Ctx {
  return {
    // `async` matters: `resolve` throws when a credential is missing, and
    // `Ctx.request` promises a rejected promise, not a synchronous throw.
    request: async (spec) => requestJson(spec, resolve()),
  }
}

/**
 * Render a handler result as an MCP tool result.
 *
 * Structured data goes in both `structuredContent` and a JSON text block: older
 * negotiated protocol revisions ignore the former, and a client that only reads
 * `content` must still see the data.
 */
function toolResult(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  const base = { content: [{ type: 'text' as const, text }] }
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? { ...base, structuredContent: value as Record<string, unknown> }
    : base
}

/**
 * Errors cross the tool boundary as typed results, never as thrown strings.
 * `WebsupportApiError.toJSON()` is already scrubbed of the secret and the
 * Authorization header.
 */
function errorResult(error: unknown) {
  const detail =
    error instanceof WebsupportApiError
      ? error.toJSON()
      : { message: error instanceof Error ? error.message : String(error) }

  return {
    isError: true,
    content: [{ type: 'text' as const, text: JSON.stringify(detail, null, 2) }],
  }
}

function registerTool(server: McpServer, tool: AnyToolDef, ctx: Ctx): void {
  server.registerTool(
    tool.name,
    {
      ...(tool.title ? { title: tool.title } : {}),
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: {
        readOnlyHint: tool.tier === 'read',
        destructiveHint: tool.tier === 'destructive',
        idempotentHint: tool.tier !== 'write',
      },
    },
    async (input: unknown) => {
      try {
        return toolResult(await tool.handler(input, ctx))
      } catch (error) {
        return errorResult(error)
      }
    },
  )
}

/**
 * Build the server with only the tools the tier policy allows.
 *
 * Filtering happens before registration, so a disallowed tool never reaches
 * `tools/list` — it costs the client no context and offers no affordance.
 */
export function createServer(source: ApiConfigSource, policy: TierPolicy): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })
  const ctx = createCtx(source.resolve)

  for (const tool of allowedTools(registry, policy)) {
    registerTool(server, tool, ctx)
  }

  return server
}

export async function startStdioServer(
  source: ApiConfigSource,
  policy: TierPolicy,
): Promise<McpServer> {
  const server = createServer(source, policy)
  const registered = allowedTools(registry, policy).length

  // stdout belongs to the JSON-RPC transport — one stray write there corrupts
  // the stream and kills the session. Every diagnostic goes to stderr.
  console.error(
    `[${SERVER_NAME}] ${registered} tools registered (tiers: ${describeTierPolicy(policy)}) against ${source.settings.baseUrl}`,
  )

  await server.connect(new StdioServerTransport())
  return server
}
