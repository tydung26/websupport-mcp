# Example MCP client configurations

Credentials are blanked. Fill in the identifier and secret from WebAdmin
(Security → API keys), and generate a **Standard** pair — a DynDNS pair authenticates
against one endpoint only.

Requires Node >= 22.

| Config | `WEBSUPPORT_ALLOW_WRITE` | `WEBSUPPORT_ALLOW_DESTRUCTIVE` | Tools |
| --- | --- | --- | --- |
| `read-only.json` | unset | unset | 30 |
| `read-write.json` | `1` | unset | 43 |
| `full-access.json` | `1` | `1` | 50 |

Start with `read-only.json`. Nothing in it can change your account, and the write and
destructive tools are not merely refused — they never appear in `tools/list` at all.

Tool counts verified against the published package over a real stdio handshake; negotiated
protocol revision `2025-11-25`.

## Pinning a version

Replace `websupport-mcp` with `websupport-mcp@0.1.1` in `args` to pin. Without a version,
`npx` resolves the latest release on first run and caches it.

## Running from a local checkout

To use a working copy instead of the published package, build it (`npm install && npm run build`)
then set `command` to `node` and `args` to a single-element array containing the absolute path to
the built entrypoint under the checkout's output directory.
