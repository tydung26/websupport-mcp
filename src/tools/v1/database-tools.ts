import { z } from 'zod'
import { type AnyToolDef, defineTool } from '../types.js'
import { hostingPath, suffixEnum, userIdArg } from './common.js'

/** Databases and database users, both rooted under a hosting service. */

const hostingIdArg = z.string().min(1).describe('Hosting id or uuid the database belongs to.')

const databaseIdArg = z.string().min(1).describe('Database id, as returned by ws_db_list.')

const dbStats = suffixEnum({ size: '/size-stats', cpu: '/cpu-stats' })

export const databaseTools: AnyToolDef[] = [
  defineTool({
    name: 'ws_db_list',
    title: 'List databases',
    description: 'List the databases on a hosting service.',
    tier: 'read',
    inputSchema: z.strictObject({ userId: userIdArg, hostingId: hostingIdArg }),
    handler: async ({ userId, hostingId }, ctx) =>
      (await ctx.request({ method: 'GET', path: hostingPath(userId, hostingId, '/db') })).body,
  }),

  defineTool({
    name: 'ws_db_get',
    title: 'Get database',
    description: 'Get one database by id, including its name, type and connection details.',
    tier: 'read',
    inputSchema: z.strictObject({
      userId: userIdArg,
      hostingId: hostingIdArg,
      databaseId: databaseIdArg,
    }),
    handler: async ({ userId, hostingId, databaseId }, ctx) =>
      (
        await ctx.request({
          method: 'GET',
          path: hostingPath(userId, hostingId, `/db/${encodeURIComponent(databaseId)}`),
        })
      ).body,
  }),

  defineTool({
    name: 'ws_db_users_list',
    title: 'List database users',
    description: 'List the database users on a hosting service.',
    tier: 'read',
    inputSchema: z.strictObject({ userId: userIdArg, hostingId: hostingIdArg }),
    handler: async ({ userId, hostingId }, ctx) =>
      (await ctx.request({ method: 'GET', path: hostingPath(userId, hostingId, '/dbusers') })).body,
  }),

  defineTool({
    name: 'ws_db_stats',
    title: 'Database statistics',
    description:
      'Usage statistics for one database. `kind` selects the series: size (storage used) or cpu (query load).',
    tier: 'read',
    inputSchema: z.strictObject({
      userId: userIdArg,
      hostingId: hostingIdArg,
      databaseId: databaseIdArg,
      kind: dbStats.schema.describe('Which statistics series to return.'),
    }),
    handler: async ({ userId, hostingId, databaseId, kind }, ctx) =>
      (
        await ctx.request({
          method: 'GET',
          path: hostingPath(
            userId,
            hostingId,
            `/db/${encodeURIComponent(databaseId)}${dbStats.suffixFor(kind)}`,
          ),
        })
      ).body,
  }),
]
