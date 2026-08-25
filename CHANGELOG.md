# websupport-mcp

## 0.1.0

### Minor Changes

- [`266f375`](https://github.com/tydung26/websupport-mcp/commit/266f375e91854bc28f48b5d9b13a22508028b0c1) Thanks [@tydung26](https://github.com/tydung26)! - First release. An MCP server over stdio wrapping the Websupport REST API v1 and v2 as 50 tools —
  DNS, FTP, hosting, databases, mailboxes, VPS and invoices — with HMAC-SHA1 request signing and
  three risk tiers gating tool registration.
  
  Order creation and invoice/order payment are deliberately out of scope and asserted absent by test.
  See `docs/verification-matrix.md` for what has actually been verified against a live account, and
  what has not.
