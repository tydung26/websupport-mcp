---
'websupport-mcp': patch
---

Start without credentials. `WEBSUPPORT_API_KEY` and `WEBSUPPORT_API_SECRET` are now read on the
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
