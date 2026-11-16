# Changelog

## Unreleased

- Match the Work Orders prototype's five Table A columns and eleven Table B columns, add audited Bottle strut/BC fields and N/A, and use shared pagination with independent page-size controls.

- Group dashboard views under Dashboard while retaining the main dashboard as the landing page.
- Reuse Job Progress as Roxy Dashboard, protected server-side for Admins or the configured stable Roxy user ID.
- Reuse Quote tracking at /dashboard/quotes and preserve legacy overview URLs and query parameters.
- Add all-staff Work Orders product planning, audited manual readiness fields, stale-save protection and GET-only ServiceM8 refresh without AI enrichment.
- Add migration 0072 for product dashboard state/revision, a read-only legacy import preview, and isolated database/browser acceptance coverage.
