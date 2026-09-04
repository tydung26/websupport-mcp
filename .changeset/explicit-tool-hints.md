---
'websupport-mcp': patch
---

Declare all four MCP annotation hints on every tool. `openWorldHint` was missing from all 50, and
a hint that is absent reads as unknown rather than false — one directory rejects the tool outright
for it. `ws_vps_hard_reboot` now reports `idempotentHint: false`, since repeating a power-cycle
cuts power again rather than converging; the other six destructive tools are deletes and stay
idempotent. The stdio smoke test asserts the hints on the wire, not just in the source.
