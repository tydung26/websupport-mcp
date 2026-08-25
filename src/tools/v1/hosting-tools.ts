import { z } from 'zod'
import { type AnyToolDef, defineTool } from '../types.js'
import {
  hostingPath,
  suffixEnum,
  userIdArg,
  userPath,
  v1PaginationArgs,
  v1PaginationQuery,
} from './common.js'

/** Hosting services, their virtual hosts, and hosting-level statistics. */

const hostingIdArg = z
  .string()
  .min(1)
  .describe('Hosting id or uuid, as returned by ws_hosting_list.')

/** Three endpoints that differ only by suffix collapse into one `kind`. */
const hostingStats = suffixEnum({
  size: '/size-stats',
  domain: '/domain-stats',
  ftp: '/ftp-stats',
})

export const hostingTools: AnyToolDef[] = [
  defineTool({
    name: 'ws_hosting_list',
    title: 'List hosting services',
    description: 'List the hosting services on the account.',
    tier: 'read',
    inputSchema: z.strictObject({ userId: userIdArg, ...v1PaginationArgs }),
    handler: async ({ userId, ...paging }, ctx) =>
      (
        await ctx.request({
          method: 'GET',
          path: userPath(userId, '/hosting'),
          query: v1PaginationQuery(paging),
        })
      ).body,
  }),

  defineTool({
    name: 'ws_hosting_get',
    title: 'Get hosting service',
    description:
      'Get one hosting service by id or uuid, including its package, limits and current usage.',
    tier: 'read',
    inputSchema: z.strictObject({ userId: userIdArg, hostingId: hostingIdArg }),
    handler: async ({ userId, hostingId }, ctx) =>
      (await ctx.request({ method: 'GET', path: hostingPath(userId, hostingId) })).body,
  }),

  defineTool({
    name: 'ws_hosting_vhost_list',
    title: 'List virtual hosts',
    description: 'List the virtual hosts (domains) served by a hosting service.',
    tier: 'read',
    inputSchema: z.strictObject({ userId: userIdArg, hostingId: hostingIdArg }),
    handler: async ({ userId, hostingId }, ctx) =>
      (await ctx.request({ method: 'GET', path: hostingPath(userId, hostingId, '/vhost') })).body,
  }),

  defineTool({
    name: 'ws_hosting_vhost_get',
    title: 'Get virtual host',
    description:
      'Get one virtual host by id, including its document root and domain configuration.',
    tier: 'read',
    inputSchema: z.strictObject({
      userId: userIdArg,
      hostingId: hostingIdArg,
      vhostId: z.string().min(1).describe('Virtual host id.'),
    }),
    handler: async ({ userId, hostingId, vhostId }, ctx) =>
      (
        await ctx.request({
          method: 'GET',
          path: hostingPath(userId, hostingId, `/vhost/${encodeURIComponent(vhostId)}`),
        })
      ).body,
  }),

  defineTool({
    name: 'ws_hosting_stats',
    title: 'Hosting statistics',
    description:
      'Usage statistics for a hosting service. `kind` selects the series: size (disk usage), domain (per-domain traffic), or ftp (FTP activity).',
    tier: 'read',
    inputSchema: z.strictObject({
      userId: userIdArg,
      hostingId: hostingIdArg,
      kind: hostingStats.schema.describe('Which statistics series to return.'),
    }),
    handler: async ({ userId, hostingId, kind }, ctx) =>
      (
        await ctx.request({
          method: 'GET',
          path: hostingPath(userId, hostingId, hostingStats.suffixFor(kind)),
        })
      ).body,
  }),
]
