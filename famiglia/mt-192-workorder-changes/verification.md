# Testing Verification - mt-192-workorder-changes

- Date: 2026-07-15
- Worktree: `D:\Royal Glass Dev\rgtools\.worktrees\feature-workorder`
- Testing verdict: **PASS at every executed seam; BLOCKED at the isolated-database and mutating-browser seams**
- Release implication: this testing pass has no failures, but it is not a release GO while the required higher-seam proofs remain blocked.

## Current post-repair results

| Seam | Result | Current evidence |
|---|---|---|
| Workspace guardrails | PASS | 2/2 files and 4/4 tests passed |
| Pagination and authorization regressions | PASS | Focused matrix passed the complete-page cursor flow, repeated-cursor rejection, ServiceM8 cursor-header preservation, wrapper authorization, and direct-call authorization boundary |
| Active-item write race | BLOCKED | The database-capable integration test is discovered and safely skipped because `E2E_DATABASE_URL` is absent |
| Complete web unit/component/regression suite | PASS | 135 files and 810 tests passed; 3 files and 17 tests were environment-gated/skipped; no failures |
| Web TypeScript | PASS | No diagnostics |
| Database TypeScript | PASS | No diagnostics |
| Work Orders browser acceptance discovery | PASS | 1 Chromium test in 1 file discovered |
| Mutating Work Orders browser acceptance | BLOCKED | Not executed without a dedicated migrated `E2E_DATABASE_URL` plus matching strong `E2E_DATABASE_SENTINEL` |

## Exact commands and outcomes

1. Workspace tests, from the repository root:

   ```powershell
   .\node_modules\.bin\vitest.CMD --run tests --pool=threads --maxWorkers=1
   ```

   Exit 0. **2 files passed; 4 tests passed; 0 failed; 0 skipped.** Vitest duration 3.38s; wall time 6.8s.

2. Focused repaired-seam matrix, from `apps/web`:

   ```powershell
   .\node_modules\.bin\vitest.CMD run modules\work-orders\__tests__\actions-permissions.test.ts modules\work-orders\__tests__\refresh-work-orders.test.ts modules\work-orders\__tests__\active-item-write.integration.test.ts lib\servicem8\__tests__\client.test.ts --pool=threads --maxWorkers=1
   ```

   Exit 0. **3 files passed and 1 skipped; 77 tests passed and 1 skipped; 0 failed.** Vitest duration 19.79s; wall time 23.8s.

   The single skip is `active-item-write.integration.test.ts`. It is selected only when `E2E_DATABASE_URL` exists, then verifies the matching database sentinel before inserting fixtures. The test covers the race where refresh removes an item after active state is read but before the final write.

3. Complete web suite, from `apps/web`:

   ```powershell
   .\node_modules\.bin\vitest.CMD run --pool=threads --maxWorkers=1
   ```

   Exit 0. **135 files passed and 3 skipped (138 total); 810 tests passed and 17 skipped (827 total); 0 failed.** Vitest duration 1084.36s; wall time 1094.9s.

4. Standalone web typecheck, from `apps/web`:

   ```powershell
   .\node_modules\.bin\tsc.CMD --noEmit --pretty false
   ```

   Exit 0 with no diagnostics; wall time 22.5s.

5. Standalone database typecheck, from `packages/db`:

   ```powershell
   .\node_modules\.bin\tsc.CMD --noEmit --pretty false
   ```

   Exit 0 with no diagnostics; wall time 8.8s.

6. Work Orders Playwright discovery, from `apps/web`:

   ```powershell
   .\node_modules\.bin\playwright.CMD test "tests/e2e/work-orders.spec.ts" --list
   ```

   Exit 0. **1 Chromium test in 1 file discovered:** `MT-199 Work Order Items release acceptance > refreshes, edits, filters, exports, removes and restores a multi-item job` at `work-orders.spec.ts:165`.

## Repaired regressions confirmed

- The registered full-refresh boundary rejects a direct invocation without Work Orders Manage access before any ServiceM8 request or reconciliation transaction.
- ServiceM8 refresh follows every `x-next-cursor` page and rejects a repeated cursor before reconciliation.
- The ServiceM8 client preserves the pagination cursor response header.
- Active Work Order Item writes use an active-row update predicate and fail when no active row is updated; the real concurrent-removal proof is present but remains database-environment gated.

## Honest higher-seam gaps

1. **Database concurrency integration remains blocked.** Configure a dedicated, migrated non-production `E2E_DATABASE_URL` and set the database's `rgtools.e2e_database_sentinel` to the same 32+ character value supplied as `E2E_DATABASE_SENTINEL`, then rerun the focused integration test.
2. **Mutating authenticated Playwright acceptance remains blocked.** The journey is discoverable and fail-closed, but it was deliberately not executed without the same isolated database and sentinel.
3. **Live protected-route, accessibility, and representative performance evidence are not supplied by this testing rerun.** They require a runnable authenticated environment and, for performance, an agreed representative dataset and budget.
4. Production build, lint, dependency audit, security review, and architecture/spec review are separate verification-gate evidence and are not re-claimed by this testing-only artifact.

No product code, job state, review/gate/security artifact, Git state, remote, deployment, or database was changed by this testing task.
