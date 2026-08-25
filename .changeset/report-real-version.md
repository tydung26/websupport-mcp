---
'websupport-mcp': patch
---

Report the actual package version in `serverInfo`. 0.1.0 announced itself to MCP clients as
`0.0.0` because the constant was hardcoded; it is now read from `package.json`, and a test asserts
the two agree.
