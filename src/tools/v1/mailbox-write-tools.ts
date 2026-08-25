import { z } from 'zod'
import { confirmArg } from '../confirm.js'
import { type AnyToolDef, defineTool } from '../types.js'
import { hostingPath, userIdArg } from './common.js'
import { bodyWithout, PASSTHROUGH_NOTE, passthroughObject } from './write-body.js'

/**
 * Mailbox create, update and delete.
 *
 * Two upstream quirks are mirrored rather than normalised, both confirmed live
 * on 2026-08-25:
 *
 *  - **Writes are domain-rooted, reads are not.** Writes go to
 *    `.../hosting/:hid/domain/:did/mailbox`, while the Phase 4 reads sit at
 *    `.../hosting/:hid/mailbox`. Probing the symmetrical-looking
 *    `POST .../hosting/:hid/mailbox` returns
 *    `404 The system is unable to find the requested action` — that route does
 *    not exist. The asymmetry is real; do not "fix" it.
 *
 *  - **Update is `POST`, not `PUT`**, to the mailbox id path.
 */

const hostingIdArg = z.string().min(1).describe('Hosting id or uuid.')
const domainIdArg = z
  .string()
  .min(1)
  .describe(
    'Domain id the mailbox belongs to. Comes from ws_hosting_vhost_list, not from ws_mailbox_list.',
  )
const mailboxIdArg = z.string().min(1).describe('Mailbox id, as returned by ws_mailbox_list.')

const PATH_ARGS = ['userId', 'hostingId', 'domainId', 'mailboxId', 'confirm'] as const

function mailboxPath(
  userId: string,
  hostingId: string,
  domainId: string,
  mailboxId?: string,
): string {
  const base = `/domain/${encodeURIComponent(domainId)}/mailbox`
  return hostingPath(
    userId,
    hostingId,
    mailboxId ? `${base}/${encodeURIComponent(mailboxId)}` : base,
  )
}

export const mailboxWriteTools: AnyToolDef[] = [
  defineTool({
    name: 'ws_mailbox_create',
    title: 'Create mailbox',
    description: `Create a mailbox on a domain. Note the domain-rooted path: the domain id comes from ws_hosting_vhost_list. ${PASSTHROUGH_NOTE}`,
    tier: 'write',
    inputSchema: passthroughObject({
      userId: userIdArg,
      hostingId: hostingIdArg,
      domainId: domainIdArg,
      name: z.string().min(1).describe('Mailbox local part, i.e. the text before the @.'),
    }),
    handler: async (input, ctx) => {
      const { status, body } = await ctx.request({
        method: 'POST',
        path: mailboxPath(input.userId, input.hostingId, input.domainId),
        body: bodyWithout(input, PATH_ARGS),
      })
      return { status, mailbox: body }
    },
  }),

  defineTool({
    name: 'ws_mailbox_update',
    title: 'Update mailbox',
    description: `Update a mailbox. This endpoint takes POST rather than PUT — a documented v1 quirk, not a mistake. ${PASSTHROUGH_NOTE}`,
    tier: 'write',
    inputSchema: passthroughObject({
      userId: userIdArg,
      hostingId: hostingIdArg,
      domainId: domainIdArg,
      mailboxId: mailboxIdArg,
    }),
    handler: async (input, ctx) => {
      const { status, body } = await ctx.request({
        // POST, not PUT. The v1 docs specify it and the route confirms it.
        method: 'POST',
        path: mailboxPath(input.userId, input.hostingId, input.domainId, input.mailboxId),
        body: bodyWithout(input, PATH_ARGS),
      })
      return { status, mailbox: body }
    },
  }),

  defineTool({
    name: 'ws_mailbox_delete',
    title: 'Delete mailbox',
    description:
      'Permanently delete a mailbox and every message stored in it. Mail already delivered is destroyed and cannot be recovered, and messages sent to the address afterwards will bounce.',
    tier: 'destructive',
    inputSchema: z.strictObject({
      userId: userIdArg,
      hostingId: hostingIdArg,
      domainId: domainIdArg,
      mailboxId: mailboxIdArg,
      ...confirmArg,
    }),
    handler: async ({ userId, hostingId, domainId, mailboxId }, ctx) => {
      const { status } = await ctx.request({
        method: 'DELETE',
        path: mailboxPath(userId, hostingId, domainId, mailboxId),
      })
      return { status, deleted: true }
    },
  }),
]
