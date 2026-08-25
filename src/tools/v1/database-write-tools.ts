import { z } from 'zod'
import { confirmArg } from '../confirm.js'
import { type AnyToolDef, defineTool } from '../types.js'
import { hostingPath, userIdArg } from './common.js'
import { bodyWithout, PASSTHROUGH_NOTE, passthroughObject } from './write-body.js'

/** Database create, update and delete. */

const hostingIdArg = z.string().min(1).describe('Hosting id or uuid the database belongs to.')
const databaseIdArg = z.string().min(1).describe('Database id, as returned by ws_db_list.')

const PATH_ARGS = ['userId', 'hostingId', 'databaseId', 'confirm'] as const

export const databaseWriteTools: AnyToolDef[] = [
  defineTool({
    name: 'ws_db_create',
    title: 'Create database',
    description: `Create a database on a hosting service. ${PASSTHROUGH_NOTE}`,
    tier: 'write',
    inputSchema: passthroughObject({
      userId: userIdArg,
      hostingId: hostingIdArg,
      name: z.string().min(1).describe('Database name.'),
    }),
    handler: async (input, ctx) => {
      const { status, body } = await ctx.request({
        method: 'POST',
        path: hostingPath(input.userId, input.hostingId, '/db'),
        body: bodyWithout(input, PATH_ARGS),
      })
      return { status, database: body }
    },
  }),

  defineTool({
    name: 'ws_db_update',
    title: 'Update database',
    description: `Update a database. Only the supplied fields are sent. ${PASSTHROUGH_NOTE}`,
    tier: 'write',
    inputSchema: passthroughObject({
      userId: userIdArg,
      hostingId: hostingIdArg,
      databaseId: databaseIdArg,
    }),
    handler: async (input, ctx) => {
      const { status, body } = await ctx.request({
        method: 'PUT',
        path: hostingPath(
          input.userId,
          input.hostingId,
          `/db/${encodeURIComponent(input.databaseId)}`,
        ),
        body: bodyWithout(input, PATH_ARGS),
      })
      return { status, database: body }
    },
  }),

  defineTool({
    name: 'ws_db_delete',
    title: 'Delete database',
    description:
      'Permanently delete a database and everything stored in it. The data is destroyed immediately and cannot be recovered from this API — restore from your own backup or it is gone. Any application still pointing at this database will start failing.',
    tier: 'destructive',
    inputSchema: z.strictObject({
      userId: userIdArg,
      hostingId: hostingIdArg,
      databaseId: databaseIdArg,
      ...confirmArg,
    }),
    handler: async ({ userId, hostingId, databaseId }, ctx) => {
      const { status } = await ctx.request({
        method: 'DELETE',
        path: hostingPath(userId, hostingId, `/db/${encodeURIComponent(databaseId)}`),
      })
      return { status, deleted: true }
    },
  }),
]
