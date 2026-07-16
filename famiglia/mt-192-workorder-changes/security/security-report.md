# Security report - mt-192-workorder-changes

- Stack: Node.js / Next.js 16 / React 19 / Drizzle PostgreSQL
- Mode: retrofit, full
- Date: 2026-07-16
- Reviewed commit: `73c3e84341c268ceb335b5a1f342b33685959916` plus current dirty MT-192 repair/evidence delta
- Standards: OWASP Top 10:2021 and OWASP ASVS 4.0 Level 2
- Verdict: **PASS**

## Executive summary

All applicable security checks pass. Server-side grants protect refresh/edit/configuration boundaries; ServiceM8 reconciliation is complete and bounded; item writes require an active row at update time; external calls time out; refresh/AI abuse controls are durable; export is bounded and formula-neutralized; raw snapshots are removed; retention is implemented behind a protected weekly cron; and the production dependency audit is clean.

The isolated two-connection race and authenticated browser journey now pass. No High/Critical issue or other applicable failing check remains.

## Explicit checks 9-12

| Check | Result | Evidence |
|---|---|---|
| Authentication | PASS | NextAuth route/session boundaries plus an authenticated real-browser journey |
| Authorization | PASS | Direct Manage enforcement and View/Manage/Configure permission suites |
| Input/output validation | PASS | UUID/options/labels/cursors/provider output/CSV/export limits |
| Logging/auditing | PASS | Item events, refresh actor/result, and denied-attempt audit without secret output |
| Secrets handling | PASS | Environment-backed credentials; credential-like diff scan returned zero |

## OWASP Top 10:2021

| Category | Result | Evidence |
|---|---|---|
| A01 Broken Access Control | PASS | Server-side grants and active-resource predicates |
| A02 Cryptographic Failures | PASS | Environment secrets and production HTTPS provider enforcement |
| A03 Injection | PASS | Bound SQL/ORM input, allow-lists, React encoding, CSV neutralization |
| A04 Insecure Design | PASS | Complete atomic refresh, durable coordination, bounded providers/export, retention |
| A05 Security Misconfiguration | PASS | Fail-closed test sentinel and protected cron endpoint |
| A06 Vulnerable Components | PASS | Fresh production audit: zero advisories |
| A07 Authentication Failures | PASS | NextAuth plus authenticated journey and direct mutation guards |
| A08 Data Integrity | PASS | Stable UUIDs, conditional writes, atomic history, restorative reconciliation |
| A09 Logging/Monitoring | PASS | Attributable refresh/edit/denial events and documented cron signals |
| A10 SSRF | PASS | Provider bases are configuration-controlled and HTTPS-required in production |

## ASVS 4.0 Level 2

V1-V11 and V13-V14 are PASS for the code-verifiable controls in scope. V12 Files/Resources is N/A because MT-192 adds no upload feature. Deployment-time cron secret presence and post-deploy monitoring confirmation remain release-readiness checks, not code-security failures.

## Verification summary

- Full web: 137 files passed, 3 skipped; 826 tests passed, 17 skipped.
- Real database race: 1 passed.
- MT-199 Chromium acceptance: 1 passed.
- Refresh measurements: 2.545s, 4.778s, 3.289s; export: 3.298s.
- Web/DB typecheck, lint, build, migration consistency, diff check, and production dependency audit pass.
