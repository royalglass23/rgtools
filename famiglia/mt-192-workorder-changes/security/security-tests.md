# Security tests - mt-192-workorder-changes

- Date: 2026-07-16
- Browser framework: Playwright 1.61.1
- Verdict: **PASS**

| Control | Evidence | Result |
|---|---|---|
| Direct refresh authorization | `actions-permissions.test.ts` rejects callers without Manage before provider/database work | PASS |
| View/Manage/Configure separation | permission, server-page, detail-page, and component suites | PASS |
| Forged/invalid input | field names, UUIDs, options, dates, labels, cursors, and generated output tests | PASS |
| Provider abuse bounds | 25-page cap, repeated-cursor rejection, 30-second ServiceM8/OpenAI/attachment timeouts | PASS |
| Durable abuse controls | refresh/label leases and per-user refresh/AI windows at SQL seam | PASS |
| Active-resource race | sentinel-protected two-connection integration test | PASS |
| CSV injection and size abuse | hostile formula/control prefixes, quoting, and 10,000-row/413 tests | PASS |
| Test target isolation | strong sentinel, distinct-host check, scoped fixture cleanup | PASS |
| Retention endpoint authentication | missing/wrong bearer secret returns 401; matching secret executes cleanup | PASS |
| Authenticated acceptance | MT-199 Playwright journey with real session and isolated database | PASS |
| Accessibility semantics | named heading/groups/controls and programmatic keyboard focus in Chromium | PASS |
| Automated accessibility rules | axe WCAG 2.0/2.1 A/AA scan | PASS: zero violations after disabled-pagination contrast repair |
| Runtime budgets | three refreshes below 30s; export below 10s | PASS |
| Dependency audit | fresh `pnpm audit --prod --json`: 0 at all severities | PASS |

Full post-repair regression evidence: 137 web files passed and 3 skipped; 826 tests passed and 17 skipped. The skips are unrelated environment-gated suites, not MT-192 failures. Axe 4.12.1 is installed and its authenticated Work Orders scan reports zero WCAG 2.0/2.1 A/AA violations.
