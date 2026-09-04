# websupport-mcp

## 0.1.2

### Patch Changes

- [#10](https://github.com/tydung26/websupport-mcp/pull/10) [`86f8597`](https://github.com/tydung26/websupport-mcp/commit/86f859769b53677edd8fd135c6a37afb551c4c38) Thanks [@tydung26](https://github.com/tydung26)! - Start without credentials. `WEBSUPPORT_API_KEY` and `WEBSUPPORT_API_SECRET` are now read on the
  first request instead of in `main()`, so the server completes a handshake and answers `tools/list`
  unauthenticated — what registry build sandboxes, MCP Inspector and client config probes all do
  before anyone holds a key. Previously an absent variable exited the process before the transport
  opened, which reached the client as `MCP error -32000: Connection closed`. A tool call with no
  credential now returns a typed error naming the missing variable and leaves the session alive.
  
  `Ctx` no longer carries `ApiConfig`; no handler read it, and removing it makes a credential leak
  through a tool result structurally impossible.
  
  Adds a `Dockerfile` for hosts and registry build sandboxes that run containers rather than `npx`,
  and `scripts/smoke-stdio-handshake.ts`, which CI drives against both the bundle and the image with
  `WEBSUPPORT_*` stripped from the environment.

- [#10](https://github.com/tydung26/websupport-mcp/pull/10) [`86f8597`](https://github.com/tydung26/websupport-mcp/commit/86f859769b53677edd8fd135c6a37afb551c4c38) Thanks [@tydung26](https://github.com/tydung26)! - Declare all four MCP annotation hints on every tool. `openWorldHint` was missing from all 50, and
  a hint that is absent reads as unknown rather than false — one directory rejects the tool outright
  for it. `ws_vps_hard_reboot` now reports `idempotentHint: false`, since repeating a power-cycle
  cuts power again rather than converging; the other six destructive tools are deletes and stay
  idempotent. The stdio smoke test asserts the hints on the wire, not just in the source.

## 0.1.1

### Patch Changes

- [`a3d36ec`](https://github.com/tydung26/websupport-mcp/commit/a3d36ece7cd38a38c060623c8f234c0f7e91a1e5) Thanks [@tydung26](https://github.com/tydung26)! - Report the actual package version in `serverInfo`. 0.1.0 announced itself to MCP clients as
  `0.0.0` because the constant was hardcoded; it is now read from `package.json`, and a test asserts
  the two agree.

## 0.1.0

### Minor Changes

- [`266f375`](https://github.com/tydung26/websupport-mcp/commit/266f375e91854bc28f48b5d9b13a22508028b0c1) Thanks [@tydung26](https://github.com/tydung26)! - First release. An MCP server over stdio wrapping the Websupport REST API v1 and v2 as 50 tools —
  DNS, FTP, hosting, databases, mailboxes, VPS and invoices — with HMAC-SHA1 request signing and
  three risk tiers gating tool registration.
  
  Order creation and invoice/order payment are deliberately out of scope and asserted absent by test.
  See `docs/verification-matrix.md` for what has actually been verified against a live account, and
  what has not.
