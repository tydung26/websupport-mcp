import { z } from 'zod'
import type { AnyToolDef } from '../types.js'
import { defineTool } from '../types.js'
import { serviceArg } from './dns-record-schema.js'

/**
 * The two remaining v2 paths: assign-domain and DynDNS.
 *
 * `/nic/update` is the odd one out of the whole surface — no date header, a
 * `text/html` body, and no declared parameters upstream (the `parameters` key
 * is *absent*, not null). Its transport exception lives in `request-json.ts`;
 * this file just declares the tool.
 */

export const domainAndDyndnsTools: AnyToolDef[] = [
  defineTool({
    name: 'ws_domain_assign',
    title: 'Assign domain to hosting service',
    description:
      'Assign a domain to a hosting service, optionally installing WordPress. Unlike the other v2 mutations this one returns a body rather than 204.',
    tier: 'write',
    inputSchema: z.strictObject({
      service: serviceArg,
      domain: z.string().min(1).describe('Domain name to assign, e.g. "example.com".'),
      type: z.string().nullable().optional().describe('Assignment type, as accepted by the API.'),
      wordpressInstallationData: z
        .array(z.string())
        .nullable()
        .optional()
        .describe(
          'WordPress installation parameters, when the assignment should install WordPress.',
        ),
    }),
    handler: async (input, ctx) => {
      const { service, ...body } = input
      return (
        await ctx.request({
          method: 'POST',
          path: `/v2/service/${encodeURIComponent(service)}/assign-domain`,
          body,
        })
      ).body
    },
  }),

  defineTool({
    name: 'ws_dyndns_update',
    title: 'Dynamic DNS update',
    description:
      'Best-effort Dynamic DNS update via the standard /nic/update endpoint. Returns the raw text response, not JSON. This endpoint authenticates differently from the rest of the API (no date header) and its behaviour with a Standard API key is unverified — prefer ws_dns_record_update for reliable record changes.',
    tier: 'write',
    inputSchema: z
      .strictObject({
        hostname: z.string().min(1).describe('Hostname to update.'),
        myip: z
          .string()
          .optional()
          .describe('IP address to set. Omit to let the server use the caller IP.'),
      })
      // The upstream spec declares no parameters at all for this path, so the
      // query is passed through permissively rather than guessed at.
      .catchall(z.union([z.string(), z.number(), z.boolean()])),
    handler: async (input, ctx) =>
      (await ctx.request({ method: 'GET', path: '/nic/update', query: input })).body,
  }),
]
