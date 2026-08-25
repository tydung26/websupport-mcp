# websupport-mcp

An MCP server (TypeScript, ESM, stdio) wrapping the [Websupport](https://www.websupport.sk) REST
API v1 + v2 — DNS, FTP, hosting, databases, mailboxes, VPS and invoices — exposed as MCP tools with
signed HMAC-SHA1 authentication.

**Status: in development.** All 50 tools are implemented and the server runs. What remains is
verification against an account that owns real resources, packaging, and release. See
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) for progress.

## Risk tiers

Tools are registered in three tiers, and the tier gates **registration** — a read-only deployment
never sees a write tool in `tools/list` at all, so it costs no client context and offers no
affordance.

| Tier | Opt-in | Extra per-call gate | Currently |
| --- | --- | --- | --- |
| `read` | always on | — | 30 tools |
| `write` | `WEBSUPPORT_ALLOW_WRITE=1` | — | 13 tools |
| `destructive` | `WEBSUPPORT_ALLOW_DESTRUCTIVE=1` | `confirm: true` argument | 7 tools |

A tool is `destructive` when it destroys state you cannot cheaply recreate — not merely because it
writes. A graceful VPS reboot is `write`; a hard power-cycle is `destructive`, because it can
corrupt in-flight writes. Taking a snapshot is `write`; restoring one is `destructive`, because it
discards everything since.

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

Requires Node >= 22.

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

## Documentation

| Document | What it holds |
| --- | --- |
| [`docs/tools.md`](docs/tools.md) | Every tool: tier, method + path, confirm requirement. Generated from the registry — never hand-edited. |
| [`docs/verification-matrix.md`](docs/verification-matrix.md) | What has actually been proven about each tool, and what has not. Read this before trusting any tool in production. |

## Scope

Order creation and invoice/order payment endpoints are deliberately out of scope and are asserted
absent by test. v1 DNS-record CRUD and v1 FTP-account CRUD are deprecated upstream and are not
exposed — the v2 tools cover both.

## Development

```bash
npm test              # offline suite
npm run test:network  # live, unauthenticated probes (market hosts + OpenAPI drift)
npm run typecheck
npm run lint
npm run build
```

Network suites are separated deliberately: a Websupport outage must not fail the build.

### Toolchain

**Node >= 22**, to run or to build. Node 20 reached end of life on 2026-04-30 and is not
supported. CI covers the two live LTS lines, 22 and 24, and builds and smoke-tests the bundle on
each.

Building also needs **npm >= 11**: npm 10 cannot resolve the bundler's dependency tree and fails
with an unhelpful `Cannot read properties of null (reading 'edgesOut')`. If you hit that, upgrade
npm rather than debugging the repository.

## Licence

MIT.
