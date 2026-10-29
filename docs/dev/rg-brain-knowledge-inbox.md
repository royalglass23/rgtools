# RG Brain knowledge inbox in RG Tools

Status: development implementation prepared 30 October 2026; not deployed. RG Brain migration 002 and the four-question seed were applied to development `neondb`. A restricted database role, environment setup and RG Tools deployment remain separate gates.

The `/knowledge-inbox` page uses the current RG Tools login for admins to add questions, copy a private response link and review written answers. The link opens `/knowledge-response` without a login and covers only the open questions in its group for 14 days. Browser forms never receive RG Brain keys. Link submissions are attributed to an unverified link holder; review must confirm who answered. Optional signed-in staff access can be enabled with `RG_BRAIN_INBOX_RESPONDER_USER_IDS`.

Set these **server-only** variables in RG Tools after provisioning a database role limited to the two inbox tables:

```text
RG_BRAIN_INBOX_DATABASE_URL=postgresql://<restricted-user>:<secret>@<neon-host>/neondb?sslmode=verify-full
RG_BRAIN_INBOX_INVITE_SECRET=<random secret of at least 32 characters>
# Optional: RG_BRAIN_INBOX_RESPONDER_USER_IDS=<staff user IDs>
```

The database URL must remain server-side. The optional staff allowlist is comma separated. A missing allowlist denies signed-in staff access; admins retain reviewer access when the database URL is configured. The no-login link is separate from that allowlist. Send it privately because anyone holding it can submit for its listed questions until it expires.

An inbox response is evidence for an editor. Even a `verified_for_drafting` review does not publish a knowledge card or change the approved search results. Use the RG Brain card review and approval process for that separate decision.
