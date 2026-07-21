# Security report — mt-192-workorder-changes

- Stack: Node.js / Next.js 16 / React 19 / Drizzle PostgreSQL
- Stack source: `famiglia/profile.json` (`marker:package.json`)
- Mode: retrofit, full
- Date: 2026-07-15
- Reviewed commit: `e2c167aad9f7a77851c548afd3d33b5f7efd0224` plus current dirty repair delta
- Standards: **OWASP Top 10:2021** and **OWASP ASVS 4.0 Level 2**
- Verdict: **FAIL**

## Executive summary

The latest repairs retire all three stale High/Medium code findings. The registered refresh implementation now authorizes Manage itself. Every required ServiceM8 dataset follows cursor pages through `x-next-cursor` exhaustion and rejects repeated cursors before reconciliation. Manual, operational, and regenerated-label writes share an active-row conditional UPDATE with `RETURNING`, so a concurrent removal fails before event/audit writes.

Current focused security tests pass 84/84. The real two-connection race test and Playwright journey remain safely skipped because the required isolated sentinel database is unavailable.

The strict Omerta verdict remains FAIL with no open High/Critical: expensive provider/export paths lack complete rate/timeout/size controls; the live production audit still has 2 moderate and 1 low advisory; raw ServiceM8 snapshots lack minimization/retention; refresh/denial security attribution is incomplete; and OpenAI error handling retains raw provider response text.

## Explicit checks 9–12

| Check | Result | Evidence |
|---|---|---|
| 9. Authentication | PASS (static/unit) | NextAuth/proxy, export guard, action permission tests; no live forged/expired session test |
| 9. Authorization | PASS | Every public Work Order mutation, including directly registered refresh implementation, checks Manage/Configure as appropriate |
| 10. Input/output validation | PASS with residual | Cursor-page/row/UUID/option/date/label/CSV checks pass; provider duration and export size unbounded |
| 11. Logging/auditing | **FAIL** | Item history is atomic/attributed; refresh runs lack actor and denied privileged attempts are not security-logged |
| 12. Secrets handling | PASS | Environment-backed credentials; no real secret found; SMTP file/URL access disabled |

## OWASP Top 10:2021

| Category | Result | Evidence |
|---|---|---|
| A01 Broken Access Control | PASS | Direct registered refresh boundary and item/config actions enforce server-side grants |
| A02 Cryptographic Failures | PASS with operational assumptions | Production provider URLs require HTTPS; credentials are environment-backed |
| A03 Injection | PASS | Drizzle binding, encoded cursors/filters, React encoding, and CSV formula neutralization |
| A04 Insecure Design | **FAIL (Medium)** | No complete single-flight/rate/timeout/page-budget/export-size design |
| A05 Security Misconfiguration | PASS with low residual | Debug artifact deleted; recurrence ignore and broader CSP/header posture remain follow-ups |
| A06 Vulnerable and Outdated Components | **FAIL (Medium)** | Live audit: 0 critical/high, 2 moderate, 1 low |
| A07 Identification and Authentication Failures | PASS (static) | NextAuth JWT session plus DB-backed grants; no live forged/expired-token proof |
| A08 Software and Data Integrity Failures | PASS | Full pagination before transaction; stable UUIDs; atomic active-write and audit preconditions |
| A09 Security Logging and Monitoring Failures | **FAIL (Medium/low)** | Refresh actor/denial events missing |
| A10 SSRF | PASS | Provider base URLs are environment-controlled and HTTPS-required in production |

## OWASP ASVS 4.0 Level 2

| Chapter | Result | Evidence |
|---|---|---|
| V1 Architecture | PASS | Current trust-boundary threat model |
| V2 Authentication | PASS (inherited/static) | Environment secrets and repository auth helpers |
| V3 Session Management | PASS (inherited/static) | NextAuth JWT, four-hour max age |
| V4 Access Control | PASS | Server-side per-action grants and active-resource write predicate |
| V5 Validation, Sanitization and Encoding | PASS | Cursor/row/UUID/enum/date/option/output/CSV checks |
| V6 Stored Cryptography | N/A / operational | No feature cryptography; DB-at-rest control is hosting-owned |
| V7 Error Handling and Logging | **FAIL** | Missing refresh/denial attribution; raw OpenAI body in thrown error |
| V8 Data Protection | **FAIL** | Open-ended raw snapshot and no retention/deletion policy |
| V9 Communications | PASS | HTTPS required for production ServiceM8/OpenAI overrides |
| V10 Malicious Code | **FAIL** | Applicable moderate/low dependency advisories remain |
| V11 Business Logic | **FAIL** | Missing single-flight, rate, timeout, page-budget, and export-size controls |
| V12 Files and Resources | N/A | No upload/storage feature; CSV download only |
| V13 API and Web Service | **FAIL** | AuthZ/validation pass; expensive endpoints/actions lack abuse controls |
| V14 Configuration | PASS with residual | Env secrets and fail-closed E2E config; CSP/header hardening is repository-wide |

## API/database/provider review

- Export requires Work Orders view access, parses allow-listed filters, and neutralizes formula cells; it remains unbounded/in-memory.
- Refresh authorizes at wrapper and implementation boundaries, follows all ServiceM8 cursors, validates pages, and opens the transaction only after complete accumulation.
- ServiceM8 uses the read-only key, production HTTPS, retry backoff, static paths, and cursor loop detection; no abort timeout or maximum unique-page budget exists.
- OpenAI uses environment config, production HTTPS, and strict one-line/160-character output; no timeout/throttle and raw error body remains.
- Drizzle expressions are parameterized; no concatenated SQL/`sql.raw` found in scope.
- Reconciliation and label history are transactional. Conditional active writes require `id + is_active=true` and verify one row via `RETURNING`.
- Single-organisation application: cross-tenant isolation is N/A. Database least privilege is operational and not source-verifiable.

## Security-test status

Current focused run: **5 files / 84 tests passed**. Sentinel-protected DB integration: **1 skipped**. Latest complete web evidence: **810 passed, 17 skipped, 0 failed**. The browser journey is blocked by missing isolated DB configuration, not by an unsafe harness.

## Compliance

The profile declares no compliance framework. Personal data still warrants a separate NZ Privacy Act operational review.
