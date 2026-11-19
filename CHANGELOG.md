# Changelog

## Unreleased

- Replace the dashboard's Google board/receipt reader with an authenticated direct Kanban publisher. Atomically store complete snapshots and server-derived row/field history in existing settings/audit tables, with stable identities, duplicate/conflict/stale protection and bounded payloads. Preserve exact table columns, search, pagination and materials. Request update acknowledges dispatch without completion polling; visible tabs check the stored publication version. Publisher secret and bot delivery setup remain deployment steps; no migration or rate-limit feature is added.

- Keep checking the same Kanban refresh request when its completion receipt cannot be read, rather than re-enabling Refresh as though the bot had stopped. Distinguish an unconfirmed check from an explicit bot failure, retain the five-minute monitoring window, and show safe guidance for Sheet access/range problems without automatically retriggering the bot.

- Replace the Kanban reader's service-account private key with keyless Vercel OIDC and Google Workload Identity Federation, impersonating the nominated reader with final Drive-readonly and Sheets-readonly scopes. Keep the organization key-creation policy enabled; require current OIDC availability before starting a bot refresh. Cloud trust and bot configuration remain external setup steps.

- Connect the Work Orders dashboard to the Kanban bot's existing generated HTML board through a fixed read-only Drive file download, preserving automatic findings that the Sheet's manual columns omit. Extract text only with exact table schemas, retaining the columns, source values/membership, search, independent pagination and material preview. Add an authenticated explicit Refresh trigger with request-matched completion/no-change receipts in the Sheet, bounded waiting and safe failure states. File/identity access, bot webhook and receipt publishing still require setup; no editing, independent AI, database migration or rate-limit feature is introduced.

- Temporarily clear displayed Work Orders rows while keeping both table column sets and controls; leave stored records unchanged.

- Reset the Work Orders dashboard to the two requested PDF table schemas, with blank planning cells. Retain saved job/material rows, search, independent pagination and material hover/focus/tap previews; remove assessment/refresh/editor controls from this page without deleting stored data.
- Reset the Work Orders dashboard to the two requested PDF table schemas, with blank planning cells. Retain saved job/material rows, search, independent pagination and material hover/focus/tap previews; remove assessment/refresh/editor controls from this page without deleting stored data.
- Simplify Work Orders field displays to values with optional Details. Accept sourced Client waiting for summaries from expected work and unresolved requests, including the Q250082 installation/variation wording, without requiring literal waiting-for phrases. Preserve staff edits and clears.

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
