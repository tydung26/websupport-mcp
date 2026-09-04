# Codebase summary

A module map. For *how* the pieces fit together see
[`system-architecture.md`](system-architecture.md); for what each tool does see
[`tools.md`](tools.md).

Every source file is under 200 lines, deliberately. Tests sit beside their subject as `*.test.ts`;
suites needing the network are `*.network.test.ts` and run under a separate config so an upstream
outage cannot fail the build.

## `src/auth/` — credentials and signing

| File | Responsibility |
| --- | --- |
| `signer.ts` | The canonical string, HMAC-SHA1, the `Basic` header, and the date header value. Pure and synchronous — the timestamp is an argument, so tests need no clock mocking. Takes `pathForSignature`, **not** the request-target. |
| `api-config.ts` | Reads the environment. `loadSettings` (market, language) resolves with no secrets present; `createApiConfigSource` defers the credential read to the first request so the server starts unauthenticated. Both fail with an actionable message; `describeCredentials` reports the secret's *length* so diagnostics have something safe to print. |
| `market-hosts.ts` | The only file allowed to contain an API host literal, enforced by `no-hardcoded-host.test.ts`. Validates the base URL, warns rather than throws on an unknown host. |

Named `api-config.ts` rather than `credentials.ts` because local tooling blocks the latter
filename.

## `src/http/` — the shared request path

| File | Responsibility |
| --- | --- |
| `request-json.ts` | Signs, sends, parses conditionally, retries. Owns the `/nic/update` transport exception. |
| `build-path-with-query.ts` | The single place a request-target is assembled. Custom serialiser, because `URLSearchParams` would break `deepObject` brackets and key order. |
| `map-error.ts` | Non-2xx into a typed error. Handles `{code, message}`, the v2 `InvalidData` shape, and an empty body — none can be assumed. Never touches the Authorization header. |
| `retry.ts` | Exponential backoff with full jitter, honours `Retry-After`. Retries 429/5xx on GET/PUT/DELETE only — **never POST**, since a blind retry could double-create. |
| `pagination.ts` | The v2 paging envelope. v1's differs and lives in `tools/v1/common.ts`. |

## `src/policy/risk-tiers.ts`

Resolves the two independent environment opt-ins and filters the registry *before* registration.
Small, and the reason a read-only deployment exposes a smaller tool list rather than a
same-sized one that refuses.

## `src/tools/` — the 50 tools

| File | Responsibility |
| --- | --- |
| `types.ts` | `ToolDef`, `Ctx`, `RequestSpec` — the SDK-agnostic contract everything below the adapter speaks. |
| `registry.ts` | The ordered list. Registration order is also `tools/list` order and `docs/tools.md` order. |
| `confirm.ts` | One shared `confirm: z.literal(true)` fragment and its wording, so the gate reads identically everywhere. |

### `v2/` — 13 tools, spec-derived

| File | Responsibility |
| --- | --- |
| `openapi-spec.ts` | Imports the vendored spec so the bundler inlines it, and derives the record-type enums and ten filter keys from it rather than retyping them. |
| `dns-record-schema.ts` | Record schemas, including conditional rules that are *ours* rather than the spec's — `CreateRecordRequest` declares no required fields at all. |
| `dns-tools.ts` | Auth check, zone, and record CRUD. Creates re-list to recover the id a `204` withholds. |
| `ftp-tools.ts` | FTP account CRUD. `password` is write-only, asserted against the response schema. |
| `domain-and-dyndns-tools.ts` | Domain assignment, and the best-effort DynDNS tool. |

### `v1/` — 37 tools, hand-written

v1 publishes no machine-readable spec, so these are written from documentation and verified by
probing routes live.

| File | Tools |
| --- | --- |
| `common.ts` | `userId` defaulting to `self`, path builders, the v1 paging envelope, and the `kind`-enum helper. Documents which endpoints actually honour `pagesize`. |
| `account-tools.ts` | User, services, zones (5) |
| `hosting-tools.ts` | Hosting, vhosts, hosting stats (5) |
| `database-tools.ts` | Databases, db users, db stats (4) |
| `mailbox-tools.ts` | Mailboxes and mail stats (3) |
| `vps-tools.ts` | VPS, stats, VNC (4) |
| `invoice-tools.ts` | Invoices and PDF retrieval (3) |
| `database-write-tools.ts` | Database create/update/delete (3) |
| `mailbox-write-tools.ts` | Mailbox writes — domain-rooted, and update is `POST` (3) |
| `vps-write-tools.ts` | Reboots and the snapshot lifecycle (6) |
| `service-write-tools.ts` | Auto-renewal toggle (1) |
| `write-body.ts` | The one documented exception to the strict-schema rule, for bodies whose field sets are genuinely unpublished. |

## Entry points

| File | Responsibility |
| --- | --- |
| `src/server.ts` | The only file importing the MCP SDK. Registers allowed tools, renders results, converts errors into typed tool results. |
| `src/index.ts` | The bin. Builds the config source (credentials deliberately unread), resolves the tier policy, connects stdio, and exits non-zero with a stderr message on failure. |

## `scripts/`

| File | Responsibility |
| --- | --- |
| `generate-tools-doc.ts` | Emits `docs/tools.md`. Derives method and path by running each handler against a recording transport with placeholders named after its own arguments. |
| `sync-server-json-version.ts` | Copies the package version into `server.json` during release, since `changeset version` does not know about it. |
| `smoke-stdio-handshake.ts` | Drives `initialize` + `tools/list` + one `tools/call` against any command with `WEBSUPPORT_*` stripped from the environment. CI runs it against both the bundle and the container image. |

Both run under `vite-node`: Node's type stripping cannot resolve the `.js` specifiers NodeNext
requires.

## Tests worth knowing about

Most tests cover their neighbouring module. These instead enforce properties across the whole
codebase, and are the ones to understand before changing structure:

| File | Invariant |
| --- | --- |
| `registry.test.ts` | Every destructive tool declares `confirm` and no other does; the tier split; and a source-tree grep proving no `/order` or `/pay` path exists. |
| `verification-matrix.test.ts` | `docs/verification-matrix.md` categorises every tool exactly once and its summary counts match its own lists. |
| `server-manifest.test.ts` | `server.json`, `package.json` and `mcpName` agree on name and version. |
| `no-hardcoded-host.test.ts` | No API host literal outside `market-hosts.ts`. |
| `spec-drift.network.test.ts` | The vendored OpenAPI document still matches all four market hosts. |
| `server-manifest.network.test.ts` | `server.json` validates against the *live* registry schema, not a vendored copy. |
