import { z } from 'zod'
import { type AnyToolDef, defineTool } from '../types.js'
import { userIdArg, userPath } from './common.js'

/**
 * The one service mutation in scope: the auto-renewal toggle.
 *
 * `PUT /v1/user/:id/service/:serviceId` is a general service update endpoint,
 * but this tool sends `autoExtend` and nothing else. Exposing arbitrary service
 * properties through a tool would let a model change billing terms or expiry
 * behaviour it was never asked to touch; the narrow surface is the point.
 */

export const serviceWriteTools: AnyToolDef[] = [
  defineTool({
    name: 'ws_service_set_auto_extend',
    title: 'Set service auto-renewal',
    description:
      'Turn automatic renewal on or off for a service. Switching it off means the service will expire at the end of its current term unless renewed manually — for a domain or hosting package that eventually means it stops working. Only the autoExtend flag is sent; no other service property is touched.',
    tier: 'write',
    inputSchema: z.strictObject({
      userId: userIdArg,
      serviceId: z.string().min(1).describe('Service id, as returned by ws_service_list.'),
      autoExtend: z
        .boolean()
        .describe('true to renew automatically at the end of the term, false to let it expire.'),
    }),
    handler: async ({ userId, serviceId, autoExtend }, ctx) => {
      const { status, body } = await ctx.request({
        method: 'PUT',
        path: userPath(userId, `/service/${encodeURIComponent(serviceId)}`),
        // Deliberately the only field sent.
        body: { autoExtend },
      })
      return { status, service: body }
    },
  }),
]
