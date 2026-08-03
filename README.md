# RG Tools

RG Tools is Royal Glass's internal operations system for lead intake and scoring, client records,
quote tracking, quote engagement, Quote Movement, Work Orders, Producer Statement generation, and
operational administration.

## Current workspace

This repository is a pnpm workspace:

| Path | Purpose |
| --- | --- |
| `apps/web` | Authenticated internal Next.js application at `http://localhost:3000` |
| `apps/catalog` | Placeholder public catalog app at `http://localhost:3001` |
| `packages/db` | Shared Drizzle schema and Neon PostgreSQL client |
| `workers/viewer` | Public quote PDF viewer and email gate |
| `workers/tracker` | Public quote engagement beacon |
| `workers/notifier` | Quote engagement notification cron |
| `workers/cleanup` | Quote and personal-data cleanup cron |

See [the architecture overview](docs/dev/architecture.md) for ownership boundaries and request
flow.

## Product areas

| Area | What it does |
| --- | --- |
| **Dashboard** | Shows operational attention queues, next actions, business performance, and configurable live-data tables. |
| **Lead Intake** | Captures and scores enquiries, then synchronises eligible lead records with ServiceM8. |
| **Leads** | Searches leads, shows tier and follow-up context, and links to ServiceM8 jobs. |
| **Clients** | Maintains canonical RG Tools client records, linked context, and merge review. |
| **Quote Tracker** | Creates tracked quote links from ServiceM8 PDFs and records viewer engagement. |
| **Quote Movement** | Retains ServiceM8 Quote evidence, reports source coverage, and preserves converted Quote context. |
| **Work Orders** | Reconciles active ServiceM8 Work Order jobs and manages RG-owned operational enrichment. |
| **PS Generator** | Generates PS1 and PS3 Producer Statement packages from published configuration and templates. |
| **Admin** | Manages users, module grants, pricing, tracking, dashboard tables, Work Order configuration, and audit/error exports. |

### Workflow boundaries

ServiceM8 remains the source of truth for ServiceM8 job identity, status, and source fields. RG Tools
retains context and RG-owned enrichment so staff can work from one operational view.

Quote Movement is a read-oriented monitoring surface. It does not rank or score quotes, assign
owners, draft customer messages, or silently write changes back to ServiceM8. Its summaries organise
retained evidence and explicitly show incomplete source coverage.

Work Orders initially reads active ServiceM8 jobs in `Work Order` status. Staff can manage RG-owned
fields and reviewed production labels, but Work Orders does not silently write operational changes
back to ServiceM8.

## Technology

- Next.js 16 App Router, React 19, and Tailwind CSS 4.
- pnpm 11.7.0 workspace with TypeScript.
- Drizzle ORM and Neon PostgreSQL.
- NextAuth v5 credentials authentication with JWT sessions and module grants.
- Google Maps, ServiceM8, Cloudflare Workers/R2, Resend, and optional OpenAI integrations.
- Vitest and Playwright for unit, integration, workspace, and end-to-end tests.

## Install for local development

The complete collaborator setup is in [Developer setup](docs/dev/setup.md). The short version is:

### 1. Install prerequisites

Install Git, Node.js 20.9 or newer, and pnpm 11.7.0. Verify them:

```text
node --version
pnpm --version
```

If needed, install the pinned pnpm version with Corepack:

```text
corepack enable
corepack prepare pnpm@11.7.0 --activate
```

### 2. Clone and install dependencies

```text
git clone <repository-url>
cd rgtools
pnpm install
```

### 3. Configure a development database and environment

Create `.env.local` from the committed template. On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

On macOS or Linux:

```bash
cp .env.example .env.local
```

Set at least:

```dotenv
DATABASE_URL=postgresql://...        # pooled Neon dev-branch URL
AUTH_URL=http://localhost:3000
AUTH_SECRET=<unique-random-secret>
CRON_SECRET=<unique-random-secret>
```

Use the Neon `dev` branch for local development and Vercel Preview. Never put a production
connection string in a collaborator's `.env.local`; keep secrets out of Git. The template lists
optional Google Maps, ServiceM8, R2, Resend, OpenAI, calculator, and Turnstile settings.

### 4. Migrate and seed the development database

```text
pnpm db:migrate
pnpm seed
pnpm seed:ps-generator
pnpm seed:tracking
```

The base seed creates a local-only bootstrap administrator: username `rgadmin`, password
`*royalglass23`. Use this only against an isolated local database. An administrator can create
collaborator accounts from **Admin -> Administration**.

### 5. Start the web app

```text
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The placeholder catalog runs separately:

```text
pnpm --filter @rgtools/catalog dev
```

It opens at [http://localhost:3001](http://localhost:3001).

The PS Generator seed creates published configuration but actual PDF generation also requires the
configured template PDFs in local storage or R2. Optional ServiceM8, Google Maps, email, storage,
and OpenAI features remain unavailable until their corresponding variables are configured.

## Common commands

Run commands from the repository root:

```text
pnpm dev                  # web app
pnpm build                # web and catalog production builds
pnpm start                # start the built web app
pnpm lint                 # web and catalog lint
pnpm test                 # workspace tests, then web unit tests
pnpm test:workspace       # root guardrail tests
pnpm test:integration     # DB-backed integration tests
pnpm test:e2e             # Playwright tests
pnpm db:generate          # generate SQL after a schema change
pnpm db:migrate           # apply development migrations
pnpm db:studio            # open Drizzle Studio
```

Focused web tests can be run with:

```text
pnpm --filter @rgtools/web test:run -- modules/lead-intake/__tests__/actions.test.ts
```

Integration tests use `DATABASE_URL`. Mutating Work Order and Quote Movement E2E journeys require a
separate sentinel-protected `E2E_DATABASE_URL`; do not point them at shared development or
production data.

### Quote and operations scripts

```text
pnpm quote:pull --latest        # pull ServiceM8 metadata and PDF to tmp/
pnpm quote:preview --latest     # preview a pulled quote locally
pnpm quote:share --latest       # temporary trycloudflare.com share link
pnpm quote:create --job R260210 # create a tracked quote in the database
pnpm quotes:client-backfill     # link historical quotes to client records
pnpm clients:merge-cleanup      # apply reviewed client merge cleanup
```

The quote share tunnel is temporary and is not suitable for sending to real customers.

### Workers

Workers are separate Cloudflare deployables. Run their tests or local server in the relevant
package:

```text
pnpm --dir workers/viewer test
pnpm --dir workers/tracker test
pnpm --dir workers/notifier test
pnpm --dir workers/cleanup test
pnpm --dir workers/viewer dev
```

Worker secrets are set with Wrangler and must not be committed to `wrangler.toml`.

## Database and release safety

- Use `dev` as the normal base branch. `main` is reserved for explicit production promotion.
- After schema changes, run `pnpm db:generate`, review the SQL, and apply it to the intended
  development database with `pnpm db:migrate`.
- For a one-off production migration, leave `DATABASE_URL` on development, set `DB_URL_PROD`, and
  run `pnpm db:migrate:prod` only after independently verifying the target.
- Never commit `.env.local`, database URLs, API keys, R2 credentials, OpenAI keys, Resend keys,
  ServiceM8 keys, or Wrangler secrets.

Read [Security policy](docs/SECURITY.md) before handling customer, quote, or generated PDF data.

## Documentation

### Developer documentation

- [Developer setup](docs/dev/setup.md) - prerequisites, environment, database, tests, workers, and troubleshooting
- [Architecture overview](docs/dev/architecture.md) - workspace boundaries, modules, data ownership, and permissions
- [Royal Glass Precision UI](docs/dev/royal-glass-precision-ui.md) - UI theme and presentation rules
- [Work Order enrichment](docs/dev/work-order-enrichment.md) - enrichment operations and privacy boundary
- [Work Order existing-item rollout](docs/dev/work-order-existing-item-rollout.md) - supervised rollout notes
- [Work Order rollout performance](docs/dev/work-order-existing-item-rollout-performance.md) - performance notes
- [Work Order retention operations](docs/ops/work-order-retention.md) - protected cleanup schedule and rollback
- [Product context](apps/web/PRODUCT.md) - product purpose and design principles

### Staff documentation

- [Getting started](docs/user/getting-started.md) - dashboard, navigation, roles, and appearance
- [Lead intake](docs/how-to/lead-intake.md) - capture and score enquiries
- [Leads](docs/how-to/leads.md) - review and follow up leads
- [Clients](docs/how-to/clients.md) - client records and merge review
- [Quotes and Quote Movement](docs/how-to/quotes.md) - tracked links, engagement, retained evidence, and troubleshooting
- [Work Orders](docs/how-to/work-orders.md) - refresh, filters, operational fields, and Production Specifications
- [PS Generator](docs/how-to/ps-generator.md) - generate PS packages and manage configuration
- [Scoring guide](docs/user/scoring-guide.md) - scoring fields, tiers, and follow-up actions
- [Phone script](docs/user/phone-script-lead-intake.md) - consistent lead-intake calls

Historical planning briefs are kept under `docs/codex/` for project traceability and are not the
current installation or product manual.

## Changelog

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for release history and unreleased documentation notes.
