import { describe, expect, it } from 'vitest'
import { createRecordInput, recordFilters, updateRecordInput } from './dns-record-schema.js'

/**
 * Offline schema validation — every case here fails before any HTTP call.
 */

const base = { service: '12345', name: 'www' }

describe('createRecordInput', () => {
  it('accepts a plain A record', () => {
    const result = createRecordInput.safeParse({ ...base, type: 'A', content: '1.2.3.4', ttl: 600 })
    expect(result.success).toBe(true)
  })

  it('accepts DNSSEC and NS, which the list filter refuses', () => {
    for (const type of ['DNSSEC', 'NS']) {
      expect(createRecordInput.safeParse({ ...base, type, content: 'x' }).success).toBe(true)
    }
  })

  it('rejects an unknown record type', () => {
    expect(createRecordInput.safeParse({ ...base, type: 'BOGUS' }).success).toBe(false)
  })

  it('rejects unknown keys rather than forwarding them to the API', () => {
    const result = createRecordInput.safeParse({ ...base, type: 'A', prio: 10 })
    expect(result.success).toBe(false)
  })

  describe("conditional rules (ours, not the spec's — relax if the live SRV probe says so)", () => {
    it('requires priority for MX', () => {
      const result = createRecordInput.safeParse({
        ...base,
        type: 'MX',
        content: 'mail.example.com',
      })
      expect(result.success).toBe(false)
      expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('priority')
    })

    it('accepts MX with priority', () => {
      expect(
        createRecordInput.safeParse({
          ...base,
          type: 'MX',
          content: 'mail.example.com',
          priority: 10,
        }).success,
      ).toBe(true)
    })

    it('requires priority, port and weight for SRV', () => {
      const result = createRecordInput.safeParse({
        ...base,
        type: 'SRV',
        content: 'sip.example.com',
      })
      expect(result.success).toBe(false)
      const paths = result.error?.issues.map((i) => i.path.join('.')) ?? []
      expect(paths).toEqual(expect.arrayContaining(['priority', 'port', 'weight']))
    })

    it('accepts a complete SRV', () => {
      expect(
        createRecordInput.safeParse({
          ...base,
          type: 'SRV',
          content: 'sip.example.com',
          priority: 10,
          port: 5060,
          weight: 5,
        }).success,
      ).toBe(true)
    })

    it('imposes nothing on an A record', () => {
      expect(createRecordInput.safeParse({ ...base, type: 'A', content: '1.2.3.4' }).success).toBe(
        true,
      )
    })
  })
})

describe('updateRecordInput', () => {
  it('requires the record id', () => {
    expect(updateRecordInput.safeParse({ service: '1', name: 'www' }).success).toBe(false)
  })

  it('accepts a partial update', () => {
    expect(updateRecordInput.safeParse({ service: '1', record: '9', ttl: 300 }).success).toBe(true)
  })

  it('has no `type` field — v2 update cannot change a record type', () => {
    expect(updateRecordInput.safeParse({ service: '1', record: '9', type: 'A' }).success).toBe(
      false,
    )
  })
})

describe('recordFilters', () => {
  it('accepts all ten keys at once', () => {
    const result = recordFilters.safeParse({
      name: 'www',
      type: ['A'],
      content: '1.2.3.4',
      ttl: 600,
      note: 'x',
      priority: 1,
      port: 1,
      weight: 1,
      flags: 0,
      tag: ['issue'],
    })
    expect(result.success).toBe(true)
  })

  it('refuses DNSSEC and NS in the type filter, matching the API', () => {
    expect(recordFilters.safeParse({ type: ['DNSSEC'] }).success).toBe(false)
    expect(recordFilters.safeParse({ type: ['NS'] }).success).toBe(false)
    expect(recordFilters.safeParse({ type: ['A'] }).success).toBe(true)
  })

  it('constrains CAA tags', () => {
    expect(recordFilters.safeParse({ tag: ['issue'] }).success).toBe(true)
    expect(recordFilters.safeParse({ tag: ['bogus'] }).success).toBe(false)
  })

  it('rejects an unknown filter key', () => {
    expect(recordFilters.safeParse({ nope: 1 }).success).toBe(false)
  })
})
