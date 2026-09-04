#!/usr/bin/env node
import { spawn } from 'node:child_process'

/**
 * Drive an MCP handshake over stdio against an arbitrary command, with no
 * credentials in the environment.
 *
 * Three things are proved at once, and the middle one was once broken:
 *   * the artifact starts and answers `initialize` + `tools/list` rather than
 *     merely compiling;
 *   * it does so *unauthenticated*. 0.1.1 read the credentials before opening
 *     the transport, so every registry build sandbox and inspector saw only
 *     `Connection closed`. Passing no key here is the regression test;
 *   * calling a tool without credentials returns a typed error naming the
 *     missing variable, and leaves the session alive.
 *
 * Usage:
 *   vite-node scripts/smoke-stdio-handshake.ts -- node dist/index.js
 *   vite-node scripts/smoke-stdio-handshake.ts -- docker run -i --rm image
 *
 * `EXPECT_TOOLS` (default 30) asserts the read tier is registered with no
 * opt-ins. `WEBSUPPORT_*` variables are stripped from the child environment so
 * a developer's local shell cannot make this pass for the wrong reason.
 */

const EXPECT_TOOLS = Number(process.env.EXPECT_TOOLS ?? '30')
const TIMEOUT_MS = 30_000
const PROTOCOL_VERSION = '2025-11-25'
/** A read tool taking no arguments, so the call reaches the signing step. */
const PROBE_TOOL = 'ws_auth_check'

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error('usage: smoke-stdio-handshake.ts -- <command> [args...]')
  process.exit(2)
}

/** The child must see no Websupport configuration at all. */
function credentialFreeEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('WEBSUPPORT_')),
  )
}

function fail(message: string): never {
  console.error(`smoke: ${message}`)
  process.exit(1)
}

const child = spawn(command, args, {
  env: credentialFreeEnv(),
  stdio: ['pipe', 'pipe', 'inherit'],
})

const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`)
const timer = setTimeout(() => fail(`handshake timed out after ${TIMEOUT_MS}ms`), TIMEOUT_MS)

child.on('exit', (code) => {
  // Reached only if the child dies before answering, which is exactly the
  // failure this script exists to catch.
  clearTimeout(timer)
  fail(`the server exited with code ${code} before completing the handshake`)
})

let buffer = ''
child.stdout.on('data', (chunk: Buffer) => {
  buffer += chunk.toString()
  let newline = buffer.indexOf('\n')
  while (newline >= 0) {
    const line = buffer.slice(0, newline).trim()
    buffer = buffer.slice(newline + 1)
    newline = buffer.indexOf('\n')
    if (!line) continue

    const message = JSON.parse(line) as {
      id?: number
      result?: { tools?: { name: string }[]; isError?: boolean; content?: { text?: string }[] }
    }

    if (message.id === 1) {
      send({ jsonrpc: '2.0', method: 'notifications/initialized' })
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
      continue
    }

    if (message.id === 2) {
      const tools = message.result?.tools ?? []
      if (tools.length !== EXPECT_TOOLS) {
        clearTimeout(timer)
        fail(`expected ${EXPECT_TOOLS} tools with no opt-ins, got ${tools.length}`)
      }
      console.error(`smoke: handshake ok unauthenticated, ${tools.length} tools listed`)
      send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: PROBE_TOOL, arguments: {} },
      })
      continue
    }

    if (message.id === 3) {
      clearTimeout(timer)
      const result = message.result ?? {}
      const text = result.content?.[0]?.text ?? ''
      child.removeAllListeners('exit')
      child.kill()
      if (result.isError !== true) {
        fail(`${PROBE_TOOL} answered without an error despite having no credential`)
      }
      if (!text.includes('WEBSUPPORT_API_KEY')) {
        fail(`the error did not name the missing variable: ${text}`)
      }
      console.error(`smoke: ${PROBE_TOOL} failed with the actionable message, session survived`)
      process.exit(0)
    }
  }
})

send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'smoke', version: '0' },
  },
})
