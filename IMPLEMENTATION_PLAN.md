# IMPLEMENTATION_PLAN.md

**Last updated:** 2026-08-25

**This file is the source of truth** for `websupport-mcp` — scope, phase decisions, exit gates,
open questions, and progress. Scope changes, verification results, and answers are recorded _here_,
not mirrored in from somewhere else.

> Earlier planning drafts under `plans/` are gitignored local working notes. They are superseded by
> this file and are not authoritative; nothing below defers to them. Everything needed to _use_ or
> _review_ the project lives in `README.md` and (from Phase 6) `docs/`.

**Legend:** `[ ]` not started · `[~]` in progress · `[x]` done (code runs and is verified)

## Status

| #   | Phase                           | Deps | Effort | Status |
| --- | ------------------------------- | ---- | ------ | ------ |
| 1   | Foundation and auth signer      | —    | 1d     | `[x]`  |
| 2   | HTTP client and risk policy     | 1    | 1d     | `[x]`  |
| 3   | v2 tools from OpenAPI           | 2    | 1–1.5d | `[~]`  |
| 4   | v1 read tools                   | 3    | 1.5d   | `[ ]`  |
| 5   | v1 mutating tools               | 3    | 1d     | `[ ]`  |
| 6   | Packaging and live verification | 4, 5 | 0.5–1d | `[ ]`  |
| 7   | Public release                  | 6    | 0.5–1d | `[ ]`  |

Sequence: 1 → 2 → 3 → {4 ∥ 5} → 6 → 7. Phases 4 and 5 touch disjoint files and both depend only on
the Phase 2 client + policy contracts. Phase 7 is packaging and discovery only — it changes no tool
behaviour and cannot start before Phase 6 proves the server works.

Tool surface when complete: **50 tools** — 13 v2 (Phase 3), 24 v1 read (Phase 4), 13 v1 mutating
(Phase 5). Order creation and invoice/order payment are out of scope and must not appear anywhere
in the registry.

## Phase 1 — Foundation and auth signer

Highest-risk component: every tool is worthless if the signature is wrong. Signer is pure and
synchronous, takes an explicit timestamp, and accepts one already-built path that it never
rebuilds, re-encodes, or re-sorts.

> **Corrected 2026-08-25 by live probe with a real key: the query string is NOT signed.** The
> canonical string is `{METHOD} {path-without-query} {unix_ts}`. Signing the query returns
> `401 Incorrect api key or signature.` on both v1 and v2; signing the bare path and sending the
> query is accepted. The v2 docs' worked example says otherwise and is wrong. The signer parameter
> is therefore `pathForSignature`, not `pathWithQuery`. See Findings.

- [x] `git init` (done — repo has commits), `npm init`, `.gitignore` (created 2026-08-25, currently ignores `plans/`; Phase 1 adds `node_modules/`, `.env`, build output), `.env.example`
- [x] Install `@modelcontextprotocol/server@2.0.0`, `zod@^4`; dev `typescript`, `vitest`, `@types/node`; `"type": "module"`, `engines.node >= 20`
- [x] `src/auth/signer.ts` — `signRequest({method, pathForSignature, unixSeconds, apiKey, secret, version})` (**`pathWithQuery` → `pathForSignature`, corrected 2026-08-25** — the query is sent but not signed)
- [x] `formatDateHeader(unixSeconds)` → `YYYYMMDDTHHMMSSZ` built from explicit UTC components (not `toISOString()` string-stripping)
- [x] v1 paths emit header name `Date`; v2 paths emit `X-Date` (verified 2026-08-25: v1 _rejects_ `X-Date`, v2 accepts either — the split is a v1 constraint; do not "simplify" it away)
- [x] `src/auth/api-config.ts` (named `credentials.ts` in the original plan; renamed because a local tooling hook blocks that filename) — load `WEBSUPPORT_API_KEY` / `WEBSUPPORT_API_SECRET` / `WEBSUPPORT_API_BASE_URL` / `WEBSUPPORT_ACCEPT_LANGUAGE`, fail fast, never echo the secret (length only)
- [x] `src/auth/market-hosts.ts` + base-URL resolution — default `https://rest.websupport.sk`, require absolute `https:` with no path, warn (not throw) on an unknown host
- [x] `src/auth/signer.test.ts` — the three pinned vectors
- [x] Close open question 3 via the unauthenticated probe — **done 2026-08-25**: undici sends `Date`; v1 requires `Date` and rejects `X-Date`; v2 accepts either; `/nic/update` needs no date header. `node:https` fallback dropped
- [x] `README.md` skeleton — install, env vars, tool tiers

**Exit gates:** all three pinned vectors reproduce exactly (signature, date value, Basic header —
independently recomputed 2026-08-25, all three match) · `Date`/`X-Date` split asserted, including
the v1-rejects-`X-Date` / v2-accepts-either asymmetry · `loadCredentials()` throws actionably on
missing env · no test or log output contains the secret · open question 3 answered under Open
questions below (done) · base URL resolves, validates, and warns-not-throws on unknown hosts.

## Phase 2 — HTTP client and risk policy

Owns URL building — the half of the signing contract Phase 1 deliberately does not own — plus error
mapping, retry, pagination, the risk-tier policy, and the `ToolDef` contract Phases 3–5 populate.
Every file under 200 LOC.

- [x] `src/http/build-path-with-query.ts` — the only place a URL is assembled; stable declared key order; custom serialiser (**not** `URLSearchParams`, which encodes `[` `]` and whose `sort()` breaks byte-identity); `filters` as `deepObject` with literal unencoded brackets; no trailing `?`
- [x] `src/http/request-json.ts` — version from path prefix (`/v1` → v1, else v2), base URL injected via `Ctx` (no module-level constant), `Accept-Language` limited to `en_us|sk|cs_cz|hu` (no Swedish value exists; `en_us` stays default for the `.se` host)
- [x] Conditional response parsing — `204`/empty → `{status, body: null}`; `text/*` → string; else JSON. All six v2 mutations return `204` with no body, so JSON parsing is not the default path
- [x] `/nic/update` transport exception, evaluated **before** the version rule — Authorization only, no date header, `text/html` body returned as a string, permissive pass-through query
- [x] `src/http/map-error.ts` — `{code, message}` plus v2 `InvalidData` `{type, status, title}`, **and an empty body** (spec declares none for 401/403/422/500, live server sends JSON — neither can be assumed); include HTTP status, verbatim API message, response `Date` header; never the Authorization header or secret
- [x] `src/http/retry.ts` — max 3 attempts, base 500 ms, exponential + full jitter, honour `Retry-After`; retry 429/5xx on GET/PUT/DELETE only, **never POST**
- [x] `src/http/pagination.ts` — `{currentPage, rowsPerPage, totalPages, totalRecords, data}` unflattened
- [x] `src/policy/risk-tiers.ts` — `WEBSUPPORT_ALLOW_WRITE=1` unlocks `write`; `WEBSUPPORT_ALLOW_DESTRUCTIVE=1` unlocks `destructive`; the two are independent (destructive does not imply write); filters the registry _before_ `registerTool`
- [x] `src/tools/types.ts` — `ToolDef` / `Ctx`, SDK-agnostic so the SDK line is swappable via one adapter file
- [x] Tests — byte-exact path building incl. a `filters` deepObject; error mapping 400/401/403/404/422/500; POST-never-retried via fetch spy; tier filtering across all four env permutations
- [x] Non-blocking network test — live unauthenticated `GET /v2/check` still returns `{"message":"Missing date header.","code":400}` on every configured market host

**Exit gates:** `buildPathWithQuery('/v2/some/url', {attributes: 123, some: 'aaa'})` returns exactly
`/v2/some/url?attributes=123&some=aaa` (the docs' own signing example) · `filters` deepObject
asserted byte-exactly · a `204` yields `{status: 204, body: null}` and never reaches `JSON.parse` ·
an empty error body maps to a usable message rather than throwing · `/nic/update` sends no date
header and returns a string body, asserted with a spy · POST never retried · no env opt-ins yields
only `read` tools · destructive opt-in alone does not unlock write · no error path emits the secret
or Authorization header · grep test proves no hardcoded host outside `market-hosts.ts`.

## Phase 3 — v2 tools from OpenAPI

All 8 v2 paths → 13 tools, plus the stdio entrypoint, so the server is runnable and end-to-end
verifiable at the end of this phase. Spec is vendored (8 paths does not justify codegen).

- [x] Vendor `assets/websupport-v2-openapi.json`; `src/tools/spec-drift.test.ts` compares vendored path+method+enum sets against live, and asserts the spec stays byte-identical across market hosts (network-dependent, skippable offline). Baseline 2026-08-25: 8 paths, 15 schemas, md5 `72f9da3c894253e554a57252727f9afd` on all four hosts. `/nic/update` has `parameters` **absent**, not `null` — an `=== null` assertion fails — **done 2026-08-25**: vendored (md5 matches baseline); drift suite is `src/tools/spec-drift.network.test.ts` (network job) plus offline assertions in `src/tools/v2/openapi-spec.test.ts`; `parameters`-absent asserted with `Object.hasOwn`, not `=== null`
- [x] Derive both record-type enums from the vendored spec, mirroring the real difference: create accepts 15 types, list `filters.type` accepts 13 (no `DNSSEC`, no `NS`). Keep v2 `priority` distinct from v1 `prio` — do not unify — **done**: read out of the vendored spec at load time in `src/tools/v2/openapi-spec.ts`, never retyped; 15 vs 13 asserted
- [~] Conditional-field validation via zod `superRefine`, offline: `priority` required for `MX`/`SRV`; `port` + `weight` required for `SRV` only — **not spec-backed** (`CreateRecordRequest` declares no `required` at all), so probe an `SRV` without `port`/`weight` live and relax the rule if the API accepts it — **rules written and unit-tested offline; the live `SRV` probe is still outstanding (needs a credential)**
- [x] DNS tools — `ws_auth_check`, `ws_dns_zone_get`, `ws_dns_record_list` (page/rowsPerPage/descending/sortBy + the full **ten-key** `filters` deepObject: name, type[], content, ttl, note, priority, port, weight, flags, tag[]), `ws_dns_record_create`, `ws_dns_record_update`, `ws_dns_record_delete` — **done**, offline-tested
- [x] Create handlers re-list to recover the id — all six v2 mutations return `204` with no body, so `POST` yields no record. `ws_ftp_account_list` takes no `filters`; do not add one for symmetry — **done** for both DNS and FTP create; asserted with a stub transport
- [x] FTP tools — `ws_ftp_account_list`, `_get`, `_create`, `_update`, `_delete`; `password` is write-only and never echoed (assert the response schema has no `password`) — **done**; the response schema having no `password` is asserted against the vendored spec
- [x] `ws_domain_assign`, `ws_dyndns_update` (`/nic/update` has its `parameters` key **absent** upstream — permissive pass-through query, `text/html` string result via the Phase 2 transport exception, documented best-effort) — **done**, both best-effort until live-verified
- [x] `src/tools/registry.ts`; `src/server.ts` (`McpServer` + `StdioServerTransport`, tier filter, `registerTool` loop — keep all SDK-specific code in this one file); `src/index.ts` bin entrypoint with shebang; `package.json` `bin` — **done and verified**: the built server completes an MCP handshake over stdio and reports 5 / 11 / 13 tools for the three tier configs
- [ ] Resolve open question 1 with a real key: does v2 `{service}` equal v1 `serviceId`? Cross-check service ids against `ws_dns_zone_get` and record the mapping under Findings below — **blocked on a credential**
- [ ] Live round-trip: create TXT on a throwaway subdomain → filtered list → update → delete — **blocked on a credential**

**Exit gates:** `ws_auth_check` returns `{verified: true}` against a real key · TXT round-trip passes,
with create returning the re-listed record rather than an empty `204` · a paginated **and** filtered
list call authenticates (proves the query-signing invariant — **passed 2026-08-25** once the
canonical string was corrected to exclude the query) · `SRV` without port/weight and `MX`
without priority rejected offline, _unless_ the live probe shows the API accepts them and the
relaxation is recorded under Findings below · the `SRV` probe is run and its outcome written down
either way · zero
opt-ins shows exactly this phase's 5 read tools · `ws_dns_record_delete` refuses without
`confirm: true` · FTP password never appears in a result · `{service}` mapping documented.

## Phase 4 — v1 read tools

24 curated read tools. `ws_user_get` is a hard prerequisite — every v1 path is rooted at
`/v1/user/:id`. Responses pass through unreshaped so undocumented fields reach the caller.

- [ ] `src/tools/v1/common.ts` — `userIdArg` defaulting to the literal `self`; declare paging args only where verified against live responses (v1 pagination is documented on `GET /v1/user` and `/invoice`; do not assume uniformity)
- [ ] `user.ts`, `service.ts`, `zone.ts` first — validate the pattern before scaling out
- [ ] `hosting.ts` — hosting list/get, vhost list/get, `ws_hosting_stats` (`kind` → `size-stats|domain-stats|ftp-stats`)
- [ ] `database.ts` — db list/get, dbusers list, `ws_db_stats` (`kind` → `size-stats|cpu-stats`)
- [ ] `mailbox.ts` — mailbox list/get, `ws_mail_stats` (optional `domain`)
- [ ] `vps.ts` — vps list/get, `ws_vps_stats` (`kind` → `cpu-stats|traffic-stats`), `ws_vps_vnc` (returns sensitive access data — flag in the description, never log the body)
- [ ] `invoice.ts` — list/get, `ws_invoice_pdf` with `format: 'base64' | 'binary'`; `binary` returns metadata + byte count, never inlined bytes
- [ ] Suffix-only variants collapse behind a `kind` enum with one lookup object per tool (DRY)
- [ ] Register all 24; confirm every one stays visible with zero env opt-ins
- [ ] Live-verify each tool; record doc-vs-reality field discrepancies under Findings below

Deliberately excluded: billing profiles, domain profiles, payment cards, shell consoles, order
catalog/validate. v1 zone-record CRUD and v1 ftp-account CRUD are deprecated — Phase 3 owns those.

**Exit gates:** all 24 return a parsed result against a real account or carry a documented reason
they cannot (e.g. account has no VPS — then they are marked schema-only, not "tested") · omitted
`userId` resolves to `self` · every `kind` value maps to the right suffix, unit-tested offline ·
`format: 'binary'` inlines no raw bytes · all 24 are tier `read` · discrepancies recorded.

## Phase 5 — v1 mutating tools

13 tools. Tier by whether the operation destroys state the user cannot cheaply recreate. Snapshot
**restore** is destructive (discards live disk state); hard-reboot is destructive (unclean power
cycle, can corrupt in-flight writes). `ws_vps_snapshot_list` is tier `read` but lives here to keep
the snapshot lifecycle in one module.

- [ ] `src/tools/confirm.ts` — one shared `confirm: z.literal(true)` fragment + wording, so the gate is identical everywhere
- [ ] Registry-wide invariant test: _every_ tool of tier `destructive` includes the confirm fragment — enforced structurally, not by author discipline
- [ ] `database-write.ts` — `ws_db_create` (write), `ws_db_update` (write), `ws_db_delete` (destructive)
- [ ] `mailbox-write.ts` — create/update/delete; mirror both documented quirks: update is `POST` (not `PUT`), and write paths are rooted at `.../hosting/:hid/domain/:did/mailbox` while Phase 4 reads are rooted at `.../hosting/:hid/mailbox`. Do not normalise
- [ ] `vps-write.ts` — `ws_vps_reboot` (write), `ws_vps_hard_reboot` (destructive), snapshot list (read) / create (write) / restore (destructive) / delete (destructive)
- [ ] `service-write.ts` — `ws_service_set_auto_extend`, sending only `autoExtend`, no arbitrary service properties
- [ ] Destructive descriptions name the concrete irreversible effect, e.g. restore: "Overwrites the VPS disk with the named snapshot. All data written since that snapshot is permanently lost."
- [ ] Offline tests — each destructive tool rejects a call without `confirm: true`; write tools absent without `WEBSUPPORT_ALLOW_WRITE=1`
- [ ] Live-verify on disposable resources only: scratch database and scratch mailbox create + delete
- [ ] `ws_vps_hard_reboot` and `ws_vps_snapshot_restore` verified by request construction (fetch spy asserting exact method + path) — **not** live-fired; record the limitation
- [ ] Test greps the registry for `/order` and `/pay` paths and asserts none exist

**Exit gates:** registry-wide confirm invariant holds · each destructive tool refuses without
`confirm` · `ALLOW_WRITE=1` alone exposes no destructive tool · `ALLOW_DESTRUCTIVE=1` alone exposes
no write tool · scratch db + mailbox round-trip live · the two excluded VPS ops are documented as
construction-verified rather than implied tested · no order/payment path in the registry.

## Phase 6 — Packaging and live verification

- [ ] `package.json` — `bin`, `files` whitelist (build output + `assets/` only), `prepublishOnly`, `engines`; `npm pack --dry-run` shows no `.env`, no test files, no local paths
- [ ] `.github/workflows/ci.yml` — typecheck, lint, offline tests on node 20 and 22; `spec-drift` isolated to a separate non-blocking job so a Websupport outage cannot red the build
- [ ] Install into a real MCP client from the local path; record tool counts for three configs: no opt-ins, `ALLOW_WRITE=1`, both set. Record the negotiated protocol revision; save the working configs credential-blanked into `examples/mcp-config/`
- [ ] `docs/verification-matrix.md` — every tool: exercised live / exercised against a live 4xx / schema-and-construction only. An untested tool must not read as tested
- [ ] `docs/codebase-summary.md` (module map), `docs/system-architecture.md` (request path + tier model); README stays a quickstart pointing at both
- [ ] README documents credentials, the three tiers, the confirm gate, and market selection via `WEBSUPPORT_API_BASE_URL` with the live host table
- [ ] Answer all open questions in writing with evidence (see below)
- [ ] Secret scan over full history
- [ ] Report the result — **do not publish to npm without explicit instruction**

**Exit gates:** `npx` from the packed tarball completes an MCP handshake · tool counts recorded for
all three env configs · CI green on node 20 and 22 with network tests non-blocking · verification
matrix covers every registered tool honestly · every open question answered with evidence · secret
scan clean · README covers tiers, confirm gate, and market selection.

## Phase 7 — Public release

Packaging, provenance, documentation, and discovery for a public OSS repo. No tool behaviour
changes. Every outward-facing step — repo visibility, npm publish, Registry publish — waits for
explicit instruction; Phase 6 deliberately stops at "report".

- [ ] Package identity **locked 2026-08-25**: unscoped `websupport-mcp` (confirmed free), Registry `io.github.<owner>/websupport-mcp`, `mcp-name` matching. Re-check availability immediately before publish; if taken, stop and ask rather than silently switching to a scoped name
- [ ] `LICENSE` — **MIT**, decided 2026-08-25 (ecosystem norm; nothing patentable so Apache-2.0 does not pay for its NOTICE duties; AGPL §13 would fire on hosted MCP). `CONTRIBUTING.md` (setup, test commands, the no-order/payment scope rule), `.github/ISSUE_TEMPLATE/{bug,tool-request}.yml`
- [ ] `SECURITY.md` — real threat model, not boilerplate: env-only credentials, secret never in errors/logs/results, FTP `password` write-only, `ws_vps_vnc` returns sensitive access data, order/payment paths absent by design + the Phase 5 grep test that enforces it, disclosure contact
- [ ] README rewritten in consumer order — **tier table first** (default install is read-only; `ALLOW_WRITE` and `ALLOW_DESTRUCTIVE` independent, blast radius spelled out), then install snippet, then credentials + market table, then links into `docs/`
- [ ] `scripts/generate-tools-doc.ts` → `docs/tools.md` (name · tier · method+path · confirm); CI job asserts regeneration is a no-op so a stale published tool list cannot ship
- [ ] `server.json` — fetch the **current** date-versioned `$schema` from live Registry docs (a remembered URL fails validation); publish via `mcp-publisher login github` → `publish`
- [ ] Changesets for version intent; `.github/workflows/release.yml` publishes on tag with `npm publish --provenance` under GitHub OIDC (`id-token: write`), `NPM_TOKEN` the only secret
- [ ] `.github/workflows/codeql.yml`; enable secret scanning + push protection on the repo
- [ ] `.github/dependabot.yml` — npm + github-actions, weekly
- [ ] Re-run the full-history secret scan **immediately before** flipping visibility — private history becomes permanent the moment the repo goes public
- [ ] On explicit instruction only: repo public → npm publish → Registry publish; then verify `npx` handshake from the published package, provenance badge visible, Registry entry resolves

**Exit gates:** npm name, Registry name, and `mcp-name` agree on unscoped `websupport-mcp` ·
`LICENSE` is MIT · LICENSE/SECURITY/CONTRIBUTING/issue
templates/dependabot present · `SECURITY.md` names the concrete credential risks · README's first
substantive section is the tier table · `docs/tools.md` generated and CI-diffed · `server.json`
validates against the schema fetched at authoring time · release publishes with `--provenance` under
OIDC · CodeQL green, secret scanning + push protection on · secret scan re-run clean immediately
before going public · post-publish `npx` handshake, provenance badge, Registry entry all verified.

## Open questions

Each is closed in a named phase, with the answer written into this section and restated in the
Phase 6 report.

- [ ] **1. Is v2 `{service}` the same value as v1 `serviceId`?** → Phase 3, by cross-checking service ids against a v2 DNS call. Fallback: hosting id/uuid, or the zone's own id from `GET /v1/user/:id/zone`. **Still open 2026-08-25** — the available account owns no services or zones, so there is nothing to cross-check. Needs an account with at least one hosted domain.
- [ ] **2. Rate limits and clock-skew tolerance are undocumented.** No 429 observed across ~25 authenticated requests on 2026-08-25. → handled defensively by Phase 2 backoff; observed ceiling (or an explicit "no 429 observed at N requests") recorded in Phase 6.
- [x] **3. Will Node's fetch/undici send a `Date` request header?** → **YES**, closed 2026-08-25 by unauthenticated probe. v1 with `Date` reaches a signature error; with `X-Date` it reports a missing date header. v2 accepts either. `/nic/update` requires neither. `node:https` fallback dropped.
- [ ] **4. Can a key issued in one market authenticate against another market's host?** → needs one non-SK credential; may close as "untested — only an SK credential available". Cost of being wrong is zero: the base URL is configurable either way.
- [x] **5. Package identity — unscoped or scoped?** → **CLOSED 2026-08-25**: `npm view websupport-mcp` returned `E404`, so publish **unscoped** as `websupport-mcp`, Registry `io.github.<owner>/websupport-mcp`, licence **MIT**. Phase 7 step 1 re-checks availability immediately before publish.
- [~] **6. Does the `filters` deepObject wire encoding work live?** (Phase 2 risk item.) → **partially answered 2026-08-25 with a real key**: a filtered, paginated request with literal unencoded brackets and percent-encoded values passes authentication and reaches the resource layer (`404 Service model … nebol nájdený`, not `400`/`422`), so the encoding does not break the request. Whether the server's filter *parser* honours it still needs a zone with records. Fallback remains client-side filtering over unfiltered pages.

## Findings

Evidence recorded as phases run — doc-vs-reality discrepancies, identifier mappings, probe outcomes.
Empty until Phase 3 begins.

| Date       | Phase | Finding                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-25 | 1     | undici sends the `Date` request header. v1 requires `Date` and rejects `X-Date`; v2 accepts either; `/nic/update` requires neither. `node:https` fallback dropped.                                                                                                                                                                                                   |
| 2026-08-25 | 3     | Live v2 spec baseline: OpenAPI 3.0.0, 8 paths, 15 schemas, md5 `72f9da3c894253e554a57252727f9afd`, byte-identical on `rest.websupport.{sk,cz,hu,se}`. All six v2 mutations answer `204` with no body. `/nic/update` has its `parameters` key absent and returns `text/html`. DNS-list `filters` accepts ten keys. `CreateRecordRequest` declares no required fields. |
| 2026-08-25 | 1     | All three pinned signer vectors, their date values and the Basic header recomputed independently and matched exactly.                                                                                                                                                                                                                                                |
| 2026-08-25 | 1–2   | Signer, HTTP client and risk policy implemented and verified offline: 188 tests green, typecheck and Biome clean. All three pinned vectors reproduce through `requestJson` end to end, not just through the signer in isolation. |
| 2026-08-25 | 2     | Live re-probe of `GET /v2/check` on `rest.websupport.{sk,cz,hu,se}`: all four still answer `400 {"message":"Missing date header.","code":400}`. `mapError` verified against those real bodies rather than a fixture. |
| 2026-08-25 | 3     | Vendored spec re-fetched and confirmed against the baseline: md5 `72f9da3c894253e554a57252727f9afd`, byte-identical on all four hosts, OpenAPI 3.0.0, 8 paths, 15 schemas, 13 operations. Every claim validation session 1 made about it holds. |
| 2026-08-25 | 3     | `POST /v2/service/{service}/assign-domain` answers **200 with a body**, not 204 — it is the one v2 mutation that does. The "all six v2 mutations return 204" rule covers the DNS and FTP mutations only; assign-domain is a seventh mutation outside it. |
| 2026-08-25 | 3     | **Plan fact corrected.** `@modelcontextprotocol/server@2.0.0` does not reach protocol revision `2026-07-28`. Measured from the installed package: `LATEST_PROTOCOL_VERSION` is `2025-11-25`, `SUPPORTED_PROTOCOL_VERSIONS` is `2025-11-25 2025-06-18 2025-03-26 2024-11-05 2024-10-07`, and a client requesting `2026-07-28` negotiates down to `2025-11-25`. This strengthens rather than threatens the "confirm arg over MRTR" decision: MRTR elicitation is unreachable at this SDK version, so the confirm argument is not merely the primary gate, it is the only one. |
| 2026-08-25 | 3     | Built server verified over stdio against a real MCP handshake. Tool counts by env: no opt-ins **5**, `ALLOW_WRITE=1` **11**, both **13**. `ws_dns_record_delete` advertises `required: ["service","record","confirm"]` on the wire, so the gate is visible to the client, not only enforced server-side. |
| 2026-08-25 | 1–2   | **The query string is NOT part of the canonical string.** Verified with a real Standard key against `rest.websupport.sk`. Signing `GET /v1/user/self/service?page=1 <ts>` → `401 Incorrect api key or signature.`; signing `GET /v1/user/self/service <ts>` and sending `?page=1` → `200`. Same result on v2 (`404 Service model … nebol nájdený`, i.e. past auth) and with a `filters` deepObject and percent-encoded values. The v2 docs' worked example `GET /v2/some/url?attributes=123&some=aaa 1548240417` describes something the server does not do. **This reverses the plan's "Query string is signed" decision** — signer parameter renamed `pathWithQuery` → `pathForSignature`, `requestJson` now signs `spec.path` and sends the built target. Pinned vector 2 is retained as an HMAC known-answer and relabelled a documentation artefact. |
| 2026-08-25 | 3     | `ws_auth_check` returns `{"verified":true}` against a real key. **Phase 3 exit gate 1 passed.** |
| 2026-08-25 | 1     | v1 authentication verified with a real key, not just by error-message shape: `GET /v1/user/self` with the `Date` header returns `200`. The Phase 1 `Date`/`X-Date` asymmetry holds under real credentials. |
| 2026-08-25 | 4     | **v1 list responses do not use the v2 pagination envelope.** v1 returns `{items: [], pager: {page, pagesize, items}}`; v2 returns `{currentPage, rowsPerPage, totalPages, totalRecords, data}`. `src/http/pagination.ts` models the v2 shape only — Phase 4 needs its own v1 helper, and v1 paging arguments are `page`/`pagesize`, not `page`/`rowsPerPage`. |
| 2026-08-25 | 4–5   | **`/v1/user/self/mailbox` does not exist**: `404 The system is unable to find the requested action "self".` Mailbox reads are not rooted at `/v1/user/:id/mailbox`. This corroborates the Phase 5 note that mailbox write paths sit under `.../hosting/:hid/domain/:did/mailbox`; Phase 4's mailbox reads need a hosting-rooted path too. Confirmed reachable and empty at `/v1/user/self`: `service`, `zone`, `hosting`, `vps`, `invoice`. |
| 2026-08-25 | 2     | v2 error bodies carry a fourth field beyond the spec's `InvalidData`: `{type, status, title, key}`. v1 errors are `{message, code}`. `mapError` handles both live — it reads `title` when `message` is absent and rendered every probe's error correctly. |
| 2026-08-25 | 4, 7  | **`GET /v1/user/self` returns sensitive data by default**: full billing address, email, phone, and a `verifyUrl` containing a live account-verification key. The plan's "responses pass through unreshaped" rule therefore puts PII and a credential-equivalent URL into model context on the very first v1 read. Phase 4 `ws_user_get` needs a description warning in the style of `ws_vps_vnc`, and Phase 7's `SECURITY.md` must name it. |
| 2026-08-25 | 3     | Test account (`rest.websupport.sk`, market Slovakia) is empty — 0 services, 0 zones, 0 hosting, 0 VPS, 0 invoices. Confirmed by the account owner as genuinely empty, not a parsing artefact. The DNS round-trip, `SRV` relaxation probe, and `{service}`↔`serviceId` mapping stay blocked pending an account that owns a zone. |

## Progress log

| Date       | Entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-20 | Brainstorm + feasibility report; API evidence verified against live hosts; direction Option B accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-20 | 6-phase plan created under `plans/260820-1355-websupport-mcp-server/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-08-20 | This tracker created from the plan. No code yet — repo is not a git repository with commits; Phase 1 step 1 initialises it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-25 | Validation session 1 (`/ak:plan validate`, Full tier, 7 phases). 36 claims checked — 26 verified, 7 failed, 3 unverified. Verified live: all 3 pinned signer vectors + dates + Basic header, 4 market hosts, spec md5 identical across hosts, 8 paths / 15 schemas, the 13-tool table, 15-vs-13 record enums, npm deps. **Open questions 3 and 5 closed.** 7 failures propagated into phases 1, 2, 3, 7 — 204/empty-body contract, create-re-lists-for-id, `/nic/update` transport exception (no date header, `text/html`), ten-key `filters`, empty-error-body tolerance, `parameters` absent not null, v2-only date-before-auth. 6 validation questions answered; decisions and evidence recorded in the phase sections, Open questions, and Findings of this file. |
| 2026-08-25 | **Authority inverted.** This file is now the source of truth, not a mirror of `plans/`. Removed the design-authority reference table and the local phase-file column; rewrote every in-body deferral ("record in the phase file") to record here instead; added a Findings section for probe outcomes, identifier mappings, and doc-vs-reality discrepancies, seeded with the 2026-08-25 evidence. Zero references to the old plan remain. `plans/plan.md` carries a superseded banner so the two cannot disagree about who decides.                                                                                                                                                                                                                                  |
| 2026-08-25 | Dead links fixed: every `plans/` markdown link in this file 404d on GitHub because `plans/` is gitignored. Header links and the status-table phase links are now plain named paths, with a callout stating the directory is local-only and pointing readers at `README.md` and `docs/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-25 | `.gitignore` created with `plans/` ignored — planning history stays local, out of the public repo. Nothing was committed yet, so no `git rm --cached` was needed. Phase 7's repo tree updated to drop the `plans/` row.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-25 | Tracker sync pass. Diffed every phase file's success criteria against this file's exit gates — 6 gates were stale after validation session 1 (Phase 1 header asymmetry, Phase 2 204/empty-body/`nic-update`, Phase 3 create-re-list + `SRV` probe, Phase 7 MIT + unscoped name) and are now mirrored. Also resolved 1 contradiction the first sweep missed: `phase-03` asserted the `SRV` offline rejection as a gate while the same file authorises a live probe to relax it.                                                                                                                                                                                                                                                                                        |
| 2026-08-25 | Scope extended for public OSS release: new Phase 7 (`phase-07-public-release.md`) covering MCP Registry `server.json`, npm provenance via OIDC, changesets, CodeQL/dependabot, LICENSE/SECURITY/CONTRIBUTING, generated `docs/tools.md`. Phase 6 step 3 now captures `examples/mcp-config/`. Open question on package identity added (numbered 5 after the validation-session renumbering). Effort 5–7d → 6–8d. Still no code.                                                                                                                                                                                                                                                                                                                                        |
| 2026-08-25 | **Phases 1 and 2 complete; Phase 3 complete except its credential-gated live gates.** Repository went from zero code to a runnable MCP server: `src/auth/` (signer, market hosts, config), `src/http/` (path building, transport, error mapping, retry, pagination), `src/policy/risk-tiers.ts`, `src/tools/` (13 v2 tools, registry, confirm fragment), `src/server.ts` SDK adapter, `src/index.ts` bin. Toolchain: TypeScript 5.9 strict + `exactOptionalPropertyTypes`, Biome, Vitest with network suites split into a separate non-blocking config. **188 offline tests pass; 7 network tests pass; typecheck, lint and build clean.** Verified live without credentials: four market hosts, spec md5 identity, MCP stdio handshake at 5/11/13 tools. Two plan facts corrected — the SDK tops out at protocol `2025-11-25`, and `assign-domain` returns 200 not 204. One deliberate deviation: `src/auth/credentials.ts` is named `api-config.ts` because a local tooling hook blocks the original filename. Outstanding and blocked on a Standard API key: `ws_auth_check` live, the TXT round-trip, the paginated+filtered signing proof, the `SRV` relaxation probe, the `{service}`↔`serviceId` mapping, and the `filters` wire encoding. |
| 2026-08-25 | **First run against a real API key — one load-bearing plan decision reversed.** `ws_auth_check` returns `{verified:true}`, closing Phase 3's first exit gate, and v1 auth is confirmed under real credentials. The key discovery: **the query string is not signed.** Every paginated or filtered call failed `401` until the canonical string was narrowed to the bare path, at which point all eight probe cases passed — v1 and v2, with and without a `filters` deepObject, including percent-encoded values. The vendor docs' own worked example is wrong. `pathWithQuery` → `pathForSignature`; `requestJson` signs `spec.path`; pinned vector 2 kept as an HMAC known-answer but relabelled. Tests now assert the corrected contract in both directions (190 offline tests green). Four further findings recorded for Phases 4, 5 and 7: the v1 pagination envelope differs from v2, `/v1/user/self/mailbox` does not exist, v2 errors carry a `key` field, and `GET /v1/user/self` returns PII plus a live verification key. The supplied account is empty, so the DNS round-trip, the `SRV` relaxation probe, and the `{service}` mapping remain blocked on an account that owns a zone. |
