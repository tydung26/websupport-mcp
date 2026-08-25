import { describe, expect, it } from 'vitest'
import {
  CREATE_RECORD_TYPES,
  FILTER_CAA_TAGS,
  FILTER_KEYS,
  FILTER_RECORD_TYPES,
  spec,
} from './openapi-spec.js'

/**
 * Offline assertions against the vendored spec. The network drift test proves
 * the vendored copy still matches upstream; these prove the derivations read
 * out of it are the ones the tool schemas rely on.
 */

describe('vendored spec shape', () => {
  it('is the 2026-08-25 baseline: OpenAPI 3.0.0, 8 paths, 15 schemas', () => {
    expect(spec.openapi).toBe('3.0.0')
    expect(Object.keys(spec.paths)).toHaveLength(8)
    expect(Object.keys(spec.components.schemas)).toHaveLength(15)
  })

  it('leaves the /nic/update `parameters` key absent, not null', () => {
    // Asserting `=== null` here would fail against the real spec. The key is
    // simply missing, which is why the DynDNS tool passes its query through
    // permissively rather than validating against declared parameters.
    const dyndns = spec.paths['/nic/update']?.get as Record<string, unknown>
    expect(Object.hasOwn(dyndns, 'parameters')).toBe(false)
    expect(dyndns.parameters).toBeUndefined()
  })
})

describe('record type enums', () => {
  it('create accepts 15 types including DNSSEC and NS', () => {
    expect(CREATE_RECORD_TYPES).toHaveLength(15)
    expect(CREATE_RECORD_TYPES).toContain('DNSSEC')
    expect(CREATE_RECORD_TYPES).toContain('NS')
  })

  it('the list filter accepts 13 — no DNSSEC, no NS', () => {
    expect(FILTER_RECORD_TYPES).toHaveLength(13)
    expect(FILTER_RECORD_TYPES).not.toContain('DNSSEC')
    expect(FILTER_RECORD_TYPES).not.toContain('NS')
  })

  it('the two lists differ by exactly those two values', () => {
    const missing = CREATE_RECORD_TYPES.filter((t) => !FILTER_RECORD_TYPES.includes(t))
    expect(missing.sort()).toEqual(['DNSSEC', 'NS'])
  })
})

describe('filters deepObject', () => {
  it('declares all ten keys', () => {
    expect(FILTER_KEYS).toEqual([
      'name',
      'type',
      'content',
      'ttl',
      'note',
      'priority',
      'port',
      'weight',
      'flags',
      'tag',
    ])
  })

  it('constrains CAA tags to the three documented values', () => {
    expect(FILTER_CAA_TAGS).toEqual(['issue', 'issuewild', 'iodef'])
  })
})

describe('write-only FTP password', () => {
  it('is absent from the FtpAccount response schema', () => {
    const account = spec.components.schemas.FtpAccount as {
      properties: Record<string, unknown>
    }
    expect(Object.keys(account.properties)).not.toContain('password')
  })

  it('is present in both request bodies, so it can be set but never read', () => {
    for (const name of ['CreateFtpAccountRequest', 'UpdateFtpAccountRequest']) {
      const schema = spec.components.schemas[name] as { properties: Record<string, unknown> }
      expect(Object.keys(schema.properties)).toContain('password')
    }
  })
})

describe('CreateRecordRequest', () => {
  it("declares no required fields at all — the conditional rules are ours, not the spec's", () => {
    const schema = spec.components.schemas.CreateRecordRequest as { required?: unknown }
    expect(schema.required).toBeUndefined()
  })
})
