import { z } from 'zod'

/**
 * Shared shape for the v1 read surface.
 *
 * Every v1 path is rooted at `/v1/user/:id`, and `self` is a documented alias
 * for the calling account — verified live 2026-08-25, `GET /v1/user/self`
 * returns the account. Defaulting to it means a caller never has to look up
 * their own id before doing anything else.
 */

export const userIdArg = z
  .string()
  .min(1)
  .default('self')
  .describe('Account id, or the literal "self" for the authenticated account. Defaults to "self".')

export function userPath(userId: string, suffix = ''): string {
  return `/v1/user/${encodeURIComponent(userId)}${suffix}`
}

export function hostingPath(userId: string, hostingId: string, suffix = ''): string {
  return userPath(userId, `/hosting/${encodeURIComponent(hostingId)}${suffix}`)
}

/**
 * v1 paging.
 *
 * **Not the v2 shape.** v1 list responses come back as
 * `{items: [...], pager: {page, pagesize, items}}`, where v2 uses
 * `{currentPage, rowsPerPage, totalPages, totalRecords, data}`. The parameter
 * names differ with them: v1 takes `page`/`pagesize`, v2 takes
 * `page`/`rowsPerPage`. Verified live 2026-08-25 against the real API.
 *
 * Paging is **not uniform**, so these are declared per endpoint rather than
 * everywhere. Measured live 2026-08-25 by sending `pagesize=7` and reading back
 * `pager.pagesize`:
 *
 * | endpoint   | `pagesize` echoed |
 * |------------|-------------------|
 * | `/service` | no — stays `null` |
 * | `/zone`    | yes               |
 * | `/hosting` | yes               |
 * | `/vps`     | yes               |
 * | `/invoice` | yes               |
 *
 * `ws_service_list` therefore declares no paging arguments at all. Whether
 * `page` is honoured is still unproven: on an empty account the server clamps
 * it, so it cannot be distinguished from being ignored until an account holds
 * more than one page of records.
 */
export const v1PaginationArgs = {
  page: z.number().int().min(1).optional().describe('1-based page number.'),
  pagesize: z.number().int().min(1).max(1000).optional().describe('Records per page.'),
}

export type V1PaginationArgs = {
  page?: number | undefined
  pagesize?: number | undefined
}

export function v1PaginationQuery(args: V1PaginationArgs): Record<string, number> {
  const query: Record<string, number> = {}
  if (args.page !== undefined) query.page = args.page
  if (args.pagesize !== undefined) query.pagesize = args.pagesize
  return query
}

/** The v1 list envelope, as the API actually returns it. */
export interface V1Page<T> {
  items: T[]
  pager: { page: number; pagesize: number | null; items: number }
}

/**
 * Collapse endpoints that differ only by a path suffix into one tool with a
 * `kind` enum — a single lookup object per tool, rather than three near-clones.
 */
export function suffixEnum<T extends Record<string, string>>(suffixes: T) {
  const keys = Object.keys(suffixes) as [keyof T & string, ...(keyof T & string)[]]
  return {
    schema: z.enum(keys),
    suffixFor: (kind: keyof T & string): string => suffixes[kind] as string,
  }
}
