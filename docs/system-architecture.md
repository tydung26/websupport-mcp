# System architecture

How a tool call becomes a signed HTTP request, and where the safety boundaries sit.

## Request path

```
MCP client
   │  JSON-RPC over stdio
   ▼
src/server.ts            the only file that knows the MCP SDK
   │  ToolDef.handler(input, ctx)
   ▼
src/tools/**             50 tools; each owns its own semantics
   │  ctx.request(spec)
   ▼
src/http/request-json.ts transport: sign, send, parse, retry
   │
   ├─▶ build-path-with-query.ts   assemble the request-target
   ├─▶ auth/signer.ts             canonical string → Authorization
   ├─▶ retry.ts                   backoff, and what may be retried
   └─▶ map-error.ts               non-2xx → typed error
   │
   ▼
rest.websupport.{sk,cz,hu,se}
```

Only `src/server.ts` imports the MCP SDK. Everything else speaks the local `ToolDef` and `Ctx`
contracts, so swapping the SDK means rewriting one adapter rather than fifty tools.

## Signing

```
canonical  = "{METHOD} {path} {unixSeconds}"        ← path only, no query
signature  = hmacSha1(secret, canonical).hex()
Authorization = "Basic " + base64(apiKey + ":" + signature)
date header   = YYYYMMDDTHHMMSSZ, from the same unixSeconds
header name   = "Date" for /v1, "X-Date" for everything else
```

Three things here are counter-intuitive and each was measured against the live API, not inferred:

**The query string is not signed.** The vendor documentation prints a worked example that includes
it. Signing the query returns `401 Incorrect api key or signature.` on both API generations, with
and without a `filters` deepObject; signing the bare path and sending the query is accepted. The
signer parameter is named `pathForSignature` to make this hard to undo by accident, and a test
asserts the two forms produce different signatures.

**v1 requires `Date` and rejects `X-Date`; v2 accepts either.** The split is a v1 constraint, not a
symmetry. Collapsing both onto one header name looks like a simplification and breaks every v1
call.

**`/nic/update` takes no date header at all** and returns `text/html`. It is special-cased in the
transport *before* the version rule, rather than treated as a v2 path that happens to lack a `/v1`
prefix.

The secret is never transmitted — only the signature derived from it. It never enters a log line,
an error, or a tool result; `mapError` reads only the response `Date` header, so a request header
cannot leak into an error by accident.

## URL construction

`build-path-with-query.ts` is the only place a request-target is assembled. It deliberately does
not use `URLSearchParams`, which percent-encodes `[` and `]` — breaking the v2 `deepObject` filter
encoding — and whose `sort()` would reorder keys. Keys are emitted in declared order, unset values
are skipped, and an empty query yields a bare path with no trailing `?`.

## Response handling

Parsing is conditional, because JSON is not the common case:

| Condition | Result |
| --- | --- |
| `204`, or `content-length: 0`, or an empty body | `{status, body: null}` |
| `responseType: 'bytes'` | `Uint8Array`, untouched |
| `content-type: text/*` | string |
| otherwise | parsed JSON, falling back to raw text if it will not parse |

Every v2 DNS and FTP mutation answers `204` with no content, so a create returns no id. The tool
layer recovers one by re-listing what it just wrote — one extra `GET` per create, versus handing
the caller nothing usable. `assign-domain` is the exception that returns a body.

The `bytes` mode exists for invoice PDFs: running them through `response.text()` corrupts them
silently.

## Risk tiers

Tiers gate **registration**, not execution:

```
registry (50 tools) ──▶ allowedTools(registry, policy) ──▶ registerTool loop
```

A tool whose tier is not enabled never reaches `tools/list`. It costs the client no context and
offers the model no affordance — a materially stronger property than refusing the call later.

| Tier | Opt-in | Extra gate | Count |
| --- | --- | --- | --- |
| `read` | always | — | 30 |
| `write` | `WEBSUPPORT_ALLOW_WRITE=1` | — | 13 |
| `destructive` | `WEBSUPPORT_ALLOW_DESTRUCTIVE=1` | `confirm: true` per call | 7 |

The opt-ins are independent: neither implies the other.

Tier follows **what an operation destroys**, not whether it writes. A graceful VPS reboot is
`write`; a hard power-cycle is `destructive` because it can corrupt in-flight writes. Taking a
snapshot is `write`; restoring one is `destructive` because it discards everything since.

`confirm: true` — not MCP elicitation — is the safety boundary. Negotiation settles at `2025-11-25`
with the current SDK, below the revision elicitation needs, and a gate that vanishes against an
older client is not a gate.

## Configuration

Everything arrives through `Ctx`, never a module-level constant, so a market switch is
configuration rather than a code change. `market-hosts.ts` is the only file permitted to contain an
API host literal, enforced by a grep test. An unrecognised host warns to stderr and is used anyway
— a new market should work without waiting for a release.

Credentials are read on the first request, not at startup. Settings (market, language) resolve
without them, so the server completes a handshake and answers `tools/list` unauthenticated: every
automated consumer — registry build sandboxes, MCP Inspector, client config probes — introspects
before anyone holds a key. Reading them in `main()` turned an absent variable into an exited
process and an opaque `Connection closed`; now it is a typed error on the one call that needs to
sign something. `Ctx` carries no credential at all, which is why no tool result can leak one.

## Container image

The `Dockerfile` builds the same bundle CI publishes: build stage installs everything and runs the
bundler, runtime stage installs production dependencies only. The MCP SDK and zod are never
bundled — bundling the SDK defeats its conditional exports — so they must be installed rather than
copied. CI builds the image and drives the same unauthenticated handshake through
`docker run -i`, because a broken image is what a registry build sandbox sees, and a failed build
there withholds the listing.

## Where the schemas come from

The v2 record-type enums and the ten `filters` keys are read out of the vendored OpenAPI document
at load time rather than retyped, so an upstream change surfaces as a schema change. The document
is imported as a module so the bundler inlines it; nothing is read from disk at runtime. A
non-blocking network suite re-fetches it from all four market hosts and compares md5.

v1 has no machine-readable spec — `/v1/docs/openapi.json` and its neighbours all 404 — so v1 tool
schemas are hand-written, and the create bodies for databases and mailboxes forward unknown fields
rather than asserting a contract nobody has verified.

## Output discipline

stdout carries the JSON-RPC stream. One stray write corrupts it and kills the session, so every
diagnostic goes to stderr and the linter rejects `console.log` outright. Errors cross the tool
boundary as typed results, never as thrown strings.
