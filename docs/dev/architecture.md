# Architecture overview

RG Tools is an internal Royal Glass operations system. The repository is a pnpm workspace with a
Next.js staff application, a placeholder public catalog, a shared Drizzle database package, and
four separately deployed Cloudflare Workers.

## Workspace boundaries

| Path | Responsibility |
| --- | --- |
| `apps/web` | Authenticated staff application and server actions/API routes |
| `apps/catalog` | Placeholder public catalog application on port 3001 |
| `packages/db` | Shared PostgreSQL schema, migrations, and database client |
| `workers/viewer` | Public quote PDF viewer and optional email gate |
| `workers/tracker` | Public quote engagement beacon endpoint |
| `workers/notifier` | Quote engagement notification cron |
| `workers/cleanup` | Quote and personal-data cleanup cron |

The root `package.json` exposes the common web, database, seed, quote, client, and test commands.
Worker commands are scoped to the individual Worker package.

## Application modules

The authenticated web app groups business logic under `apps/web/modules`:

- `dashboard` provides the operations overview, action queues, charts, and configurable tables.
- `job-progress` reads ServiceM8 jobs and future bookings for an admin-only register. Its period
  selector filters by job record edit date, while the next booking remains the earliest scheduled
  future activity. It does not read complete Diary history or verify follow-up ownership.
- `lead-intake` captures and scores enquiries and synchronises eligible records with ServiceM8.
- `leads` provides lead search, details, ServiceM8 status, and follow-up context.
- `clients` provides canonical RG Tools client records, links, and merge review.
- `quote-tracker` creates tracked quote links, stores engagement, and manages viewer settings.
- `quote-movement` retains ServiceM8 Quote evidence and shows source coverage and summaries.
- `work-orders` reconciles active ServiceM8 Work Order jobs and stores RG-owned operational
  enrichment, item labels, production specifications, and timeline events.
- `ps-generator` generates PS1/PS3 packages from published configuration and stored templates.
- `admin` controls users, role access, settings, table configuration, pricing, and audit exports.

The main routes are grouped under `apps/web/app/(dashboard)`. Route protection is applied by the
dashboard layout and module guards; a signed-in user still needs access enabled for their role.

## Data ownership

Neon PostgreSQL is the durable application store. Drizzle schemas are split by domain in
`packages/db/src`, and SQL migrations live in `drizzle/migrations`.

ServiceM8 remains the source of truth for ServiceM8 job identity, status, and source fields. RG
Tools stores retained context and RG-owned enrichment so staff can work with lead, quote, client,
and Work Order information in one place. A Work Order refresh may update ServiceM8-owned fields,
but must preserve RG-owned stage, installer, hardware status, dates, risk, importance, notes,
manual corrections, and timeline history.

Quote PDFs and generated Producer Statement PDFs use the storage adapter in
`apps/web/lib/storage`. Local development can use the local adapter; deployed environments use
Cloudflare R2. The public viewer and tracker Workers read only the data they need through their
configured secrets.

## Authentication and authorization

NextAuth v5 uses credential login, JWT sessions, and a four-hour session lifetime. Users have an
`admin` or `staff` role. Role Access controls which active tool groups each role can use. New staff
inherit the Staff settings immediately. PS Generator configuration/publishing and Work Order
configuration require Admin; Work Order operational management follows Work Orders role access.
Historical `user_module_access` rows are retained for compatibility but are no longer consulted or
written.

Server actions and API routes are expected to enforce both authentication and the relevant module
or operation permission. Audit records are retained for sensitive administrative, access, lead,
client-merge, quote, and Work Order changes.

## Important workflow boundaries

- The Quotes navigation label opens the tracked quote activity dashboard. It reads bounded event
  and engagement summaries from `quotes`, `quote_events`, and `quote_engagement`; the separate
  submenu retains Quote Movement and Track Quotes. The overview is protected by the existing
  Quotes role access and displays no raw viewer identity.
  Progress counts and values use one aggregate query with shared `quoteProgressWhere` predicates
  for the overview and Track Quotes activity filters. Each nonarchived quote in the creation
  period belongs to one bucket: active/unresolved by lifetime opens and three-day age, or Won/Lost
  regardless of link expiry. The cards and attention lists retain active/unresolved scope.
- Quote Movement is a staff monitoring surface, not a ranking engine or ServiceM8 write-back
  workflow. It retains source evidence and reports incomplete coverage explicitly.
- Work Orders initially reads active ServiceM8 jobs in `Work Order` status. RG Tools does not
  silently write operational changes back to ServiceM8.
- AI guidance and Production Specification enrichment are advisory or draft-producing features;
  staff review and confirmation remain required for operational outcomes.
- Provider absence is not proof of absence. Missing or incomplete evidence should remain visible as
  an uncertainty or needs-checking state.

## Change flow

1. Change domain logic under `apps/web/modules` and shared schema under `packages/db/src` only
   when the data model requires it.
2. Add or update focused tests beside the affected module.
3. For schema changes, run `pnpm db:generate`, inspect the SQL, and run `pnpm db:migrate` against
   the development database.
4. Run `pnpm lint`, `pnpm test`, and `pnpm build` before handoff.
5. Keep normal work based on `dev`; promote to `main` only through the explicit production flow.
