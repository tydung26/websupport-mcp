# websupport-mcp

An MCP server (TypeScript, ESM, stdio) wrapping the [Websupport](https://www.websupport.sk) REST
API v1 + v2 — DNS, FTP, hosting, databases, mailboxes, VPS and invoices — exposed as MCP tools with
signed HMAC-SHA1 authentication.

[![npm](https://img.shields.io/npm/v/websupport-mcp)](https://www.npmjs.com/package/websupport-mcp)
[![licence: MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

**Status: early.** All 50 tools are implemented and published, but most have been verified only as
far as reaching the API — routes, signing and error handling are proven; response shapes largely are
not. Read [`docs/verification-matrix.md`](docs/verification-matrix.md) before relying on any tool,
and see [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) for progress.

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

Requires **Node >= 22**. Nothing to install ahead of time — `npx` fetches the package on first run.

Add this to your MCP client's configuration:

```jsonc
{
  "mcpServers": {
    "websupport": {
      "command": "npx",
      "args": ["-y", "websupport-mcp"],
      "env": {
        "WEBSUPPORT_API_KEY": "…",
        "WEBSUPPORT_API_SECRET": "…"
      }
    }
  }
}
```

That gives you the 30 read-only tools. Nothing in that configuration can change your account.

To allow changes, add only the opt-ins you need — see [Risk tiers](#risk-tiers) above:

```jsonc
"env": {
  "WEBSUPPORT_API_KEY": "…",
  "WEBSUPPORT_API_SECRET": "…",
  "WEBSUPPORT_ALLOW_WRITE": "1",
  "WEBSUPPORT_ALLOW_DESTRUCTIVE": "1"
}
```

Ready-made configurations for each combination live in
[`examples/mcp-config/`](examples/mcp-config/). Pin a version with `websupport-mcp@0.1.1` in place
of `websupport-mcp`.

Once it is wired up, ask your client to run `ws_auth_check`. It returns `{"verified": true}` when
the credentials work, which is the quickest way to separate a bad key from anything else.

### From a local checkout

For development, or to run unreleased changes:

```bash
npm install
npm run build
```

Then point `command` at `node` and `args` at the built entrypoint
(`<checkout>/dist/index.js`) instead of `npx`.

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
| [`docs/system-architecture.md`](docs/system-architecture.md) | The request path, the signing contract and its three counter-intuitive rules, and how the tier model works. |
| [`docs/codebase-summary.md`](docs/codebase-summary.md) | Module map — what lives where and why. |
| [`examples/mcp-config/`](examples/mcp-config/) | Ready-to-edit client configurations for each tier combination. |

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

## Security

The credentials this server holds grant full control of a Websupport account — there is no
read-only API pair. [`SECURITY.md`](SECURITY.md) covers how they are handled, which tools return
sensitive data, and how to report a vulnerability privately.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Note two boundaries enforced by test rather than review:
no order or payment endpoints, and every destructive tool must declare `confirm: true`.

## Licence

MIT — see [`LICENSE`](LICENSE).
