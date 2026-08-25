import { z } from 'zod'
import { paginationArgs, paginationQuery } from '../../http/pagination.js'
import { confirmArg } from '../confirm.js'
import type { AnyToolDef, Ctx } from '../types.js'
import { defineTool } from '../types.js'
import { serviceArg } from './dns-record-schema.js'

/**
 * FTP account tools.
 *
 * `password` is write-only: it appears in the create and update request bodies
 * and is absent from the `FtpAccount` response schema, so it can be set but
 * never read back. `openapi-spec.test.ts` asserts that against the vendored
 * spec, so a future upstream change surfaces as a failing test rather than as a
 * password silently echoed into a model's context.
 *
 * `ws_ftp_account_list` takes no `filters` — the spec declares none. Adding one
 * for symmetry with the DNS list would be inventing an API.
 */

const ftpPath = (service: string) => `/v2/service/${encodeURIComponent(service)}/ftp-account`

const accountArg = z.string().min(1).describe('FTP account id.')

/** Shared by create and update; create additionally requires login/password/dir. */
const ftpAccountFields = {
  disabled: z.boolean().nullable().optional().describe('Disable the account without deleting it.'),
  ftpEnabled: z.boolean().nullable().optional().describe('Allow FTP access.'),
  sshEnabled: z.boolean().nullable().optional().describe('Allow SSH/SFTP access.'),
  countryCheck: z.boolean().nullable().optional().describe('Restrict access by country.'),
  ipCheck: z.boolean().nullable().optional().describe('Restrict access by IP.'),
  countries: z
    .array(z.string())
    .nullable()
    .optional()
    .describe('Allowed country codes; applies when countryCheck is true.'),
  ips: z
    .array(z.string())
    .nullable()
    .optional()
    .describe('Allowed IPs; applies when ipCheck is true.'),
  note: z.string().nullable().optional().describe('Free-text note.'),
}

const CREATE_KEYS = [
  'login',
  'password',
  'dir',
  'disabled',
  'ftpEnabled',
  'sshEnabled',
  'countryCheck',
  'ipCheck',
  'countries',
  'ips',
  'note',
] as const

function bodyFrom(input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const key of CREATE_KEYS) {
    if (input[key] !== undefined) body[key] = input[key]
  }
  return body
}

interface FtpAccountPage {
  data: { id: number | null; login: string | null }[]
}

/**
 * Recover the account a create just wrote — `POST` answers `204` with no body,
 * exactly like the DNS create. Matched on `login`, which is unique per service.
 */
async function relistCreatedAccount(ctx: Ctx, service: string, login: string) {
  const { body } = await ctx.request<FtpAccountPage>({
    method: 'GET',
    path: ftpPath(service),
    query: { rowsPerPage: 1000 },
  })
  return body?.data?.find((account) => account.login === login) ?? null
}

export const ftpTools: AnyToolDef[] = [
  defineTool({
    name: 'ws_ftp_account_list',
    title: 'List FTP accounts',
    description:
      'List FTP accounts on a hosting service. Passwords are never returned — the API response schema has no password field.',
    tier: 'read',
    inputSchema: z.strictObject({ service: serviceArg, ...paginationArgs }),
    handler: async (input, ctx) => {
      const { service, ...paging } = input
      return (
        await ctx.request({ method: 'GET', path: ftpPath(service), query: paginationQuery(paging) })
      ).body
    },
  }),

  defineTool({
    name: 'ws_ftp_account_get',
    title: 'Get FTP account',
    description: 'Get one FTP account by id. The password is never returned.',
    tier: 'read',
    inputSchema: z.strictObject({ service: serviceArg, ftpAccount: accountArg }),
    handler: async ({ service, ftpAccount }, ctx) =>
      (
        await ctx.request({
          method: 'GET',
          path: `${ftpPath(service)}/${encodeURIComponent(ftpAccount)}`,
        })
      ).body,
  }),

  defineTool({
    name: 'ws_ftp_account_create',
    title: 'Create FTP account',
    description:
      'Create an FTP account. The API returns 204 with no body, so this tool re-lists by login and returns the created account — without its password, which the API never echoes back.',
    tier: 'write',
    inputSchema: z.strictObject({
      service: serviceArg,
      login: z.string().min(1).describe('Account login name.'),
      password: z
        .string()
        .min(1)
        .describe('Account password. Write-only — never returned by any read tool.'),
      dir: z.string().min(1).describe('Home directory the account is confined to.'),
      ...ftpAccountFields,
    }),
    handler: async (input, ctx) => {
      const { service, login, ...rest } = input
      const { status } = await ctx.request({
        method: 'POST',
        path: ftpPath(service),
        body: bodyFrom({ login, ...rest }),
      })
      return { status, account: await relistCreatedAccount(ctx, service, login) }
    },
  }),

  defineTool({
    name: 'ws_ftp_account_update',
    title: 'Update FTP account',
    description:
      'Update an FTP account by id. Only the supplied fields are sent. Supplying `password` rotates it. The API returns 204 with no body.',
    tier: 'write',
    inputSchema: z.strictObject({
      service: serviceArg,
      ftpAccount: accountArg,
      login: z.string().nullable().optional().describe('New login name.'),
      password: z.string().nullable().optional().describe('New password. Write-only.'),
      dir: z.string().nullable().optional().describe('New home directory.'),
      ...ftpAccountFields,
    }),
    handler: async (input, ctx) => {
      const { service, ftpAccount, ...fields } = input
      const { status } = await ctx.request({
        method: 'PUT',
        path: `${ftpPath(service)}/${encodeURIComponent(ftpAccount)}`,
        body: bodyFrom(fields),
      })
      return { status, updated: true }
    },
  }),

  defineTool({
    name: 'ws_ftp_account_delete',
    title: 'Delete FTP account',
    description:
      'Permanently delete an FTP account. Any client or deployment pipeline authenticating with these credentials loses access immediately. The account cannot be restored — it must be recreated with a new password.',
    tier: 'destructive',
    inputSchema: z.strictObject({ service: serviceArg, ftpAccount: accountArg, ...confirmArg }),
    handler: async ({ service, ftpAccount }, ctx) => {
      const { status } = await ctx.request({
        method: 'DELETE',
        path: `${ftpPath(service)}/${encodeURIComponent(ftpAccount)}`,
      })
      return { status, deleted: true }
    },
  }),
]
