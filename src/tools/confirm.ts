import { z } from 'zod'

/**
 * The confirmation gate every `destructive` tool carries.
 *
 * One shared fragment, one wording. A destructive tool is unreachable twice
 * over: `WEBSUPPORT_ALLOW_DESTRUCTIVE=1` must be set for it to be registered at
 * all, and then every individual call must pass `confirm: true`.
 *
 * The argument — not MCP elicitation — is the safety boundary. Protocol
 * negotiation may settle below the revision that supports elicitation, and a
 * gate that disappears when a client is old is not a gate.
 */
export const CONFIRM_DESCRIPTION =
  'Must be true. This operation is irreversible; set confirm: true only after the user has explicitly approved it.'

export const confirmArg = {
  confirm: z.literal(true).describe(CONFIRM_DESCRIPTION),
}

export type ConfirmArg = { confirm: true }
