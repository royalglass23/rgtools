# MT-199 Shakedown

## Slice

Complete Work Order Items CSV export at item granularity and add the isolated release-acceptance harness. Export repeats required parent context, uses the effective item label and item-owned operational values, preserves zero-item parents, and applies the same search, item filters, sort, and removed-item state as the dashboard.

## Automated coverage

- The export query loads parents in dashboard sort order, loads active or removed child items according to `Show removed items`, applies the shared parent-versus-child matching rules, and emits one row per included child.
- A current Work Order with no included children emits one row with blank item-owned fields.
- Job Number, Client, Address, Lead Score, and Item are mandatory export context even when hidden in summary configuration; other configured visible fields retain administrator order.
- Item export values come from the child record: effective label, Importance, Risk, Installer, Stage, Hardware, Maintenance Program, Install Date, and Date Completed.
- The HTTP route keeps the Work Orders module guard, parses the active query state, and returns item-row CSV.
- Controlled ServiceM8 and OpenAI adapter URLs are supported for acceptance environments. Custom endpoints must use HTTP or HTTPS, and production rejects non-HTTPS endpoints.
- One Playwright journey is registered for a dedicated database. It refreshes a high-score multi-item job, verifies quantity/code/label/hover detail, edits label and Risk, reloads and checks audit history, filters to one child and resets, downloads CSV, removes the job from the controlled ServiceM8 snapshot, then restores it and verifies RG-owned values survived.
- The acceptance server cannot reuse an existing dev server when `E2E_DATABASE_URL` is present.

## Commands and results

- MT-199 focused behavior set: **PASS**, 5 files / 49 tests.
- Complete Work Orders and export suite: **PASS**, 23 files / 140 tests.
- Complete web Vitest suite: **PASS**, 134 files passed and 2 skipped; 790 tests passed and 16 skipped.
- Workspace Vitest suite: **PASS**, 2 files / 4 tests.
- Focused MT-199 ESLint: **PASS**, no warnings or errors.
- Complete web ESLint: **PASS with six pre-existing unrelated warnings** before the final focused lint pass; no MT-199 warnings remain.
- Playwright discovery: **PASS**, one Chromium MT-199 acceptance test is registered.
- App-scoped `next build`: **PASS**, including TypeScript, 35-page generation, `/work-orders`, `/work-orders/[id]`, and `/api/work-orders/export`.
- `git diff --check`: **PASS**.
- Standalone `tsc --noEmit`: MT-199 files are clean. The command remains blocked by the existing readonly `NODE_ENV` assignment in `lib/storage/__tests__/r2.test.ts` and the user-owned `actions-permissions.test.ts` tuple inference at line 452; the production build TypeScript gate passes.

## Security coverage

- Export remains behind `requireModule('work-orders')`; the new query does not create a bypass route.
- Search and filters remain parameterised through Drizzle expressions. No request value is interpolated into SQL text.
- Controlled adapters require explicit environment configuration. Production rejects plaintext HTTP adapter endpoints so API credentials cannot be sent over an insecure transport.
- The mutating browser acceptance test is skipped unless `E2E_DATABASE_URL` is explicitly set. It never falls back to `.env.local`, and Playwright refuses to reuse an already-running dev server for that run.
- The browser fixture uses unique identities, cleans up its records, and does not contain production secrets.

## Deliberately skipped or incomplete

- The Playwright acceptance journey was not executed on this machine because `E2E_DATABASE_URL` is not configured. It was compiled, linted, and discovered successfully. Run it only against a migrated, dedicated database:
  `$env:E2E_DATABASE_URL='<isolated-url>'; npx.cmd playwright test tests/e2e/work-orders.spec.ts --workers=1`.
- The MT-199 ticket still mentions bulk apply. The current branch intentionally removed that capability in the later user-approved Work Orders UI change, and the acceptance journey asserts that the removed control stays absent. No bulk-apply path was reintroduced.
- No live ServiceM8, OpenAI, shared Neon, staging, or production data was mutated.

## Staging verification

1. Record ServiceM8 counts for active `Work Order` jobs, included production item lines, and configured billing exclusions.
2. Refresh staging and compare the success banner job, item, and excluded-line counts with those source counts.
3. Confirm the default dashboard is ordered by Lead Score descending with null scores last.
4. Sample one multi-item job: every line is expanded under one parent; quantity, code, effective label, original hover description, and line total excluding GST match ServiceM8.
5. Sample one zero-item current job and confirm it remains on the dashboard and exports one parent row with blank item fields.
6. Edit one item label and one operational field, reload, and confirm the values and item-linked timeline events persist.
7. Search for an item-only value, apply each configured item filter, confirm the matching count, then Reset and confirm every active child returns.
8. Enable `Show removed items`, confirm removed child rows appear without changing the active count, and download CSV to confirm the same child set and order.
9. Move a controlled ServiceM8 job out of `Work Order`, refresh, then return it and refresh again. Confirm its label, operational values, and history survive.

## Rollback

- The release is additive and requires no destructive schema rollback for MT-199.
- Restore the previous dashboard/application version to remove the item-row export and acceptance adapter configuration.
- Leave `work_order_items`, `work_order_events`, and refresh history intact. Do not delete item records or audit history.
- Remove `SERVICEM8_API_BASE_URL`, `OPENAI_RESPONSES_URL`, and `E2E_DATABASE_URL` from the runtime environment if they were set for staging acceptance; production normally uses the default HTTPS provider endpoints.
- After rollback, verify `/work-orders` renders the prior dashboard and `/api/work-orders/export` returns the prior export shape while the additive item data remains available for a forward fix.
