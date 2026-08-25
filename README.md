# websupport-mcp

An MCP server (TypeScript, ESM, stdio) wrapping the [Websupport](https://www.websupport.sk) REST
API v1 + v2 — DNS, FTP, hosting, databases, mailboxes, VPS and invoices — exposed as MCP tools with
signed HMAC-SHA1 authentication.

**Status: planning.** There is no implementation yet. See
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) for the phase breakdown and current progress.

## Design intent

Tools are registered in three risk tiers. `read` is always available; `write` and `destructive`
each require their own environment opt-in, and destructive tools additionally require an explicit
`confirm: true` argument. Tiers gate **registration**, so a read-only deployment never sees a
write tool in `tools/list` at all.

Order creation and invoice/order payment endpoints are deliberately out of scope and are asserted
absent by test.

## Licence

MIT.
