# Security tests — mt-192-workorder-changes

- Date: 2026-07-15
- Browser framework: Playwright 1.61.1

## Current automated evidence

| Control | Evidence | Current result |
|---|---|---|
| Direct registered refresh boundary requires Manage | `actions-permissions.test.ts:124` | PASS |
| Every cursor page accumulated before reconciliation | `refresh-work-orders.test.ts:151` | PASS |
| Repeated ServiceM8 cursor fails before transaction | `refresh-work-orders.test.ts:191` | PASS |
| ServiceM8 response header crosses adapter | `lib/servicem8/__tests__/client.test.ts:34-58` | PASS |
| Conditional active-write rejection for manual/operational/AI changes | `actions-permissions.test.ts` late-removal cases | PASS |
| Real read-committed two-connection removal race | `active-item-write.integration.test.ts` | **SKIPPED: isolated sentinel DB unavailable** |
| CSV hostile formula/control prefixes | `lib/__tests__/audit-export.test.ts` | PASS |
| E2E sentinel/credential safety | `lib/__tests__/work-order-acceptance-safety.test.ts` | PASS |
| Stable UUID, active options, removed items, atomic label history | Work Orders focused suites | PASS |

Security-focused rerun on the current worktree: **5 files, 84 tests passed**. The dedicated database integration discovery completed with **1 test skipped** because `E2E_DATABASE_URL` and matching `E2E_DATABASE_SENTINEL` are not configured.

The latest execute slices also record the full web regression at **135 files / 810 tests passed, 3 files / 17 tests skipped**, with typecheck, focused lint, build, and diff checks passing.

## Retired test gaps

- Direct-action authorization: now covered and green.
- Valid-looking paginated ServiceM8 response: now covered across multiple pages and repeated-cursor failure.
- Conditional active-item write: now covered for all three actions by unit tests and by a sentinel-protected real DB test definition.

## Remaining missing or blocked security tests

| Required test | Status | Consequence |
|---|---|---|
| Real database active-write concurrency test execution | BLOCKED | Strong conditional SQL is statically/unit proven, but live DB race proof remains unavailable |
| Mutating Playwright acceptance journey | BLOCKED | Dedicated migrated sentinel DB unavailable |
| Live unauthenticated/expired/forged session rejection | Missing | Static guards and direct grant-negative units only |
| Refresh single-flight and per-user throttle | **MISSING / FAIL** | No implementation |
| ServiceM8/OpenAI timeout and safe provider-error translation | **MISSING / FAIL** | No implementation |
| Bounded/streamed maximum export | **MISSING / FAIL** | No implementation |
| No sensitive data in production logs | Missing | Static secret scan only |

The E2E harness itself now fails closed before mutation unless an exact strong DB sentinel matches. That safety control passes; execution evidence remains blocked.
