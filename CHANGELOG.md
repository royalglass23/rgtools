# Changelog

## Unreleased

- Match Kanban Master Y/N/? flags with an audited, exact-match import; products inherit job flags while keeping independent overrides and readiness. Repair AI product identity responses and complete-history limits behind failed assessments.

- Fix three-week assessment rejecting yearless dates in dated notes/emails; validate nearby source-year dates and year rollover, invalidate old rule caches, and surface assessment failures with safe retry details.

- Assess installation/delivery evidence on each Work Orders source refresh, cache unchanged results, and show per-product AI suggestions with source quotes. Preserve staff dates and manual inclusion priority; add migration 0073 for separate assessment metadata.

- Explain products missing three-week planning dates and show compact Materials descriptions with full hover, keyboard and tap previews.

- Match the Work Orders prototype's five Table A columns and eleven Table B columns, add audited Bottle strut/BC fields and N/A, and use shared pagination with independent page-size controls.

- Group dashboard views under Dashboard while retaining the main dashboard as the landing page.
- Reuse Job Progress as Roxy Dashboard, protected server-side for Admins or the configured stable Roxy user ID.
- Reuse Quote tracking at /dashboard/quotes and preserve legacy overview URLs and query parameters.
- Add all-staff Work Orders product planning, audited manual readiness fields, stale-save protection and GET-only ServiceM8 reconciliation.
- Add migration 0072 for product dashboard state/revision, a read-only legacy import preview, and isolated database/browser acceptance coverage.
