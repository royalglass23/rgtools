# Security sign-off — mt-192-workorder-changes

- Stack: Node.js / Next.js (`famiglia/profile.json`, source `marker:package.json`)
- Mode: retrofit, full
- Date: 2026-07-15
- Reviewed-commit: `e2c167aad9f7a77851c548afd3d33b5f7efd0224` plus current dirty MT-199 repair delta
- Standards: OWASP Top 10:2021; OWASP ASVS 4.0 Level 2
- Verdict: **FAIL**
- Open High/Critical: **none**

## Fixed findings retired

1. **Registered refresh authorization — PASS.** `refreshWorkOrdersFromServiceM8` enforces Manage access before provider/DB work; direct-invocation negative test passes.
2. **ServiceM8 completeness — PASS.** All required datasets follow `cursor=-1` and `x-next-cursor` until absent; repeated cursors fail before transaction.
3. **Atomic active write — PASS.** Manual/operational/AI writes require `id + is_active=true` and `RETURNING`; zero rows fail before history/audit.

## Current checklist

| Check | Result | Notes |
|---|---|---|
| Authentication | PASS (static/unit) | No live forged/expired-session test |
| Authorization | PASS | Public actions and registered refresh boundary enforce grants |
| Input/output validation | PASS with residual | Pagination, resource, option, label, and CSV checks pass; size/duration boundaries remain |
| Database/transactions | PASS | Parameterized Drizzle; atomic reconciliation/history; active-row conditional UPDATE |
| ServiceM8 boundary | PASS with residual | Complete cursor traversal and loop rejection; no timeout/page budget |
| OpenAI boundary | **FAIL** | No timeout/throttle; raw response body included in error |
| Logging/auditing | **FAIL** | Item history repaired; refresh actor and denied-attempt logs absent |
| PII/minimization | **FAIL** | Full raw upstream object retained without policy |
| Provider secrets | PASS | Environment-backed; no real secret in repaired diff |
| Test isolation | PASS (static), execution blocked | Exact sentinel and scoped cleanup; real journey not run |
| Dependencies | **FAIL** | Live audit: 0 critical/high, 2 moderate, 1 low |
| Abuse controls | **FAIL** | No refresh single-flight/throttle, provider timeout, page budget, or export cap/stream |
| Security tests | **FAIL / evidence gap** | 84/84 focused pass; live DB race and Playwright skipped; abuse tests absent |

## Current prioritized blockers

1. Medium — implement refresh/AI single-flight or throttling, provider abort timeouts/page budget, and bounded/streamed export.
2. Medium — clear or formally accept the remaining 2 moderate and 1 low production advisories.
3. Medium — minimize raw ServiceM8 snapshots and define retention/deletion.
4. Medium/low — actor-attribute refreshes and log denied privileged actions safely.
5. Medium/low — redact raw OpenAI provider error bodies.
6. Evidence — run the sentinel-protected DB concurrency and Playwright tests.

OWASP Top 10:2021 remains FAIL for A04, A06, and A09. ASVS 4.0 L2 remains FAIL for V7, V8, V10, V11, and V13. Under Omerta's rule, any applicable FAIL keeps the overall verdict **FAIL**, even with no High/Critical finding.
