# Security gap report - mt-192-workorder-changes

- Mode: retrofit
- Date: 2026-07-16
- Overall status: **PASS - no open security gate finding**

## Retired findings

| Former finding | Disposition |
|---|---|
| Unguarded registered refresh | Fixed: direct callable Manage authorization |
| Partial/looping ServiceM8 response | Fixed: complete cursors, repeated-cursor rejection, 25-page cap |
| Check-then-write active-item race | Fixed and proven with a two-connection database test |
| Unbounded provider requests | Fixed: 30-second ServiceM8/OpenAI/attachment abort boundaries |
| Process-local coordination | Fixed: durable PostgreSQL leases and per-user windows |
| Unbounded/unsafe export | Fixed: 10,000-row cap, 413 response, and formula neutralization |
| Raw provider error disclosure | Fixed: safe fixed errors |
| Raw snapshot/history retention | Fixed: no new snapshots, migration clearing, 7-year/2-year cleanup, weekly protected cron |
| Dependency advisories | Fixed: current production audit reports zero advisories |
| Missing runtime evidence | Fixed: DB race and authenticated MT-199 journey pass with measured budgets |

## Non-blocking release follow-ups

1. Confirm `CRON_SECRET` in the Vercel Production environment before deployment.
2. Confirm the registered cron and first successful cleanup in Vercel after deployment.
3. Add an operational alert for repeated 401/500 or a missing weekly invocation; the runbook currently relies on Vercel logs and manual confirmation.

These are deployment/operations readiness items and are recorded in `getaway.md`; they do not represent an unresolved code-security check.
