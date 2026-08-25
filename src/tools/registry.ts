import type { AnyToolDef } from './types.js'
import { accountTools } from './v1/account-tools.js'
import { databaseTools } from './v1/database-tools.js'
import { hostingTools } from './v1/hosting-tools.js'
import { invoiceTools } from './v1/invoice-tools.js'
import { mailboxTools } from './v1/mailbox-tools.js'
import { vpsTools } from './v1/vps-tools.js'
import { dnsTools } from './v2/dns-tools.js'
import { domainAndDyndnsTools } from './v2/domain-and-dyndns-tools.js'
import { ftpTools } from './v2/ftp-tools.js'

/**
 * Every tool the server can expose, before tier filtering.
 *
 * Order-of-registration is the order here, which is also the order they appear
 * in `tools/list` and in the generated `docs/tools.md`.
 *
 * Order creation and invoice/order payment are out of scope by design —
 * `registry.test.ts` greps the source for those path literals and fails if any
 * reappears.
 */
export const registry: AnyToolDef[] = [
  ...dnsTools,
  ...ftpTools,
  ...domainAndDyndnsTools,
  ...accountTools,
  ...hostingTools,
  ...databaseTools,
  ...mailboxTools,
  ...vpsTools,
  ...invoiceTools,
]

export function toolByName(name: string): AnyToolDef | undefined {
  return registry.find((tool) => tool.name === name)
}
