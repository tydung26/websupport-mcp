# websupport-mcp

An MCP server (TypeScript, ESM, stdio) wrapping the [Websupport](https://www.websupport.sk) REST
API v1 + v2 — DNS, FTP, hosting, databases, mailboxes, VPS and invoices — exposed as MCP tools with
signed HMAC-SHA1 authentication.

**Status: in development.** The v2 surface (13 tools) is implemented and runs; the v1 surface
(37 tools) is not written yet. See [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) for the phase
breakdown and current progress.

## Risk tiers

Tools are registered in three tiers, and the tier gates **registration** — a read-only deployment
never sees a write tool in `tools/list` at all, so it costs no client context and offers no
affordance.

| Tier | Opt-in | Extra per-call gate | Currently |
| --- | --- | --- | --- |
| `read` | always on | — | 5 tools |
| `write` | `WEBSUPPORT_ALLOW_WRITE=1` | — | 6 tools |
| `destructive` | `WEBSUPPORT_ALLOW_DESTRUCTIVE=1` | `confirm: true` argument | 2 tools |

The two opt-ins are independent: `WEBSUPPORT_ALLOW_DESTRUCTIVE=1` alone does **not** unlock write
tools, and vice versa.

The `confirm: true` argument, not MCP elicitation, is the safety boundary. Protocol negotiation may
settle well below the revision that supports elicitation — this server's SDK currently tops out at
`2025-11-25` — and a gate that disappears against an older client is not a gate.

## Install

Not yet published. To run from a local checkout:

```bash
npm install
npm run build
```

Then point an MCP client at it:

```jsonc
{
  "mcpServers": {
    "websupport": {
      "command": "node",
      "args": ["/absolute/path/to/websupport-mcp/dist/index.js"],
      "env": {
        "WEBSUPPORT_API_KEY": "…",
        "WEBSUPPORT_API_SECRET": "…"
      }
    }
  }
}
```

## Credentials

Generate a **Standard** API access pair in WebAdmin (Security → API keys). A DynDNS-only pair
authenticates against `/nic/update` and nothing else.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `WEBSUPPORT_API_KEY` | yes | — | The pair's *identifier*. |
| `WEBSUPPORT_API_SECRET` | yes | — | The pair's *secret*. Used for HMAC-SHA1 signing; never logged, never returned in an error. |
| `WEBSUPPORT_API_BASE_URL` | no | `https://rest.websupport.sk` | Market selection — see below. |
| `WEBSUPPORT_ACCEPT_LANGUAGE` | no | `en_us` | One of `en_us`, `sk`, `cs_cz`, `hu`. |
| `WEBSUPPORT_ALLOW_WRITE` | no | off | Set to `1` to register write tools. |
| `WEBSUPPORT_ALLOW_DESTRUCTIVE` | no | off | Set to `1` to register destructive tools. |

Copy [`.env.example`](.env.example) for local development. `.env` is gitignored.

## Markets

Websupport is a regional team.blue/Loopia brand, so the API host selects the market. The same
application serves every host — `GET /v2/docs/openapi.json` is byte-identical across all of them —
so switching markets is configuration, never a code change.

| Market | `WEBSUPPORT_API_BASE_URL` |
| --- | --- |
| Slovakia (default) | `https://rest.websupport.sk` |
| Czechia | `https://rest.websupport.cz` |
| Hungary | `https://rest.websupport.hu` |
| Sweden | `https://rest.websupport.se` |

An unrecognised host warns to stderr and is used anyway, so a newly added market works without
waiting for a release.

## Scope

Order creation and invoice/order payment endpoints are deliberately out of scope and are asserted
absent by test. v1 DNS-record CRUD and v1 FTP-account CRUD are deprecated upstream and are not
exposed — the v2 tools cover both.

## Development

```bash
npm test          # offline suite
npm run test:network  # live, unauthenticated probes (market hosts + OpenAPI drift)
npm run typecheck
npm run lint
npm run build
```

Network suites are separated deliberately: a Websupport outage must not fail the build.

## Licence

MIT.
