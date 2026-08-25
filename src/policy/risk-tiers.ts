import type { Env } from '../auth/api-config.js'
import type { RiskTier, ToolDef } from '../tools/types.js'

/**
 * Which tiers a deployment has opted into.
 *
 * The two opt-ins are independent — `destructive` does **not** imply `write`.
 * A deployment can allow a VPS reboot without allowing a mailbox rewrite, and
 * the reverse. Anything else would silently widen blast radius beyond what the
 * operator asked for.
 */
export interface TierPolicy {
  read: true
  write: boolean
  destructive: boolean
}

const OPT_IN = '1'

export function resolveTierPolicy(env: Env = process.env): TierPolicy {
  return {
    read: true,
    write: env.WEBSUPPORT_ALLOW_WRITE?.trim() === OPT_IN,
    destructive: env.WEBSUPPORT_ALLOW_DESTRUCTIVE?.trim() === OPT_IN,
  }
}

export function isTierAllowed(tier: RiskTier, policy: TierPolicy): boolean {
  return policy[tier]
}

/**
 * Filter the registry *before* registration, so a disallowed tool never reaches
 * `tools/list`. Gating at execution time would still ship the schema and the
 * description to the client, which is both a context cost and an invitation.
 */
// biome-ignore lint/suspicious/noExplicitAny: the registry is heterogeneous by design.
export function allowedTools(registry: readonly ToolDef<any>[], policy: TierPolicy) {
  return registry.filter((tool) => isTierAllowed(tool.tier, policy))
}

/** One-line summary for the stderr startup banner. */
export function describeTierPolicy(policy: TierPolicy): string {
  const enabled = ['read']
  if (policy.write) enabled.push('write')
  if (policy.destructive) enabled.push('destructive')
  return enabled.join('+')
}
