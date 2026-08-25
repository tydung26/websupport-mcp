# CLAUDE.md

## Source Of Truth

### Context

`websupport-mcp` is an MCP server (TypeScript, ESM, stdio) wrapping the Websupport REST API v1 + v2 — DNS, FTP, hosting, databases, mailboxes, VPS, invoices — exposed as tools with signed HMAC-SHA1 auth and three risk tiers gating tool registration. Order creation and invoice/order payment are out of scope. Development progress is tracked in `IMPLEMENTATION_PLAN.md`.

## Golden Rules

Read before every work session.

1. **Address the user as "my lovely Darling."**

2. **Always update `IMPLEMENTATION_PLAN.md`.** Whenever you start or finish an item:
   - Move the checkbox: `[ ]` → `[~]` (in progress) → `[x]` (done).
   - Update the "Last updated" line and add an entry to the "Progress log" (date + summary).
   - Mark an item `[x]` only when the code runs / is verified — not when it has merely been written.
   - Keep it in sync with the session todo list. Internal todos must mirror the items in the plan.

## Working Style

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- For a new solution, present the state-of-the-art (SOTA) approach alongside your own alternative(s), with trade-offs - don't pick silently.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Code Style

- **TypeScript ESM across the repo.** `"type": "module"`, `engines.node >= 20`. `tsconfig`:
  `module`/`moduleResolution: "nodenext"`, `strict`, `verbatimModuleSyntax`,
  `erasableSyntaxOnly`, `noUncheckedIndexedAccess`. Relative imports carry the `.js` extension
  (NodeNext requirement) — `import { signRequest } from './auth/signer.js'`.
- **Biome** is the single formatter + linter (one dep, one config — no Prettier, no ESLint):
  2 spaces, single quotes, no semicolons, trailing commas, `lineWidth: 100`.
- `import type { ... }` for type-only imports. `PascalCase` for types/classes, `camelCase` for
  functions/variables, `SCREAMING_SNAKE` for env var names.
- **kebab-case filenames**, long and descriptive — `build-path-with-query.ts`, not `url.ts`.
  Tests sit beside their subject as `*.test.ts`. Every file under 200 LOC.
- **stdout belongs to the JSON-RPC transport.** Never `console.log` — every log, warning, and
  diagnostic goes to `stderr`. One stray stdout write corrupts the stream and kills the session.
- Zod 4 for every tool input schema; `z.strictObject` so unknown keys are rejected rather than
  silently forwarded to the API. Derive types with `z.infer`, don't hand-write them twice.
- Async/await only — no raw `.then()` chains. Errors cross tool boundaries as typed results, not
  thrown strings.
