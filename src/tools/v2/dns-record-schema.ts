import { z } from 'zod'
import { CREATE_RECORD_TYPES, FILTER_CAA_TAGS, FILTER_RECORD_TYPES } from './openapi-spec.js'

/**
 * DNS record schemas for the v2 surface.
 *
 * The type enums come from the vendored spec rather than being retyped, and the
 * create/filter lists stay separate because the API genuinely differs: create
 * accepts 15 types, the list filter accepts 13 (no `DNSSEC`, no `NS`).
 */

export const serviceArg = z
  .string()
  .min(1)
  .describe(
    "Service identifier the zone belongs to. See ws_service_list for the account's services.",
  )

export const createRecordType = z.enum(CREATE_RECORD_TYPES)
export const filterRecordType = z.enum(FILTER_RECORD_TYPES)

/**
 * `filters` — all ten keys the spec declares, serialised as a `deepObject`.
 *
 * Widening this beyond `name`/`type` is deliberate: the keys are derived from
 * the same spec the drift test watches, so an upstream filter change is caught
 * for free rather than quietly unsupported.
 */
export const recordFilters = z
  .strictObject({
    name: z.string().optional(),
    type: z.array(filterRecordType).optional(),
    content: z.string().optional(),
    ttl: z.number().int().optional(),
    note: z.string().optional(),
    priority: z.number().int().optional(),
    port: z.number().int().optional(),
    weight: z.number().int().optional(),
    flags: z.number().int().optional(),
    tag: z.array(z.enum(FILTER_CAA_TAGS)).optional(),
  })
  .describe(
    'Server-side filters. Note the type list here excludes DNSSEC and NS, which are creatable but not filterable.',
  )

const recordFieldDescriptions = {
  name: 'Record name relative to the zone, e.g. "www". Use "@" for the zone apex.',
  content: 'Record value — an IP for A/AAAA, a hostname for CNAME/MX, arbitrary text for TXT.',
  ttl: 'Time to live in seconds.',
  priority: 'Priority. Required for MX and SRV. Note v2 calls this `priority`; v1 calls it `prio`.',
  port: 'Port. Required for SRV.',
  weight: 'Weight. Required for SRV.',
}

/**
 * Conditional rules taken from the v1 HTML docs, applied offline so a malformed
 * record fails before any HTTP call.
 *
 * **Not spec-backed** — `CreateRecordRequest` declares no `required` fields at
 * all. The rules are a fast-failure convenience, not a discovered constraint,
 * so Phase 3 probes an `SRV` without `port`/`weight` against a real zone; if
 * the API accepts it, relax the rule here and record the finding. An
 * unverified client-side rule is otherwise unbypassable by any caller.
 */
export function applyConditionalRecordRules(
  value: {
    type?: string | undefined
    priority?: number | undefined
    port?: number | undefined
    weight?: number | undefined
  },
  ctx: z.RefinementCtx,
): void {
  const { type } = value
  if (type === 'MX' || type === 'SRV') {
    if (value.priority === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['priority'],
        message: `priority is required for ${type} records`,
      })
    }
  }
  if (type === 'SRV') {
    if (value.port === undefined) {
      ctx.addIssue({ code: 'custom', path: ['port'], message: 'port is required for SRV records' })
    }
    if (value.weight === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['weight'],
        message: 'weight is required for SRV records',
      })
    }
  }
}

export const createRecordInput = z
  .strictObject({
    service: serviceArg,
    type: createRecordType.describe('Record type. DNSSEC and NS are creatable but not filterable.'),
    name: z.string().describe(recordFieldDescriptions.name),
    content: z.string().nullable().optional().describe(recordFieldDescriptions.content),
    ttl: z.number().int().min(1).optional().describe(recordFieldDescriptions.ttl),
    priority: z.number().int().optional().describe(recordFieldDescriptions.priority),
    port: z.number().int().optional().describe(recordFieldDescriptions.port),
    weight: z.number().int().optional().describe(recordFieldDescriptions.weight),
  })
  .superRefine(applyConditionalRecordRules)

export const updateRecordInput = z.strictObject({
  service: serviceArg,
  record: z.string().min(1).describe('Record id to update.'),
  name: z.string().optional().describe(recordFieldDescriptions.name),
  content: z.string().nullable().optional().describe(recordFieldDescriptions.content),
  ttl: z.number().int().min(1).optional().describe(recordFieldDescriptions.ttl),
  priority: z.number().int().optional().describe(recordFieldDescriptions.priority),
  port: z.number().int().optional().describe(recordFieldDescriptions.port),
  weight: z.number().int().optional().describe(recordFieldDescriptions.weight),
})

/** The record fields the API accepts in a create/update body. */
export function recordBody(
  input: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const key of keys) {
    if (input[key] !== undefined) body[key] = input[key]
  }
  return body
}

export const CREATE_BODY_KEYS = [
  'type',
  'name',
  'content',
  'ttl',
  'priority',
  'port',
  'weight',
] as const
export const UPDATE_BODY_KEYS = ['name', 'content', 'ttl', 'priority', 'port', 'weight'] as const
