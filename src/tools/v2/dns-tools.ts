import { z } from 'zod'
import { paginationArgs, paginationQuery } from '../../http/pagination.js'
import { confirmArg } from '../confirm.js'
import { type AnyToolDef, type Ctx, defineTool } from '../types.js'
import {
  CREATE_BODY_KEYS,
  createRecordInput,
  recordBody,
  recordFilters,
  serviceArg,
  UPDATE_BODY_KEYS,
  updateRecordInput,
} from './dns-record-schema.js'

interface DnsRecord {
  id: number | null
  name: string
  content: string
  ttl: number
  priority: number | null
  port: number | null
  weight: number | null
  type: string
}

interface RecordPage {
  currentPage: number
  rowsPerPage: number
  totalPages: number
  totalRecords: number
  data: DnsRecord[]
}

const recordPath = (service: string) => `/v2/service/${encodeURIComponent(service)}/dns/record`

/**
 * Recover the record a create just wrote.
 *
 * `POST /v2/service/{service}/dns/record` answers `204` with no body, so the
 * new record's id never reaches the caller. Re-listing filtered on what we just
 * sent is the only way to hand back a real object — one extra GET per create,
 * and the alternative is returning nothing usable.
 */
async function relistCreatedRecord(
  ctx: Ctx,
  service: string,
  wrote: { type: string; name: string; content?: string | null | undefined },
): Promise<DnsRecord | null> {
  const filters: Record<string, string | string[]> = { name: wrote.name, type: [wrote.type] }
  if (wrote.content != null) filters.content = wrote.content

  const { body } = await ctx.request<RecordPage>({
    method: 'GET',
    path: recordPath(service),
    query: { filters },
  })

  const matches = body?.data ?? []
  // Newest last is not guaranteed, so prefer the highest id when the filter
  // still matches more than one record.
  return matches.reduce<DnsRecord | null>(
    (best, current) => (best === null || (current.id ?? 0) > (best.id ?? 0) ? current : best),
    null,
  )
}

export const dnsTools: AnyToolDef[] = [
  defineTool({
    name: 'ws_auth_check',
    title: 'Verify API credentials',
    description:
      'Verify that the configured Websupport API key and secret authenticate successfully. Returns {verified: true} on success. Use this first when diagnosing 401 errors.',
    tier: 'read',
    inputSchema: z.strictObject({}),
    handler: async (_input, ctx) => (await ctx.request({ method: 'GET', path: '/v2/check' })).body,
  }),

  defineTool({
    name: 'ws_dns_zone_get',
    title: 'Get DNS zone',
    description: 'Get the DNS zone attached to a service.',
    tier: 'read',
    inputSchema: z.strictObject({ service: serviceArg }),
    handler: async ({ service }, ctx) =>
      (
        await ctx.request({
          method: 'GET',
          path: `/v2/service/${encodeURIComponent(service)}/dns/zone`,
        })
      ).body,
  }),

  defineTool({
    name: 'ws_dns_record_list',
    title: 'List DNS records',
    description:
      'List DNS records in a service zone, with paging and server-side filtering. Returns the API pagination envelope unflattened.',
    tier: 'read',
    inputSchema: z.strictObject({
      service: serviceArg,
      ...paginationArgs,
      filters: recordFilters.optional(),
    }),
    handler: async (input, ctx) => {
      const { service, filters, ...paging } = input
      return (
        await ctx.request({
          method: 'GET',
          path: recordPath(service),
          query: {
            ...paginationQuery(paging),
            ...(filters ? { filters: filters as Record<string, never> } : {}),
          },
        })
      ).body
    },
  }),

  defineTool({
    name: 'ws_dns_record_create',
    title: 'Create DNS record',
    description:
      'Create a DNS record in a service zone. The API returns 204 with no body, so this tool re-lists the record it just wrote and returns that — `record` is null if the re-list found nothing.',
    tier: 'write',
    inputSchema: createRecordInput,
    handler: async (input, ctx) => {
      const { service, ...fields } = input
      const { status } = await ctx.request({
        method: 'POST',
        path: recordPath(service),
        body: recordBody(fields, CREATE_BODY_KEYS),
      })

      return {
        status,
        record: await relistCreatedRecord(ctx, service, fields),
      }
    },
  }),

  defineTool({
    name: 'ws_dns_record_update',
    title: 'Update DNS record',
    description:
      'Update a DNS record by id. Only the supplied fields are sent. The API returns 204 with no body.',
    tier: 'write',
    inputSchema: updateRecordInput,
    handler: async (input, ctx) => {
      const { service, record, ...fields } = input
      const { status } = await ctx.request({
        method: 'PUT',
        path: `${recordPath(service)}/${encodeURIComponent(record)}`,
        body: recordBody(fields, UPDATE_BODY_KEYS),
      })
      return { status, updated: true }
    },
  }),

  defineTool({
    name: 'ws_dns_record_delete',
    title: 'Delete DNS record',
    description:
      'Permanently delete a DNS record by id. The record and its resolution are lost immediately and cannot be recovered — recreate it manually if deleted in error.',
    tier: 'destructive',
    inputSchema: z.strictObject({
      service: serviceArg,
      record: z.string().min(1).describe('Record id to delete.'),
      ...confirmArg,
    }),
    handler: async (input, ctx) => {
      const { service, record } = input
      const { status } = await ctx.request({
        method: 'DELETE',
        path: `${recordPath(service)}/${encodeURIComponent(record)}`,
      })
      return { status, deleted: true }
    },
  }),
]
