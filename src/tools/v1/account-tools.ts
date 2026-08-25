import { z } from 'zod'
import { type AnyToolDef, defineTool } from '../types.js'
import { userIdArg, userPath, v1PaginationArgs, v1PaginationQuery } from './common.js'

/**
 * Account-level v1 reads: the user record, services, and DNS zones.
 *
 * `ws_user_get` is a prerequisite for the rest of the v1 surface, since every
 * other path hangs off `/v1/user/:id`.
 */

export const accountTools: AnyToolDef[] = [
  defineTool({
    name: 'ws_user_get',
    title: 'Get account',
    description:
      'Get the account record: id, contact details, billing profiles, market and currency. SENSITIVE — the response includes the billing address, email address, phone number, and a verifyUrl containing a live account-verification key. Do not echo the full response to the user or store it; read the specific field needed.',
    tier: 'read',
    inputSchema: z.strictObject({ userId: userIdArg }),
    handler: async ({ userId }, ctx) =>
      (await ctx.request({ method: 'GET', path: userPath(userId) })).body,
  }),

  defineTool({
    name: 'ws_service_list',
    title: 'List services',
    description:
      "List the account's services (hosting, domains, VPS and so on). Returns the v1 envelope {items, pager}. Service ids from here are the candidates for the v2 tools' `service` argument.",
    tier: 'read',
    // No paging arguments: /service is the one v1 list endpoint that ignores
    // `pagesize` outright — it answers `pager.pagesize: null` where /zone,
    // /hosting, /vps and /invoice all echo the value back. Verified live
    // 2026-08-25. Advertising an argument the server drops is worse than
    // having none.
    inputSchema: z.strictObject({ userId: userIdArg }),
    handler: async ({ userId }, ctx) =>
      (await ctx.request({ method: 'GET', path: userPath(userId, '/service') })).body,
  }),

  defineTool({
    name: 'ws_service_get',
    title: 'Get service',
    description:
      'Get one service by id, including its type, status and expiry. Use ws_service_list first to find the id.',
    tier: 'read',
    inputSchema: z.strictObject({
      userId: userIdArg,
      serviceId: z.string().min(1).describe('Service id, as returned by ws_service_list.'),
    }),
    handler: async ({ userId, serviceId }, ctx) =>
      (
        await ctx.request({
          method: 'GET',
          path: userPath(userId, `/service/${encodeURIComponent(serviceId)}`),
        })
      ).body,
  }),

  defineTool({
    name: 'ws_zone_list',
    title: 'List DNS zones',
    description:
      'List the DNS zones on the account. For the records inside a zone use the v2 tool ws_dns_record_list — v1 record CRUD is deprecated and deliberately not exposed.',
    tier: 'read',
    inputSchema: z.strictObject({ userId: userIdArg, ...v1PaginationArgs }),
    handler: async ({ userId, ...paging }, ctx) =>
      (
        await ctx.request({
          method: 'GET',
          path: userPath(userId, '/zone'),
          query: v1PaginationQuery(paging),
        })
      ).body,
  }),

  defineTool({
    name: 'ws_zone_get',
    title: 'Get DNS zone',
    description: 'Get one DNS zone by domain name.',
    tier: 'read',
    inputSchema: z.strictObject({
      userId: userIdArg,
      domain: z.string().min(1).describe('Zone domain name, e.g. "example.com".'),
    }),
    handler: async ({ userId, domain }, ctx) =>
      (
        await ctx.request({
          method: 'GET',
          path: userPath(userId, `/zone/${encodeURIComponent(domain)}`),
        })
      ).body,
  }),
]
