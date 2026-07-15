# Review - mt-192-workorder-changes

- Date: 2026-07-15
- Reviewed commit: `e2c167aad9f7a77851c548afd3d33b5f7efd0224` plus the current dirty MT-199 and repair delta
- Review mode: Enforcer review axes; command validation is recorded in `gate.md`
- Contract: Linear MT-192, `CLAUDE.md`, `CONTEXT.md`, and `famiglia/work-order-items/contract.md`
- Verdict: **APPROVED**

## Must-fix

None remain in the current code review. The three findings returned to Soldato during verify are resolved at their actual side-effect seams.

## Verify repair recheck

### Registered refresh authorization - resolved

- `apps/web/modules/work-orders/actions.ts:115-120` now enforces Work Orders Manage permission inside `refreshWorkOrdersFromServiceM8`, before provider or database work.
- `apps/web/modules/work-orders/__tests__/actions-permissions.test.ts:124-136` directly invokes the exported full-refresh boundary and proves a denied user reaches neither the request adapter nor the reconciliation transaction.
- Keeping the guard inside the registered Server Action closes the bypass even if callers do not use `refreshWorkOrdersAction`.

### Complete ServiceM8 truth set - resolved

- `apps/web/lib/servicem8/client.ts:12-17` carries response headers across the ServiceM8 adapter seam; the production adapter supplies `response.headers` at `:166-172`.
- `apps/web/modules/work-orders/actions.ts:930-962` starts every dataset at cursor `-1`, accumulates every page, follows `x-next-cursor` until absent, validates every page, and fails closed on a repeated cursor.
- All required job, company, jobmaterial, and material datasets use that boundary concurrently at `actions.ts:127-134`; reconciliation does not begin until every pagination loop has completed.
- `apps/web/modules/work-orders/__tests__/refresh-work-orders.test.ts:151-218` proves multi-page accumulation and repeated-cursor rejection before a transaction.

This satisfies the contract's complete-source rule before unseen jobs/items are deactivated. The ServiceM8 integration is now a deeper adapter: pagination mechanics and completeness evidence stay behind one interface instead of leaking into reconciliation callers.

### Atomic active-item write precondition - resolved

- `apps/web/modules/work-orders/active-item-write.ts:updateActiveWorkOrderItem` places `id` and `is_active=true` in the same UPDATE predicate and requires `RETURNING id`; zero rows raise the removed-item error before later history/audit writes.
- Manual label, operational field, and AI-regenerated label actions all use that single seam at `apps/web/modules/work-orders/actions.ts:363`, `:436`, and `:471`.
- Mocked action regressions cover a late zero-row update in `actions-permissions.test.ts:190-221`, `:458-494`, and `:649-693`.
- `apps/web/modules/work-orders/__tests__/active-item-write.integration.test.ts:68-114` models the real read-committed ordering with two connections. It is correctly protected by the isolated-database sentinel, although the current environment could only discover/skip it.

The deletion test is favorable: deleting `active-item-write.ts` would force the concurrency invariant back into three callers. Its small interface therefore has useful depth and leverage.

## Earlier must-fix recheck

| Finding | Result | Evidence |
|---|---|---|
| Label history absent/non-atomic | **Resolved** | Manual and regenerated labels write the item, item event, and global audit in one transaction in `actions.ts:350-395` and `:458-504`; detail timeline loads item events in `queries.ts:getWorkOrderDetail`. |
| Mutable job-number identity fallback | **Resolved** | `servicem8-sync.ts:toWorkOrderSyncInput` requires the ServiceM8 job UUID and emits only `servicem8_uuid`. |
| Detail page omitted item records | **Resolved** | `queries.ts:getWorkOrderDetail` loads active and removed items; `[id]/page.tsx:WorkOrderDetailPage` renders the Work Order Items section. |
| Config option IDs were not checked active | **Resolved** | `actions.ts:assertActiveWorkOrderItemOption` verifies installer, stage, and hardware membership and active state. |
| Unsafe acceptance database targeting/cleanup | **Resolved statically** | Exact 32+ character database sentinel verification precedes setup; cleanup is scoped/restorative in `tests/e2e/work-orders.spec.ts`. Execution remains a gate evidence gap. |
| CSV spreadsheet formula injection | **Resolved** | `lib/audit-export.ts:safeSpreadsheetText` neutralizes formula and control prefixes before quoting, with hostile regression cases. |
| TypeScript blockers and tracked debug artifact | **Resolved** | Web/DB typechecks pass; tracked root `debug.log` is deleted. |
| User-approved bulk apply removal | **Accepted scope change** | Commits `c5f58eb4` and `11363fec` removed the capability; component and E2E assertions keep it absent. |

## Should-fix / release follow-up

1. **Bound the external and high-cost paths.** Cursor exhaustion is correct, but `actions.ts:930-962` has no page/time budget; `actions.ts:184-338` still performs serial per-job/per-item writes; `item-label-lifecycle.ts:23-54` generates labels serially. Omerta also found no refresh/AI single-flight or throttling and no bounded/streamed CSV export. Add provider abort timeouts, a defensible page ceiling, single-flight/throttle controls, export bounds, and representative performance measurements.

2. **Improve AI error and retry UX.** `WorkOrderItemsSummary.tsx:211-227` submits regeneration through a plain server-action form without the pending/success/actionable-error/retry interface used by manual and operational edits. `item-labels.ts:37-40` also includes the raw provider response body in its thrown error. Translate provider failures safely and expose the same retryable user state.

3. **Define data retention and privileged-event logging.** Full raw ServiceM8 snapshots remain persisted without a documented minimization/retention policy, and refresh actor/denied privileged attempts are not recorded. These are current Omerta medium/low findings.

4. **Stage the release scope deliberately.** `.gitignore:56-57` adds broad `.publish-the-godfather/` and `plugins/` exclusions outside MT-192/MT-199 and the repair contract; `plugins/` could hide future repository code. Exclude or separately justify those lines. The Nodemailer/`ws` upgrades, SMTP file/URL hardening, storage-test typing repair, and `debug.log` deletion are traceable gate repairs.

5. **Clear or formally accept the remaining production advisories.** The current Omerta audit records 0 critical/high, 2 moderate, and 1 low. This is not a newly introduced high-severity code-review finding, but strict security sign-off remains FAIL until remediated or accepted through the project's risk process.

## Architecture axis - PASS with concerns

- **Maintainability:** normalization, label lifecycle, child filtering, export shaping, pagination, and conditional active writes have coherent module locality and small interfaces.
- **Scalability:** parent-first pagination avoids joined-row multiplication; complete provider pagination is now correct. Serial reconciliation/AI work and missing timeout/page/export budgets remain concerns.
- **Performance:** no accidental O(n^2) path was found in the reviewed delta, but no representative refresh/export measurement exists. Keep this as release evidence debt rather than claiming performance readiness.

## Standards axis - PASS with concerns

- Guard clauses, business naming, strong types, parameterized Drizzle operations, provider adapters, useful permission/state errors, and boundary validation are present.
- Decisions and side effects are separated at useful seams: source normalization, label lifecycle, list filtering, export shaping, pagination, and active conditional writes are independently testable.
- The remaining provider failure UX, time/size bounds, retention, and security logging gaps are documented above and in the Omerta artifacts.

## Specification axis - PASS

- The grouped parent/child dashboard, stable identities, item-level operational ownership, configured editability, search/filter behavior, item-row export, item detail/timeline visibility, removed/restored data, and safe formula export match the contract and recorded user-approved bulk-apply removal.
- The two previously unfulfilled core invariants now hold in code: every required ServiceM8 cursor page is collected before destructive reconciliation, and active state is part of the item write itself.
- The protected Playwright and real database concurrency journeys remain unexecuted because the dedicated migrated sentinel database is unavailable. That keeps the validation gate RED but is not an unresolved code-review must-fix.

## Exit verdict

**APPROVED for the Enforcer review axes.** This is not release approval: `gate.md` remains RED for missing sentinel-backed runtime evidence, strict Omerta failures, dependency acceptance/remediation, and dirty-scope cleanup.
