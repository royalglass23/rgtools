# Execute shakedown - mt-192-workorder-changes

- Date: 2026-07-15
- Phase: execute
- Verdict: **REPAIRS COMPLETE; READY FOR VERIFY**
- Scope boundary: local implementation and verification only; no commit, push, merge, deployment, or shared database mutation

## Must-fix repairs

1. **Acceptance database isolation**
   - Mutating Work Orders E2E now requires a 32+ character `E2E_DATABASE_SENTINEL`.
   - The value must exactly match the single row in the isolated-only `rgtools_e2e.database_sentinel` table.
   - Cleanup is scoped to test-owned records and configuration/module state is restored.
2. **CSV formula injection**
   - Export cells that could be interpreted as formulas are neutralized, including leading whitespace and tab/newline variants.
   - Ordinary whitespace and numeric values remain unchanged.
3. **Atomic item label history**
   - Manual and AI-regenerated labels write the item, item timeline event, and global audit record in one transaction.
   - Removed items are rejected; AI regeneration rechecks active state after generation to close the removal race.
4. **Stable identities and active configuration**
   - Active ServiceM8 Work Orders without a stable job UUID are rejected instead of falling back to a mutable identity.
   - Installer, Stage, and Hardware mutations require active configured records.
5. **Detail visibility and type safety**
   - Work Order detail now returns and renders active and removed item records.
   - Standalone web and database TypeScript checks pass.
6. **Repository and dependency hygiene**
   - The tracked `debug.log` artifact is deleted. Verify later found that it is not ignored; recurrence protection remains open.
   - Direct Nodemailer and `ws` dependencies were upgraded; production audit changed from 2 high / 6 moderate / 2 low to 0 high / 2 moderate / 1 low.
   - Remaining findings are transitive through Next/PostCSS, ExcelJS/UUID, and Auth/Cookie and need reassessment during verify.

## TDD evidence

| Slice | Red evidence | Green evidence |
|---|---|---|
| E2E target guard and scoped cleanup | Existing permissive URL-string guard accepted unsafe targets | Acceptance safety tests pass with exact database sentinel validation |
| CSV formula protection | Hostile leading formula cells were emitted unchanged | Formula, whitespace-prefix, and ordinary-value tests pass |
| Atomic label history and removed-item authorization | Actions lacked atomic event history and removal race protection | Focused action suite passes 31/31, including removal during AI generation |
| Stable ServiceM8 job identity | Active rows could fall back to job number/address | ServiceM8 sync suite passes 9/9 with missing-UUID rejection |
| Work Order item detail | Detail query/page omitted item records | Query, source, and page tests render active and removed items |
| Storage test typing | Direct `NODE_ENV` assignment failed standalone TypeScript | Environment stubbing test and standalone TypeScript pass |

## Verification evidence

- Work Orders module: **22 files, 146 tests passed**.
- Auxiliary export safety, E2E guard, export route, and storage: **4 files, 9 tests passed**.
- Web TypeScript: **PASS** (`tsc --noEmit`).
- Database TypeScript: **PASS** (`tsc --noEmit`).
- Web ESLint: **PASS with 6 unrelated pre-existing warnings and 0 errors**; changed action test passes focused lint with no warnings.
- App-scoped Next production build: **PASS**, including `/work-orders`, `/work-orders/[id]`, and `/api/work-orders/export`.
- Playwright discovery: **PASS**, 1 Chromium acceptance test discovered.
- `git diff --check`: **PASS**, with line-ending warnings only.

## Intentionally not run

The mutating Playwright journey was not executed because no dedicated migrated E2E database is configured. Neon does not allow the custom database parameter originally proposed here. Before verify can exercise the journey, run `apps/web/tests/e2e/setup-isolated-database-sentinel.sql` against the dedicated database after replacing its placeholder with the secret sentinel. The equivalent SQL is:

```sql
CREATE SCHEMA IF NOT EXISTS rgtools_e2e;
CREATE TABLE IF NOT EXISTS rgtools_e2e.database_sentinel (
  id smallint PRIMARY KEY CHECK (id = 1),
  sentinel text NOT NULL CHECK (length(sentinel) >= 32)
);
INSERT INTO rgtools_e2e.database_sentinel (id, sentinel)
VALUES (1, 'a-random-secret-value-at-least-32-characters')
ON CONFLICT (id) DO UPDATE SET sentinel = EXCLUDED.sentinel;
```

Set the exact same value in `E2E_DATABASE_SENTINEL`. This proof table is intentionally not migration-managed and must never be created in dev, staging, or production.

## Next gate

Run `/godfather mt-192-workorder-changes --phase verify`. Prior `verification.md`, `review.md`, `security/signoff.md`, and `gate.md` remain the historical pre-repair verdicts until that phase reruns them.

## Soldato slice - protect the actual refresh boundary

- Date: 2026-07-15
- Scope: the P0 authorization finding for the registered `refreshWorkOrdersFromServiceM8` Server Action only
- Verdict: **PASS**

### RED

Added a direct-invocation authorization test for the exported full-refresh boundary. Before the fix, the call bypassed the Manage permission error, entered refresh work, and failed later with `Cannot read properties of undefined (reading 'values')`.

### GREEN

- Added `assertCurrentUserCanManageWorkOrders()` inside `refreshWorkOrdersFromServiceM8`, so direct calls fail before ServiceM8, OpenAI, or database work.
- Retained the wrapper's early guard so denied users receive the permission failure rather than a refresh-error redirect.
- Direct permission plus refresh suites: **2 files, 41 tests passed**.
- Complete web regression: **135 files and 804 tests passed; 2 files and 16 tests skipped; 0 failures**.
- Web TypeScript: **PASS**.
- App-scoped Next production build: **PASS**, 35 pages generated.
- The regenerated server-reference manifest still registers the function, and the function now enforces Manage authorization at its own mutation boundary.
- `git diff --check`: **PASS**, with line-ending warnings only.

### Deliberate gaps

This Soldato invocation completed one approved slice only. The next P0 remains proving that every required ServiceM8 dataset is complete before unseen Work Orders/items are deactivated. The active-item write race and later Omerta hardening items also remain open. The mutating Playwright journey was not run because no dedicated migrated sentinel database is configured.

## Soldato slice - prove complete ServiceM8 datasets

- Date: 2026-07-15
- Scope: the P0 source-completeness finding at the destructive Work Orders reconciliation boundary only
- Verdict: **PASS**

### Source contract

ServiceM8 documents cursor pagination with an initial `cursor=-1`, continuation through the `x-next-cursor` response header, and completion only when that header is absent. ServiceM8 also documents combining filters with cursor pagination.

- https://developer.servicem8.com/docs/pagination
- https://developer.servicem8.com/docs/filtering

### RED

- The adapter regression received `x-next-cursor: cursor-2`, but the ServiceM8 response wrapper returned `undefined` because it discarded response headers.
- The refresh regression supplied two valid Work Order pages, but reconciliation reported `synced: 1` instead of `synced: 2` because only page one was read.

### GREEN

- The ServiceM8 response seam now exposes response headers without requiring existing test adapters to implement them.
- Every required dataset starts at `cursor=-1`, preserves its existing OData filter, follows each `x-next-cursor`, validates every page, and accumulates all rows before normalization or transaction work begins.
- A repeated cursor fails closed, records a failed refresh, and never starts the reconciliation transaction.
- Focused adapter and refresh suites: **2 files and 42 tests passed**.
- Complete web regression: **135 files and 807 tests passed; 2 files and 16 tests skipped; 0 failures**.
- Web TypeScript: **PASS**.
- Focused ESLint: **PASS**.
- App-scoped Next production build: **PASS**, 35 pages generated, with the existing workspace-root and NFT trace warnings only.
- Focused `git diff --check`: **PASS**.

### Deliberate gaps

This Soldato invocation completed one approved slice only. The remaining P0 is the active-state write precondition/race identified by the verify review. The mutating Playwright journey remains blocked until a dedicated migrated database with a matching `E2E_DATABASE_SENTINEL` is configured.

## Soldato slice - make active item state an atomic write precondition

- Date: 2026-07-15
- Scope: the remaining P0 check-then-write race for manual labels, operational edits, and AI label regeneration only
- Verdict: **PASS**

### RED

- Manual label regression: the action read an active item, accepted an UPDATE that returned no active row, wrote history, and resolved instead of rejecting.
- Operational edit regression: the action read an active item, accepted an UPDATE that returned no active row, and resolved with `{ value: 'high' }` instead of rejecting.
- AI regeneration regression: the action re-read an active item inside its transaction, accepted an UPDATE that returned no active row, wrote history, and resolved instead of rejecting.

### GREEN

- Added one deep conditional-write seam for Work Order Items.
- Every affected UPDATE now requires both the item ID and `is_active=true`, then uses `RETURNING id` to prove one active row changed.
- Zero returned rows raise the existing removed-item error before timeline or audit writes; the surrounding transaction rolls back.
- Manual label, operational edit, and AI regeneration all use the same invariant.
- Added a real two-connection read-committed concurrency regression guarded by the existing isolated-database sentinel. It models an action transaction reading active state, a refresh connection committing removal, and the action's conditional UPDATE rejecting the late write.

### Verification evidence

- Public action suite: **35 tests passed**.
- Focused concurrency discovery: **35 passed and 1 sentinel-protected integration test skipped** because no dedicated `E2E_DATABASE_URL` and matching `E2E_DATABASE_SENTINEL` are configured.
- Complete web regression: **135 files and 810 tests passed; 3 files and 17 tests skipped; 0 failures**.
- Web TypeScript: **PASS**.
- Focused ESLint: **PASS**.
- App-scoped Next production build: **PASS**, 35 pages generated, with the existing workspace-root and NFT trace warnings only.
- Focused `git diff --check`: **PASS**, with the existing line-ending warning only.

### Deliberate gaps

The database-capable concurrency test was authored but not executed because the required isolated sentinel database is not configured. The broader MT-199 Playwright journey remains blocked for the same reason. Historical verify, security, review, and gate artifacts still show the pre-repair findings until the verify phase reruns them.

## Soldato slice - bound ServiceM8 pagination

- Date: 2026-07-15
- Scope: one P1 provider-boundary control: fail-closed maximum page traversal for Work Order ServiceM8 refreshes
- Verdict: **PASS**

### RED

The new regression supplies an endless sequence of valid-looking pages with unique continuation cursors. Against the pre-slice refresh implementation, traversal had no bound and the test safety stop would be reached instead of a useful refresh error. The test requires the refresh to stop at the configured limit, record failure, and never start reconciliation.

### GREEN

- Work Order ServiceM8 pagination now enforces a 25-page maximum per dataset.
- The guard runs before issuing the next provider request, so the 26th page is never fetched.
- Exceeding the budget raises `ServiceM8 <dataset> pagination exceeded the 25-page refresh limit.`; the existing refresh failure record is written and no transaction begins.
- Focused refresh suite: **12 tests passed**.
- Combined ServiceM8 client/refresh matrix: **43 tests passed**.
- Complete web regression: **135 files and 811 tests passed; 3 files and 17 tests skipped; 0 failures**.
- Web TypeScript: **PASS**.
- Focused ESLint: **PASS**.
- App-scoped Next production build: **PASS**, 35 pages generated, with the existing workspace-root and NFT trace warnings only.
- Focused `git diff --check`: **PASS**, with the existing line-ending warning only.

### Deliberate gaps

This slice bounds pagination but does not add provider abort timeouts, refresh single-flight/throttling, AI throttling, or export size/streaming limits. Those remain separate P1 backlog items. Sentinel-protected database/browser execution remains unavailable in this environment.

## Soldato slice - abort stalled ServiceM8 requests

- Date: 2026-07-15
- Scope: one P1 provider-boundary control: abort a ServiceM8 request after the configured timeout
- Verdict: **PASS**

### RED

The new client regression held a ServiceM8 fetch open indefinitely. Before the change, the request never received an abort signal and the test timed out without a typed provider failure.

### GREEN

- The ServiceM8 adapter now applies a 30-second timeout to read and write requests by default and accepts a smaller timeout for deterministic tests.
- Timed-out fetches abort through `AbortController`, raise `ServiceM8TimeoutError` with the request path and timeout, and are not retried as generic network failures.
- Combined ServiceM8 client/refresh matrix: **44 tests passed**.
- Complete web regression: **135 files passed and 3 skipped; 812 tests passed and 17 skipped; 0 failures**.
- Web TypeScript: **PASS**.
- Focused ESLint: **PASS**.
- App-scoped Next production build: **PASS**, 35 pages generated; existing workspace-root and NFT trace warnings remain.
- `git diff --check`: **PASS**, with the existing line-ending warning only.

### Deliberate gaps

This slice does not add refresh single-flight/throttling, AI throttling, or export size/streaming limits. Sentinel-protected database/browser execution remains unavailable. The next step is a full Omerta rerun, not a release claim.

## Soldato slice - share concurrent Work Order refreshes

- Date: 2026-07-15
- Scope: one P1 refresh-control seam: share an in-flight Work Order refresh within the running application process
- Verdict: **PASS with deployment residual**

### RED

The concurrency regression started one refresh, held its provider request open, then invoked the public refresh boundary again. Before the change, the second call used its own request adapter and started another refresh.

### GREEN

- `refreshWorkOrdersFromServiceM8` now keeps one in-flight promise after its own Manage authorization and returns that promise to concurrent callers.
- The shared promise clears on success or failure, so a later refresh can retry after the first run finishes.
- The regression proves the duplicate request adapter is never called and only one reconciliation transaction runs.
- ServiceM8/refresh matrix: **45 tests passed**.
- Complete web regression: **135 files passed and 3 skipped; 813 tests passed and 17 skipped; 0 failures**.
- Web TypeScript: **PASS**.
- Focused ESLint: **PASS**.
- App-scoped Next production build: **PASS**, 35 pages generated; existing workspace-root and NFT trace warnings remain.
- `git diff --check`: **PASS**, with the existing line-ending warning only.

### Deliberate gaps

This historical slice was process-local at the time it was recorded. The current verification delta supersedes that residual: durable refresh/label leases, per-user refresh/AI windows, export bounds, OpenAI/direct-attachment timeouts, raw snapshot minimization, and refresh attribution are now implemented. Dedicated DB/browser runtime evidence, retention approval, dependency decisions, and representative performance evidence remain open.

## 2026-07-16 verification rerun

- Focused repair tests: **54 passed**.
- Full web suite: **135 files passed, 3 skipped; 819 tests passed, 17 skipped**.
- Web and DB typechecks: **PASS**.
- Lint: **PASS**, 0 errors and 6 pre-existing warnings.
- App-scoped production build: **PASS**, 35 pages generated; existing workspace-root/NFT trace warnings remain.
- Migration consistency: **PASS**, `drizzle-kit check`.
- Playwright discovery: **PASS**, 1 MT-199 test listed; execution blocked without the dedicated migrated sentinel DB.
- Security/review: code seams hardened; strict sign-off and gate remain **FAIL/RED** for retention, dependency, isolated runtime evidence, and performance/accessibility evidence; separate Work Order enrichment planning remains excluded from MT-192 staging.

## Soldato slice - repair disabled Work Orders pagination contrast

- Date: 2026-07-16
- Scope: one accessibility regression at `WorkOrdersTableControls.tsx:444`
- Verdict: **REPAIR COMPLETE; READY FOR ENFORCER**

### RED

The authenticated MT-199 axe scan reported one serious WCAG 1.4.3 `color-contrast` violation across the disabled Previous and Next labels. Computed gray-400 text on the gray-50 page background was 2.48:1 for 14px normal text; WCAG AA requires 4.5:1.

### GREEN

- Changed only the disabled pagination text token from `text-gray-400` to `text-gray-600`; active pagination remains `text-gray-700`.
- Kept the axe scan scope and WCAG tags unchanged.
- Authenticated axe result: **0 violations**.
- Complete MT-199 journey: **1 passed**; refresh 3.880s, 3.796s, 2.436s; export 5.587s.
- Full web: **137 files passed, 3 skipped; 826 tests passed, 17 skipped**.
- Workspace: **2 files and 4 tests passed**.
- Lint: **0 errors and 6 unrelated existing warnings**.
- Web and database TypeScript: **PASS**.
- Production build: **PASS**, 36 routes/pages.
- Production dependency audit: **0 advisories at every severity**.
- `pnpm peers check` reports the existing optional NextAuth/Nodemailer range mismatch; RGTools uses credential auth and direct Nodemailer for ServiceM8 email. This slice did not change those dependencies.

### Deliberate boundaries

- No unrelated shared pagination components were changed.
- No axe rule, tag, selector, or assertion was disabled or weakened.
- No branch, commit, push, merge, deployment, migration, shared database mutation, or production mutation was performed.
