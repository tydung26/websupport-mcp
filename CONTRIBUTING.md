# Contributing

## Setup

**Node >= 22** and **npm >= 11**. Node 20 reached end of life on 2026-04-30 and is not supported;
npm 10 cannot resolve the bundler's dependency tree and fails with an unhelpful
`Cannot read properties of null (reading 'edgesOut')`.

```bash
npm install
npm test
```

Working against the live API needs your own Websupport credentials:

```bash
cp .env.example .env   # then fill in the key and secret
```

`.env` is gitignored. Generate a **Standard** API pair in WebAdmin — a DynDNS-type pair
authenticates against `/nic/update` and nothing else.

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Offline suite. No network, no credentials. |
| `npm run test:network` | Live unauthenticated probes: market hosts and OpenAPI drift. |
| `npm run typecheck` | `tsc --noEmit`. The bundler does not type-check. |
| `npm run lint` | Biome, formatter and linter in one. `npm run format` writes fixes. |
| `npm run build` | Bundles to a single `dist/index.js`. |
| `npm run docs:tools` | Regenerates `docs/tools.md`. CI fails if this produces a diff. |

## Scope

Two boundaries are enforced by test rather than by review, so a change that crosses them fails the
build rather than reaching a reviewer:

- **No order-creation or payment endpoints.** A grep over the source tree rejects `/order` and
  `/pay` path literals. This server must not be able to spend money.
- **Every `destructive` tool declares `confirm: true`, and no other tool does.** Shared wording,
  checked registry-wide.

v1 DNS-record CRUD and v1 FTP-account CRUD are deprecated upstream and deliberately not exposed —
the v2 tools cover both.

## Adding a tool

1. Put it in the module for its resource group under `src/tools/v1/` or `src/tools/v2/`.
2. Pick the tier by **what the operation destroys**, not by whether it writes. A graceful VPS
   reboot is `write`; a hard power-cycle is `destructive` because it can corrupt in-flight writes.
   Taking a snapshot is `write`; restoring one is `destructive` because it discards everything
   since.
3. A `destructive` tool spreads `...confirmArg` into its schema and names the concrete irreversible
   effect in its description. "Deletes the record" is not enough; say what is lost and that it
   cannot be recovered.
4. Add it to `src/tools/registry.ts`.
5. Add it to `docs/verification-matrix.md` under the level you can actually justify. A test fails
   if a registered tool is missing from the matrix, categorised twice, or if a summary count
   disagrees with its own list.
6. Run `npm run docs:tools` and commit the result.

## Verifying against the live API

Route existence can be checked without owning anything. The API distinguishes a missing **route**
(`404 The system is unable to find the requested action "…"`) from a missing **record**
(`404 Hosting not found`), so pointing a call at an id that does not exist proves the path while
touching nothing.

**That technique is safe only against ids known not to exist.** Never run it against a populated
account, and never live-fire `ws_vps_hard_reboot` or `ws_vps_snapshot_restore` at a real machine —
they are verified by request construction on purpose.

Record what you actually proved in `docs/verification-matrix.md`. A tool that has never touched a
real resource must not read as tested.

## Releasing

Nothing publishes automatically. The pipeline has a deliberate human gate in the middle.

1. **Describe the change.** `npx changeset` writes a small file under `.changeset/` recording the
   bump type and a user-facing summary. Commit it with the work.
2. **CI opens a release PR.** On merge to `main`, the release workflow collects pending changesets
   into a version bump, a changelog entry, a regenerated `docs/tools.md` and a synced
   `server.json`, and opens a "chore: release" pull request. Nothing is published at this point.
3. **Merging that PR publishes.** Only then does `changeset publish` push to npm. Authentication is
   npm trusted publishing — the workflow's OIDC identity, no token anywhere — and provenance is
   generated automatically as a result. Nothing needs to be held in repository secrets.
4. **Registry publish is separate and manual**, via `mcp-publisher login github` then
   `mcp-publisher publish`.

`server.json` is not shipped in the npm tarball — it describes the package to the MCP Registry.
Its version is synced from `package.json` during step 2, because `changeset version` knows nothing
about it and the two would otherwise drift. A test enforces the agreement, and a network test
validates the manifest against the **live** registry schema rather than a vendored copy, since the
schema is date-versioned and a stale one is rejected at publish time.

## Style

Enforced by Biome and `tsconfig`, so most of it is automatic. What is not:

- **Never `console.log`.** stdout is the JSON-RPC transport; one stray write kills the session.
  Diagnostics go to stderr.
- Keep files under 200 lines.
- kebab-case filenames, long and descriptive. Tests sit beside their subject as `*.test.ts`.
- Relative imports carry the `.js` extension — a NodeNext requirement.
- `z.strictObject` for tool inputs, so unknown keys are rejected rather than forwarded to the API.
  The one exception is `src/tools/v1/write-body.ts`, where the upstream field set is genuinely
  unpublished; the reasoning is documented there and should be honoured rather than copied.

## Commits and pull requests

Conventional commits. Keep each commit to one concern — the history is meant to be readable a year
from now.

CI must be green: typecheck, lint, tests, build, a stdio handshake against the built bundle, the
generated tool list, and the package contents, all on Node 22 and 24. The live API job is advisory
and may fail without blocking; a Websupport outage is not your bug.

Explain *why* in commit bodies. This codebase carries several decisions that look wrong until you
know the evidence — the query string is not signed, mailbox reads and writes use different roots,
`ws_service_list` advertises no paging. All three were measured. Preserve that reasoning.
