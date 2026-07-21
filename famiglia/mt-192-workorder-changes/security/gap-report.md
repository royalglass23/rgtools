# Security gap report — mt-192-workorder-changes

- Mode: retrofit
- Date: 2026-07-15
- Overall status: **FAIL — no High/Critical findings; applicable Medium/Low gaps remain**

## Retired findings

| Former finding | Current disposition | Evidence |
|---|---|---|
| High: unguarded registered full-refresh Server Action | **FIXED / RETIRED** | `refreshWorkOrdersFromServiceM8` authorizes Manage at its own boundary; direct negative test passes |
| High: partial ServiceM8 response deactivates unseen rows | **FIXED / RETIRED** | Cursor pages followed to header absence; repeated cursors fail before transaction; adapter preserves headers |
| Medium: check-then-write removed-item race | **FIXED / RETIRED** | Shared `updateActiveWorkOrderItem` uses `id + is_active=true + RETURNING`; all three action tests pass |

## Prioritized current backlog

### P1 — Medium — bound expensive/concurrent operations

- Add a database/advisory lock or durable single-flight guard around complete refresh.
- Add per-user/server throttling for refresh and AI label regeneration.
- Add abort timeouts and a maximum pagination budget to ServiceM8/OpenAI calls.
- Bound or stream `listWorkOrdersForExport` and CSV generation.
- Add concurrency, timeout, unique-cursor exhaustion, and maximum-export tests.

Evidence: `actions.ts:115-350,458-508`, `item-labels.ts:24-40`, and `queries.ts:180-206` contain no complete controls for these boundaries.

### P1 — Medium — clear or accept production advisories

The current live production audit reports **0 critical, 0 high, 2 moderate, 1 low**. The unchanged lock contains the remaining Next/PostCSS, ExcelJS/UUID, and Auth/Cookie paths.

Upgrade through supported upstream versions or record an approved, time-bounded exception with reachability and compensating controls. Omerta cannot mark A06/V10 PASS while applicable advisories remain.

### P1 — Medium — minimize and retain ServiceM8 personal data deliberately

The refresh persists the complete upstream job object in `work_orders.raw_servicem8_snapshot`; the schema defines an open-ended JSONB field and no retention/deletion rule.

Persist an allow-listed diagnostic subset or remove the duplicate snapshot; document retention/deletion for Work Orders, item history, and audit records.

### P1 — Medium/low — complete security logging

Refresh runs store status/count/error but no actor identity, and denied Manage/Configure checks only throw. Record actor/correlation for refresh attempts/results and safely log denied privileged actions.

### P2 — Medium/low — redact provider errors

`item-labels.ts:37-40` includes the raw OpenAI response body in a thrown error. Store a provider status/request ID internally and return a fixed safe error.

### P2 — Low — prevent debug-artifact recurrence

`debug.log` is deleted in the dirty delta, but `git check-ignore debug.log` fails. Add a narrow ignore rule if this Chromium/GPU artifact is expected to recur.

## Evidence gates

1. Run the sentinel-protected database concurrency test and Playwright journey against a dedicated migrated DB.
2. Add observable authN/session, rate/timeout, export-bound, and log-redaction tests.
3. Re-run the production audit after dependency remediation or exception approval.
