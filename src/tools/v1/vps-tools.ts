import { z } from 'zod'
import { type AnyToolDef, defineTool } from '../types.js'
import { suffixEnum, userIdArg, userPath, v1PaginationArgs, v1PaginationQuery } from './common.js'

/** VPS instances, their statistics, and console access. */

const vpsIdArg = z.string().min(1).describe('VPS id or name, as returned by ws_vps_list.')

const vpsStats = suffixEnum({ cpu: '/cpu-stats', traffic: '/traffic-stats' })

function vpsPath(userId: string, vpsId: string, suffix = ''): string {
  return userPath(userId, `/vps/${encodeURIComponent(vpsId)}${suffix}`)
}

export const vpsTools: AnyToolDef[] = [
  defineTool({
    name: 'ws_vps_list',
    title: 'List VPS instances',
    description: 'List the VPS instances on the account.',
    tier: 'read',
    inputSchema: z.strictObject({ userId: userIdArg, ...v1PaginationArgs }),
    handler: async ({ userId, ...paging }, ctx) =>
      (
        await ctx.request({
          method: 'GET',
          path: userPath(userId, '/vps'),
          query: v1PaginationQuery(paging),
        })
      ).body,
  }),

  defineTool({
    name: 'ws_vps_get',
    title: 'Get VPS',
    description:
      'Get one VPS by id or name, including its specification, IP addresses and power state.',
    tier: 'read',
    inputSchema: z.strictObject({ userId: userIdArg, vpsId: vpsIdArg }),
    handler: async ({ userId, vpsId }, ctx) =>
      (await ctx.request({ method: 'GET', path: vpsPath(userId, vpsId) })).body,
  }),

  defineTool({
    name: 'ws_vps_stats',
    title: 'VPS statistics',
    description:
      'Usage statistics for a VPS. `kind` selects the series: cpu (processor load) or traffic (network transfer).',
    tier: 'read',
    inputSchema: z.strictObject({
      userId: userIdArg,
      vpsId: vpsIdArg,
      kind: vpsStats.schema.describe('Which statistics series to return.'),
    }),
    handler: async ({ userId, vpsId, kind }, ctx) =>
      (await ctx.request({ method: 'GET', path: vpsPath(userId, vpsId, vpsStats.suffixFor(kind)) }))
        .body,
  }),

  defineTool({
    name: 'ws_vps_vnc',
    title: 'Get VPS console access',
    description:
      'Get VNC console access details for a VPS. SENSITIVE — the response may carry a one-time console URL or session credential that grants direct machine access. Hand it to the user who asked for it and nothing else: do not log it, do not repeat it in a summary, and treat it as expiring.',
    tier: 'read',
    inputSchema: z.strictObject({ userId: userIdArg, vpsId: vpsIdArg }),
    handler: async ({ userId, vpsId }, ctx) =>
      (await ctx.request({ method: 'GET', path: vpsPath(userId, vpsId, '/vnc') })).body,
  }),
]
