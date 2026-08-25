# Security

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/tydung26/websupport-mcp/security/advisories/new).
Please do not open a public issue for anything exploitable.

Expect an acknowledgement within a week. If a fix is warranted, the advisory is published alongside
the release that carries it.

This project wraps a third-party API. A flaw in Websupport's own service is not in scope here —
report those to Websupport directly.

## What this server holds

An API key and secret that grant **full control of a Websupport account**: DNS records, hosting,
databases, mailboxes, VPS instances and billing data. There is no read-only credential — the
account's own API pair is all-or-nothing. That is the central fact of this threat model, and the
reason for everything below.

## How credentials are handled

- Read from the environment only. Never from a config file, never from an argument, never
  persisted.
- The secret is used solely as an HMAC-SHA1 signing key. It is never transmitted — only the
  signature derived from it is.
- The secret never appears in a log line, an error message, a tool result or a serialised object.
  `describeCredentials()` exists so diagnostics can report its *length* rather than its value.
- `mapError` reads only the response `Date` header. Request headers, including `Authorization`, are
  never copied into an error.
- Asserted by test, not by convention: the signer suite checks that no returned field contains the
  secret, and the error-mapping suite checks that neither the secret nor an `Authorization` header
  can reach a mapped error.

Everything the server writes for diagnostics goes to **stderr**. stdout carries the JSON-RPC
stream, and a stray write there corrupts the session.

## Risk tiers are a security control

Tiers gate **registration**, not merely execution. A tool whose tier is not enabled never appears
in `tools/list`, so a model cannot call it, cannot see it, and is not tempted by it.

| Tier | Opt-in | Additional gate |
| --- | --- | --- |
| `read` | always on | — |
| `write` | `WEBSUPPORT_ALLOW_WRITE=1` | — |
| `destructive` | `WEBSUPPORT_ALLOW_DESTRUCTIVE=1` | `confirm: true` on every call |

The two opt-ins are independent by design: enabling destructive operations does not enable writes,
and vice versa.

**Deploy with neither opt-in unless you need them.** The default is 30 read-only tools.

The `confirm: true` argument, not MCP elicitation, is the safety boundary. Protocol negotiation can
settle below the revision that supports elicitation — the SDK in use currently tops out at
`2025-11-25` — and a gate that vanishes against an older client is not a gate. A registry-wide test
enforces that every `destructive` tool declares it and that no other tool does.

## Tools that return sensitive data

Two read tools return material worth treating carefully. Both say so in their own descriptions, so
the warning reaches the model as well as the reader.

| Tool | What it exposes |
| --- | --- |
| `ws_user_get` | Billing address, email, phone, **and a `verifyUrl` containing a live account-verification key**. |
| `ws_vps_vnc` | Console access details, potentially a one-time URL or session credential granting direct machine access. |

v1 responses are passed through unreshaped, deliberately, so undocumented fields reach the caller
rather than being silently dropped. The trade-off is that personal data in a v1 response reaches
the model's context too. Prefer narrower tools when you only need one field.

FTP passwords are write-only: they appear in create and update request bodies and are absent from
the API's response schema. A test asserts that against the vendored OpenAPI document, so an
upstream change surfaces as a failing build rather than as a password in a transcript.

## Out of scope by design

Order creation and invoice/order payment endpoints are **not implemented**, so this server cannot
spend money. A test greps the source tree for `/order` and `/pay` path literals and fails if either
reappears — the boundary is enforced structurally, not by review.

## Supply chain

- Published from CI with npm provenance under GitHub OIDC. No long-lived publish token exists on a
  developer machine.
- `npm pack` contents are asserted in CI: exactly one bundled entrypoint, and no `.env`, sources or
  tests.
- Dependabot covers npm and GitHub Actions weekly; CodeQL runs on every push and pull request.
- Secret scanning and push protection are enabled on the repository.
- Runtime dependencies are deliberately few: the MCP SDK and Zod.

## Deployment advice

- Give the server its own API key rather than sharing one with other automation, so it can be
  revoked independently.
- Run without `WEBSUPPORT_ALLOW_WRITE` and `WEBSUPPORT_ALLOW_DESTRUCTIVE` unless a specific task
  needs them, and unset them again afterwards.
- Revoking an API pair in WebAdmin is irreversible and immediate — that is the kill switch.
- Treat any transcript that invoked `ws_user_get` or `ws_vps_vnc` as containing sensitive data.
