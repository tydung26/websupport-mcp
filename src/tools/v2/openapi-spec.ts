import specJson from '../../../assets/websupport-v2-openapi.json' with { type: 'json' }

/**
 * The vendored v2 OpenAPI spec, and the enums derived from it.
 *
 * Eight paths does not justify codegen, but hand-retyping the enums does
 * guarantee drift. So the spec is imported as a module and the values are read
 * out of it: a Websupport change to the record-type list shows up as a schema
 * change here without anyone editing TypeScript.
 *
 * Imported rather than read from disk at runtime so the bundler inlines it.
 * A `readFileSync` relative to `import.meta.url` would resolve differently
 * before and after bundling, and would break the moment the output collapsed
 * to a single file.
 *
 * Baseline 2026-08-25: OpenAPI 3.0.0, 8 paths, 15 schemas, md5
 * `72f9da3c894253e554a57252727f9afd`, byte-identical across
 * `rest.websupport.{sk,cz,hu,se}`.
 */

export interface OpenApiSpec {
  openapi: string
  paths: Record<string, Record<string, unknown>>
  components: { schemas: Record<string, unknown> }
}

export const spec = specJson as unknown as OpenApiSpec

function enumAt(path: (string | number)[]): string[] {
  let node: unknown = spec
  for (const key of path) {
    if (typeof node !== 'object' || node === null) {
      throw new Error(`Vendored OpenAPI spec is missing ${path.join('.')}`)
    }
    node = (node as Record<string, unknown>)[key as string]
  }
  if (!Array.isArray(node) || node.some((v) => typeof v !== 'string')) {
    throw new Error(`Vendored OpenAPI spec has no string enum at ${path.join('.')}`)
  }
  return node as string[]
}

const DNS_RECORD_PATH = '/v2/service/{service}/dns/record'

/**
 * The 15 types a record may be *created* with.
 *
 * Deliberately different from `FILTER_RECORD_TYPES` below — the API really does
 * accept `DNSSEC` and `NS` on create while refusing to filter on them. Do not
 * unify the two lists.
 */
export const CREATE_RECORD_TYPES = enumAt([
  'components',
  'schemas',
  'CreateRecordRequest',
  'properties',
  'type',
  'enum',
]) as [string, ...string[]]

/** The `filters` deepObject parameter on `GET /v2/service/{service}/dns/record`. */
function filtersParameter(): { index: number; properties: Record<string, unknown> } {
  const operation = spec.paths[DNS_RECORD_PATH]?.get as { parameters?: unknown[] } | undefined
  const parameters = operation?.parameters ?? []
  const index = parameters.findIndex((p) => (p as { name?: string }).name === 'filters')
  const filters = parameters[index] as
    | { schema?: { properties?: Record<string, unknown> } }
    | undefined
  const properties = filters?.schema?.properties
  if (index < 0 || !properties) {
    throw new Error('Vendored OpenAPI spec has no `filters` parameter on GET dns/record')
  }
  return { index, properties }
}

const FILTERS = filtersParameter()

function filterEnum(property: string): [string, ...string[]] {
  return enumAt([
    'paths',
    DNS_RECORD_PATH,
    'get',
    'parameters',
    FILTERS.index,
    'schema',
    'properties',
    property,
    'items',
    'enum',
  ]) as [string, ...string[]]
}

/** The 13 types the DNS-list filter accepts — no `DNSSEC`, no `NS`. */
export const FILTER_RECORD_TYPES = filterEnum('type')

/** CAA tag values accepted by the list filter. */
export const FILTER_CAA_TAGS = filterEnum('tag')

/** The ten keys the DNS-list `filters` deepObject accepts. */
export const FILTER_KEYS = Object.keys(FILTERS.properties)
