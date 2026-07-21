# Changelog

All notable changes to rgtools are recorded here, grouped by release.

---

## [Unreleased]

### Removed
- Removed the legacy editable scoring admin UI, obsolete scoring seed scripts, and retired spreadsheet intake surface. Lead intake now uses the hardcoded Decision Matrix as the single scoring source of truth.

### Documentation
- Added a [Security Policy](SECURITY.md) and a developer [security runbook](dev/security.md) covering reporting, environment separation, secrets, access control, quote data handling, retention, and incident response.
- Updated the [Leads how-to](how-to/leads.md), ServiceM8 developer notes, and RG Leads manual checklist for the Quote-status lead workflow.
- Expanded the README docs index so current developer, user, domain, DNS, ServiceM8, security, and admin docs are easier to find.
- Added a staff [Client records how-to](how-to/clients.md) for client list/detail use and admin merge review.
- Updated setup and deployment docs for current environment variables, AI guidance configuration, tracking seed data, ServiceM8 webhook registration, R2 dev/prod separation, and Worker secrets.
- Updated architecture and quote-tracking docs to describe AI guidance, privacy surfaces, gate proof enforcement, current worker routes, client merge tooling, and security boundaries.

### Changed
- Repo is now a pnpm monorepo: the internal Next.js app moved to `apps/web`, the shared Drizzle schema/client moved to `packages/db`, and root scripts now delegate to workspace packages.
- Vercel deployment is scoped to the internal app at `apps/web`; `apps/web/vercel.json` only enables automatic deployments for `main` and `dev`.
- Production migrations can now run through `pnpm db:migrate:prod` using `DB_URL_PROD`, without changing `.env.local`.
- Tests are split between root workspace guardrail tests and the `@rgtools/web` app test suite.
- Dashboard KPI cards now focus on active tracked quotes: tracked quote value, active tracked quote count, hot/warm quote count, and viewed quote count.

### Added
- **Work Order Item label lifecycle** - new ServiceM8 item lines receive concise OpenAI production labels after reconciliation; failed generation falls back safely, Manage users can correct or deliberately regenerate labels, and manual wording is preserved when source descriptions change.
- **Admin-only Clients v1 cleanup release** - ServiceM8 company/client import, canonical/source client identity metadata, aliases, cleanup filters, dashboard editing, duplicate dismissal/merge, grouped client detail sections, recent activity, audit/error logging, and release rollback notes for MT-176.
- **PS Generator foundation** - `ps-generator` module routes, navigation, generate API, published configuration read model, seed data, PDF filling engine, and tests for PS1/PS3 package generation.
- **PS Generator configuration schema** - migration 0026 adds systems, option categories/values, system option rules, template variants, field mappings, description templates, generation records, generated PDF object records, audit entries, and migration records.
- **Work Orders portal-safe timeline candidates** - Work Order timeline events now default to internal visibility, while manage users can store separate customer-safe title/message copy for future client portal updates.
- **Catalog app placeholder** - `apps/catalog` is now a workspace app ready for the future public catalog.
- **Quote Tracker dashboard** - the `quote-tracker` module is now a full staff-facing feature. Includes:
  - List page at `/quote-tracker` with KPI cards, status/search filters, and a **Track Quote** button in the page header.
  - Track Quote modal and server action that pull the ServiceM8 PDF, store it in R2, mint a short link, and return client/job/link/expiry details.
  - Recreate guard that returns the existing link while a live tracked quote already exists for the job.
  - Quote detail presentation extracted into shared presentation helpers.
- **Email gate** - quotes can require a recipient email before the PDF loads, backed by `quote_recipients` and `quote_viewer_emails`.
- **Viewer analytics** - per-session and per-recipient engagement, including per-page time breakdowns.
- **Open notifications** - `rg-notifier` worker sends first-open and high-interest emails through Resend.
- **Cleanup cron** - `rg-cleanup` deletes expired quote PDFs from R2, archives rows, and purges raw IPs after 90 days.
- **Viewer worker** - `workers/viewer` serves the PDF.js viewer and email gate from R2.
- **Configurable dashboard tables** - dashboard table registry and admin editor.
- `pnpm quote:create` - creates a tracked quote in the database from a ServiceM8 job, with optional expiry.
- Tracking Settings admin page at `/admin/tracking`.
- Docs: staff [Quote Tracker how-to](how-to/quotes.md), [PS Generator how-to](how-to/ps-generator.md), and [quote-tracking privacy note](dev/quote-tracking.md).
- Quote Tracker AI Guidance: conversation snapshots, staff-facing next viable move recommendations, email draft copy support, phone talking points, failure cooldowns, and stale/fresh snapshot display on quote detail pages.
- Client record workflows: canonical client pages, query helpers, client resolver, merge planning, admin merge review, cleanup script, and quote-client backfill script.
- Public quote viewer privacy surfaces at `/privacy` and in-viewer privacy/cookie notices.
- Shared ServiceM8 REST client and short-code utilities for quote tracking scripts and modules.
- Quote pull, preview, and share scripts for local testing.
- Inbox message fallback for ServiceM8 lead fetch when the date-filtered job search misses a converted inbox job.

---

## [0.5.0] - 2026-06-09

### Added
- Leads dashboard at `/leads` with paginated list, tier/SM8/date filters, client/job/project columns, score, status, and completeness.
- Lead detail page at `/leads/[id]` with scored fields, score summary, and ServiceM8 section.
- **Fetch from ServiceM8** button to search for the `RGTools Lead {uuid}` reference, store job UUID/status, and set the Leads Quality custom field on first link.
- Bulk delete from the leads list for admins.
- Soft-delete per lead from the detail page for admins.
- Edit button on detail page routes to `/lead-intake?leadId=...`.
- `servicem8_status` column added to `leads` table.

### Fixed
- SM8 **Pending** filter now correctly returns synced leads that do not yet have a ServiceM8 job UUID.
- Invalid non-UUID `[id]` paths now return a clean 404.
- ServiceM8 fetch API route status code now narrows the union type correctly.
- `batchDeleteLeadsAction` auth failure now throws consistently with `deleteLeadAction`.

---

## [0.4.0] - 2026-06-09

### Added
- ServiceM8 sync: lead intake pushes new leads directly to the ServiceM8 inbox via SMTP.
- Amber review note displayed on `ScorePanel`, result banner, and persisted to DB.
- Strike layer in scoring engine for blocker-low answers.
- Scoring config v3 seeded with updated point values and strike weights.

---

## [0.3.0] - 2026-06-08

### Added
- Driving distance auto-computed via Google Distance Matrix API when a job address is selected.
- Distance band displayed in the intake form with point preview.
- Distance category added to scoring engine and scoring config v2.
- `ScorePanel` reflects computed distance in real time.

### Fixed
- Distance resets correctly when Job Address is cleared.
- Dropdown option order preserved via `optionOrder`.
- Google Maps loader lazy-loaded to prevent SSR `window` errors.
- Separate server key used for Distance Matrix to avoid client-key exposure.

---

## [0.2.0] - 2026-05-30

### Added
- Lead intake v1 with staff form, real-time score panel, and config-driven scoring.
- Versioned scoring config stored in `scoring_config_versions`.
- Google Places autocomplete for NZ job addresses.
- Lead deduplication by normalised phone or email.
- Audit log entry on every lead create/update.
- Scoring config v1 seeded.

### Changed
- Codebase reorganised into `modules/` feature folders.

---

## [0.1.0] - 2026-05

### Added
- Next.js app with NextAuth credential login, admin/staff roles, dashboard, quote pipeline, quote engagement tracker, Drizzle schema, module access control, and admin tools.
