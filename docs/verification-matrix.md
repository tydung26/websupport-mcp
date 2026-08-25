# Verification matrix

What has actually been proven about each of the 50 tools, and what has not.

This exists because "implemented" and "verified" are different claims, and the gap between them is
easy to lose track of. A tool that has never touched a real resource must not read as tested.

**Last updated:** 2026-08-25. **Account used:** a real Slovakia-market account with valid Standard
API credentials that owns **no services, zones, hosting, VPS or invoices**. Every conclusion below
is bounded by that.

## Levels

| Level | Meaning |
| --- | --- |
| **Live data** | Called against the real API and returned a parsed result. |
| **Live 4xx** | Called against the real API; the route resolved and the API rejected the *record*, not the request. Proves path, method, signing and error mapping — not response shape. |
| **Construction** | Never sent. Verified by asserting the exact method, path and body against a stubbed transport. |

Route existence was established by exploiting a distinction the API makes: a missing **route**
answers `404 The system is unable to find the requested action "…"`, while a missing **record**
answers `404 Hosting not found`. Controls in both directions confirmed the discriminator. So every
path below is known to exist, even where no data was returned.

## Summary

| Level | Tools |
| --- | --- |
| Live data | 8 |
| Live 4xx | 39 |
| Construction only | 3 |

The three construction-only tools are deliberate, not an oversight — see below.

## Live data

Called with real credentials and returned a parsed body.

| Tool | Evidence |
| --- | --- |
| `ws_auth_check` | `{"verified": true}` |
| `ws_user_get` | Full account record. Also the source of the finding that this endpoint returns billing address, email, phone and a live `verifyUrl` verification key. |
| `ws_service_list` | `{items: [], pager: {...}}` — empty, but the envelope is real. |
| `ws_zone_list` | as above |
| `ws_hosting_list` | as above |
| `ws_vps_list` | as above |
| `ws_invoice_list` | as above; also the endpoint that proved `pagesize` is honoured here and ignored on `/service`. |
| `ws_dns_record_list` | Reached the resource layer with paging **and** a ten-key `filters` deepObject, which is what proves the query-signing invariant. |

## Live 4xx

Route, method, signing and error mapping proven. Response shape unproven — the account owns nothing
for these to act on. All 39 answered a record-level 404, never a route-level one and never a 401.

- **v2 DNS and FTP** — `ws_dns_zone_get`, `ws_dns_record_create`, `ws_dns_record_update`,
  `ws_dns_record_delete`, `ws_ftp_account_list`, `ws_ftp_account_get`, `ws_ftp_account_create`,
  `ws_ftp_account_update`, `ws_ftp_account_delete`, `ws_domain_assign`
- **v1 reads** — `ws_service_get`, `ws_zone_get`, `ws_hosting_get`, `ws_hosting_vhost_list`,
  `ws_hosting_vhost_get`, `ws_hosting_stats`, `ws_db_list`, `ws_db_get`, `ws_db_users_list`,
  `ws_db_stats`, `ws_mailbox_list`, `ws_mailbox_get`, `ws_mail_stats`, `ws_vps_get`,
  `ws_vps_stats`, `ws_vps_vnc`, `ws_invoice_get`, `ws_invoice_pdf`
- **v1 writes** — `ws_db_create`, `ws_db_update`, `ws_db_delete`, `ws_mailbox_create`,
  `ws_mailbox_update`, `ws_mailbox_delete`, `ws_vps_reboot`, `ws_vps_snapshot_list`,
  `ws_vps_snapshot_create`, `ws_vps_snapshot_delete`, `ws_service_set_auto_extend`

Write routes were probed using ids for resources that do not exist, so no call could create, alter
or destroy anything. **That technique is safe only against ids known not to exist and must not be
repeated on a populated account.**

## Construction only

Never sent to the API, by policy rather than by omission.

| Tool | Why not live-fired |
| --- | --- |
| `ws_vps_hard_reboot` | An unclean power cycle can corrupt in-flight writes on a real machine. Route confirmed to exist via a nonexistent VPS id. |
| `ws_vps_snapshot_restore` | Overwrites a live disk and discards everything since the snapshot. Route confirmed to exist via a nonexistent VPS id. |
| `ws_dyndns_update` | Different reason: not dangerous, but **unverifiable with the credentials available**. `/nic/update` takes no date header, so its canonical signing form cannot be derived from the v1/v2 rule, and a Standard key may not authenticate against it at all. Needs a DynDNS-type key. Its route was not probed either. |

All three are verified by asserting the exact method, path and query against a stubbed transport.
Those assertions are the *complete* verification for these tools — they are the only ones in the
registry for which no request has ever left the machine.

## Verified independently of any account

These hold regardless of what the account owns.

| Property | How |
| --- | --- |
| Signer correctness | Three pinned known-answer vectors, recomputed independently. |
| Query string is **not** signed | Live, both API generations, with and without a `filters` deepObject. Contradicts the vendor's own documented example. |
| `Date` vs `X-Date` split | Live: v1 requires `Date` and rejects `X-Date`; v2 accepts either. |
| Tier gating | `tools/list` over a real stdio handshake: 30 / 43 / 37 / 50 across the four env permutations. |
| Confirm gate | Registry-wide invariant test: every `destructive` tool declares it, no other tool does, all seven share identical wording, and `confirm: false` is rejected as firmly as omission. |
| Order/payment absent | Source-tree grep for `/order` and `/pay` path literals. |
| FTP password write-only | Asserted against the vendored OpenAPI response schema. |
| Market hosts reachable | Live unauthenticated probe of all four. |
| OpenAPI spec unchanged | md5 compared against all four market hosts. |
| Artifact starts | CI smoke-tests the built bundle over a real MCP handshake on Node 22 and 24. |

## Known gaps

Things an account with real resources would settle, and nothing else will.

1. **Response shapes for 40 tools.** Routes are proven; field names are not.
2. **`filters` deepObject parsing.** The encoding transmits and passes authentication, but whether
   the server's filter *parser* honours it needs a zone with records.
3. **Whether `page` is honoured.** `pagesize` was measured per endpoint; `page` cannot be
   distinguished from clamping on an empty account.
4. **Database and mailbox create field sets.** v1 publishes no machine-readable spec, and a POST to
   a nonexistent parent is rejected before body validation runs. Those four schemas forward unknown
   fields rather than asserting an unverified contract.
5. **`ws_dyndns_update` authentication.** The endpoint takes no date header and its canonical form
   cannot be derived from the v1/v2 rule. Documented as best-effort; needs a DynDNS-type key.
6. **`{service}` versus v1 `serviceId`.** No services exist to cross-check.
7. **Cross-market credentials.** Needs a non-Slovakia key.
8. **Rate limits.** No 429 observed across roughly 60 authenticated requests. That is an
   observation, not a documented ceiling.
