import { z } from 'zod'
import { type AnyToolDef, defineTool } from '../types.js'
import { hostingPath, userIdArg } from './common.js'

/**
 * Mailboxes, rooted under a hosting service.
 *
 * Not under `/v1/user/:id` directly — `GET /v1/user/self/mailbox` answers
 * `404 The system is unable to find the requested action "self"`, verified live
 * 2026-08-25. The hosting-rooted form is a real route.
 */

const hostingIdArg = z.string().min(1).describe('Hosting id or uuid the mailbox belongs to.')

export const mailboxTools: AnyToolDef[] = [
  defineTool({
    name: 'ws_mailbox_list',
    title: 'List mailboxes',
    description: 'List the mailboxes on a hosting service.',
    tier: 'read',
    inputSchema: z.strictObject({ userId: userIdArg, hostingId: hostingIdArg }),
    handler: async ({ userId, hostingId }, ctx) =>
      (await ctx.request({ method: 'GET', path: hostingPath(userId, hostingId, '/mailbox') })).body,
  }),

  defineTool({
    name: 'ws_mailbox_get',
    title: 'Get mailbox',
    description:
      'Get one mailbox by id, including its address, quota and forwarding configuration.',
    tier: 'read',
    inputSchema: z.strictObject({
      userId: userIdArg,
      hostingId: hostingIdArg,
      mailboxId: z.string().min(1).describe('Mailbox id, as returned by ws_mailbox_list.'),
    }),
    handler: async ({ userId, hostingId, mailboxId }, ctx) =>
      (
        await ctx.request({
          method: 'GET',
          path: hostingPath(userId, hostingId, `/mailbox/${encodeURIComponent(mailboxId)}`),
        })
      ).body,
  }),

  defineTool({
    name: 'ws_mail_stats',
    title: 'Mail statistics',
    description:
      'Mail storage statistics for a hosting service. Supply `domain` to scope the figures to one domain; omit it for the whole service.',
    tier: 'read',
    inputSchema: z.strictObject({
      userId: userIdArg,
      hostingId: hostingIdArg,
      domain: z
        .string()
        .min(1)
        .optional()
        .describe('Restrict the statistics to this domain. Omit for the whole hosting service.'),
    }),
    handler: async ({ userId, hostingId, domain }, ctx) => {
      const suffix = domain ? `/mail/${encodeURIComponent(domain)}/size-stats` : '/mail/size-stats'
      return (await ctx.request({ method: 'GET', path: hostingPath(userId, hostingId, suffix) }))
        .body
    },
  }),
]
