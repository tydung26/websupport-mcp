import { McpServer } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import type { ApiConfig } from './auth/api-config.js'
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
export const SERVER_VERSION = '0.0.0'

export function createCtx(config: ApiConfig): Ctx {
  return {
    config,
    request: (spec) => requestJson(spec, config),
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
export function createServer(config: ApiConfig, policy: TierPolicy): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })
  const ctx = createCtx(config)

  for (const tool of allowedTools(registry, policy)) {
    registerTool(server, tool, ctx)
  }

  return server
}

export async function startStdioServer(config: ApiConfig, policy: TierPolicy): Promise<McpServer> {
  const server = createServer(config, policy)
  const registered = allowedTools(registry, policy).length

  // stdout belongs to the JSON-RPC transport — one stray write there corrupts
  // the stream and kills the session. Every diagnostic goes to stderr.
  console.error(
    `[${SERVER_NAME}] ${registered} tools registered (tiers: ${describeTierPolicy(policy)}) against ${config.baseUrl}`,
  )

  await server.connect(new StdioServerTransport())
  return server
}
