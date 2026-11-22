# Changelog

## Unreleased

- Handle older Kanban job-level snapshots containing combined abbreviated material lists. Show each original abbreviation as its own preview control while retaining full billing descriptions and source publication identities unchanged.

- Group Work Orders Table B by source job UUID, keeping each billing item separate inside Materials with the established product abbreviations and its own hover, keyboard and tap preview. Search retains complete matching jobs; pagination counts jobs. Preserve the eleven columns, billing-line publication identities and history. Pending deployment.

- Install and publish RG-409's Kanban billing-line split. Table B now uses one row per eligible billing line with stable jobmaterial identities, keeping its 11 columns, search, independent pagination and material previews. Preserve Table A's five columns and job-level planning values. Support long descriptions across PDF pages with the default renderer. The first Production snapshot was verified at 50 Work Order rows and 64 billing-item rows; identical retry deduplicated. Both existing refresh routines require the identity-preserving collector. No receiver runtime/schema change was needed.

- Reconcile dev with the released Kanban publisher, defer the canceled app-side assessment changes, and allow later migrations in the Quote Movement registry check.

- Connect the Work Orders dashboard directly to Kanban bot through authenticated complete publications, atomic snapshots and server-derived row/field history in existing settings/audit tables. Preserve strict read-only columns, search, independent pagination and material previews. Request update acknowledges dispatch; visible pages update when a publication arrives. No schema migration or new dependency is required; existing operational records remain separate.

- Assess installation/delivery evidence on each Work Orders source refresh, cache unchanged results, and show per-product AI suggestions with source quotes. Preserve staff dates and manual inclusion priority; add migration 0073 for separate assessment metadata.

- Explain products missing three-week planning dates and show compact Materials descriptions with full hover, keyboard and tap previews.

- Match the Work Orders prototype's five Table A columns and eleven Table B columns, add audited Bottle strut/BC fields and N/A, and use shared pagination with independent page-size controls.

- Group dashboard views under Dashboard while retaining the main dashboard as the landing page.
- Reuse Job Progress as Roxy Dashboard, protected server-side for Admins or the configured stable Roxy user ID.
- Reuse Quote tracking at /dashboard/quotes and preserve legacy overview URLs and query parameters.
- Add all-staff Work Orders product planning, audited manual readiness fields, stale-save protection and GET-only ServiceM8 reconciliation.
- Add migration 0072 for product dashboard state/revision, a read-only legacy import preview, and isolated database/browser acceptance coverage.
