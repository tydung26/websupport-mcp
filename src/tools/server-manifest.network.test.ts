import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'

/**
 * Validate `server.json` against the **live** MCP Registry schema.
 *
 * Deliberately not a vendored copy. The registry versions its schema by date,
 * and a manifest that validated against last quarter's copy can be rejected at
 * publish time — the point of failure this catches is precisely the one a local
 * copy would hide.
 *
 * Non-blocking, like the other network suites: a registry outage must not fail
 * the build.
 */

const server = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../server.json', import.meta.url)), 'utf8'),
) as { $schema: string }

describe('server.json validates against the live registry schema', () => {
  it('declares a schema URL that resolves', async () => {
    const response = await fetch(server.$schema)
    expect(response.status, `${server.$schema} did not resolve`).toBe(200)
  })

  it('validates', async () => {
    const schema = (await (await fetch(server.$schema)).json()) as object
    const ajv = new Ajv.default({ strict: false, allErrors: true })
    addFormats.default(ajv)

    const validate = ajv.compile(schema)
    const valid = validate(server)
    const errors = (validate.errors ?? []).map(
      (e) => `${e.instancePath || '(root)'} ${e.message} ${JSON.stringify(e.params)}`,
    )

    expect(errors).toEqual([])
    expect(valid).toBe(true)
  })

  it('uses the newest schema the registry is serving', async () => {
    // If live entries have moved to a later date-versioned schema, ours is
    // stale — publishing may still work, but the drift should be visible.
    const page = (await (
      await fetch('https://registry.modelcontextprotocol.io/v0/servers?limit=30')
    ).json()) as { servers: { server: { $schema?: string } }[] }

    const seen = new Set(
      page.servers.map((entry) => entry.server.$schema).filter((s): s is string => Boolean(s)),
    )
    const newest = [...seen].sort().pop()
    expect(newest, 'registry returned no schema URLs to compare against').toBeTruthy()
    expect(server.$schema).toBe(newest)
  })
})
