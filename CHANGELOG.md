# Changelog

## Unreleased

- Display current automatic and protected staff operational values consistently in Work Orders planning, with field evidence, source coverage, assessment state and ownership. Keep requirements separate from issuance, readiness separate from expected dates, consent status separate from its reference, and generated gaps separate from staff Notes. Preserve draft values/modes and changed-field saves through assessment updates and row removal.

- Add durable Work Orders assessment runs after one source refresh, with automatic visible-tab continuation, reload recovery, bounded retries and lease recovery. Show assessment progress separately from source freshness, pause new batches for unsaved drafts, and reject stale worker publication. Add migration 0074 for run/work state.

- Extend Work Orders refresh to validate and store evidence-backed operational-field assessments alongside compatible date results. Read only allowlisted custom-field text, record unsupported coverage, mask configured installer identities, invalidate cache on relevant evidence/inventory changes and reject stale assessment writes. Staff ownership and canonical manual fields stay protected.

- Add per-field automatic/staff ownership to Work Orders product planning. Preserve deliberate blank/Unknown choices and legacy stored values, apply only edited fields, and audit date/installer ownership across both screens. Explicit return to automatic clears the saved manual date/assignment while retaining history; broader operational-field AI assessment remains later work.

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
