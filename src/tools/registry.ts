import type { AnyToolDef } from './types.js'
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
 * `no-order-or-payment-paths.test.ts` enforces their absence structurally.
 */
export const registry: AnyToolDef[] = [...dnsTools, ...ftpTools, ...domainAndDyndnsTools]

export function toolByName(name: string): AnyToolDef | undefined {
  return registry.find((tool) => tool.name === name)
}
