#!/usr/bin/env node
import { createApiConfigSource } from './auth/api-config.js'
import { resolveTierPolicy } from './policy/risk-tiers.js'
import { SERVER_NAME, startStdioServer } from './server.js'

async function main(): Promise<void> {
  const source = createApiConfigSource()
  const policy = resolveTierPolicy()
  await startStdioServer(source, policy)
}

main().catch((error: unknown) => {
  // stderr only — stdout is the JSON-RPC transport.
  console.error(`[${SERVER_NAME}] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
