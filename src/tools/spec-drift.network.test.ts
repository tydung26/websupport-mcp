import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { KNOWN_API_HOSTS } from '../auth/market-hosts.js'
import { spec } from './v2/openapi-spec.js'

/**
 * Drift watch on the vendored v2 spec.
 *
 * Network-dependent and deliberately non-blocking: a Websupport outage must not
 * red the build, but an upstream schema change must not go unnoticed either.
 *
 * Baseline 2026-08-25 — 8 paths, 15 schemas, md5
 * `72f9da3c894253e554a57252727f9afd`, byte-identical across all four hosts.
 */

const SPEC_URL = '/v2/docs/openapi.json'
/**
 * Read from the repository, not from the bundle: the md5 must be over the
 * vendored file's exact bytes, and this suite only ever runs from source.
 */
const SPEC_PATH = fileURLToPath(new URL('../../assets/websupport-v2-openapi.json', import.meta.url))
const VENDORED = readFileSync(SPEC_PATH)
const VENDORED_MD5 = createHash('md5').update(VENDORED).digest('hex')

function pathMethodSet(document: typeof spec): string[] {
  const out: string[] = []
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of Object.keys(item)) {
      if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
        out.push(`${method.toUpperCase()} ${path}`)
      }
    }
  }
  return out.sort()
}

async function fetchSpec(host: string) {
  const response = await fetch(`https://${host}${SPEC_URL}`)
  expect(response.status).toBe(200)
  return await response.text()
}

describe('vendored spec matches live', () => {
  it('is byte-identical on every market host', async () => {
    const bodies = await Promise.all(KNOWN_API_HOSTS.map(fetchSpec))
    const digests = bodies.map((body) => createHash('md5').update(body).digest('hex'))
    expect(new Set(digests).size).toBe(1)
    expect(digests[0]).toBe(VENDORED_MD5)
  })

  it('declares the same path+method set', async () => {
    const live = JSON.parse(await fetchSpec(KNOWN_API_HOSTS[0])) as typeof spec
    expect(pathMethodSet(live)).toEqual(pathMethodSet(spec))
  })

  it('declares the same schema set', async () => {
    const live = JSON.parse(await fetchSpec(KNOWN_API_HOSTS[0])) as typeof spec
    expect(Object.keys(live.components.schemas).sort()).toEqual(
      Object.keys(spec.components.schemas).sort(),
    )
  })
})
