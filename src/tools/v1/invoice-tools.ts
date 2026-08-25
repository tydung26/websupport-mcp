import { z } from 'zod'
import { type AnyToolDef, defineTool } from '../types.js'
import { userIdArg, userPath, v1PaginationArgs, v1PaginationQuery } from './common.js'

/**
 * Invoice reads.
 *
 * Reads only — invoice and order *payment* are out of scope for this server by
 * design, and their absence is enforced by test.
 */

const invoiceIdArg = z.string().min(1).describe('Invoice id, as returned by ws_invoice_list.')

function invoicePath(userId: string, invoiceId: string, suffix = ''): string {
  return userPath(userId, `/invoice/${encodeURIComponent(invoiceId)}${suffix}`)
}

export const invoiceTools: AnyToolDef[] = [
  defineTool({
    name: 'ws_invoice_list',
    title: 'List invoices',
    description:
      "List the account's invoices with their amounts, dates and payment status. Paying an invoice is deliberately out of scope for this server.",
    tier: 'read',
    inputSchema: z.strictObject({ userId: userIdArg, ...v1PaginationArgs }),
    handler: async ({ userId, ...paging }, ctx) =>
      (
        await ctx.request({
          method: 'GET',
          path: userPath(userId, '/invoice'),
          query: v1PaginationQuery(paging),
        })
      ).body,
  }),

  defineTool({
    name: 'ws_invoice_get',
    title: 'Get invoice',
    description:
      'Get one invoice by id, including line items, totals and payment status. Use ws_invoice_pdf for the document itself.',
    tier: 'read',
    inputSchema: z.strictObject({ userId: userIdArg, invoiceId: invoiceIdArg }),
    handler: async ({ userId, invoiceId }, ctx) =>
      (await ctx.request({ method: 'GET', path: invoicePath(userId, invoiceId) })).body,
  }),

  defineTool({
    name: 'ws_invoice_pdf',
    title: 'Get invoice PDF',
    description:
      'Fetch an invoice as a PDF. `base64` returns the document encoded for a caller that will decode and save it. `binary` reports the size and type only — raw PDF bytes are never inlined into a tool result, because they would flood the conversation without being usable.',
    tier: 'read',
    inputSchema: z.strictObject({
      userId: userIdArg,
      invoiceId: invoiceIdArg,
      format: z
        .enum(['base64', 'binary'])
        .default('binary')
        .describe(
          'base64 returns the encoded document; binary returns metadata and a byte count only.',
        ),
    }),
    handler: async ({ userId, invoiceId, format }, ctx) => {
      // Two distinct upstream endpoints, not two encodings of one response.
      const suffix = format === 'base64' ? '/pdf' : '/raw-pdf'
      const { status, body } = await ctx.request<Uint8Array>({
        method: 'GET',
        path: invoicePath(userId, invoiceId, suffix),
        responseType: 'bytes',
      })

      const bytes = body instanceof Uint8Array ? body : new Uint8Array()

      if (format === 'base64') {
        return {
          status,
          format,
          byteLength: bytes.byteLength,
          base64: Buffer.from(bytes).toString('base64'),
        }
      }

      return {
        status,
        format,
        byteLength: bytes.byteLength,
        note: 'Raw bytes are deliberately not inlined. Re-request with format: "base64" if the document content is genuinely needed.',
      }
    },
  }),
]
