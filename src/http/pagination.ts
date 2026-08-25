import { z } from 'zod'

/**
 * v2 list responses. Returned to callers unflattened, exactly as the API shapes
 * them, so paging state stays visible to the model driving the tool.
 */
export interface Paginated<T> {
  currentPage: number
  rowsPerPage: number
  totalPages: number
  totalRecords: number
  data: T[]
}

/**
 * The paging arguments shared by every v2 list tool. Declared as a plain shape
 * rather than a schema object so tool schemas can spread it into their own
 * `z.strictObject`.
 */
export const paginationArgs = {
  page: z.number().int().min(1).optional().describe('1-based page number.'),
  rowsPerPage: z.number().int().min(1).max(1000).optional().describe('Records per page.'),
  descending: z.boolean().optional().describe('Reverse the sort order.'),
  sortBy: z.string().optional().describe('Field name to sort by.'),
}

export type PaginationArgs = {
  page?: number | undefined
  rowsPerPage?: number | undefined
  descending?: boolean | undefined
  sortBy?: string | undefined
}

/** Map paging args onto the query object, dropping anything unset. */
export function paginationQuery(args: PaginationArgs): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = {}
  if (args.page !== undefined) query.page = args.page
  if (args.rowsPerPage !== undefined) query.rowsPerPage = args.rowsPerPage
  if (args.descending !== undefined) query.descending = args.descending
  if (args.sortBy !== undefined) query.sortBy = args.sortBy
  return query
}
