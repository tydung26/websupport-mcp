# Example MCP client configurations

Credentials are blanked. Fill in the identifier and secret from WebAdmin
(Security → API keys) and generate a **Standard** pair — a DynDNS pair authenticates
against one endpoint only.

Verified against the built server on 2026-08-25: negotiated protocol revision
`2025-11-25`, with these tool counts.

| Config | `WEBSUPPORT_ALLOW_WRITE` | `WEBSUPPORT_ALLOW_DESTRUCTIVE` | Tools |
| --- | --- | --- | --- |
| `read-only.json` | unset | unset | 30 |
| `read-write.json` | `1` | unset | 43 |
| `full-access.json` | `1` | `1` | 50 |

Start with `read-only.json`. Nothing in it can change your account, and the write and
destructive tools are not merely refused — they never appear in `tools/list` at all.

Paths below assume a local checkout. Once the package is published, replace
`command`/`args` with:

```jsonc
"command": "npx",
"args": ["-y", "websupport-mcp"]
```
