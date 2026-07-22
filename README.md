# rgtools

Internal operations toolkit for Royal Glass, covering lead intake and scoring, client records, quote pipeline tracking, quote engagement analytics, Producer Statement generation, and operational admin workflows.

## Workspace layout

This repo is a pnpm workspace:

- `apps/web` - the internal RG Tools Next.js app.
- `apps/catalog` - placeholder public catalog app for `catalog.royalglass.co.nz`.
- `packages/db` - shared Drizzle schema and database client.
- `workers/*` - Cloudflare Workers deployed separately from the apps.

## What it does

| Module           | Description                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dashboard**    | KPI overview for active tracked quotes, plus configurable operational tables                                                                                                                                       |
| **Lead Intake**  | Staff form to capture and score inbound enquiries, auto-syncs to ServiceM8                                                                                                                                         |
| **Leads**        | Paginated lead list and detail view with tier, ServiceM8, table, and date filters                                                                                                                                  |
| **Clients**      | Canonical client records, linked lead/job context, and merge review tooling                                                                                                                                        |
| **Quotes**       | Pull a ServiceM8 quote into a tracked short link, inspect engagement, and monitor active ServiceM8 Quote jobs with retained evidence, Source Coverage, and automatic What Matters Now summaries                    |
| **Work Orders**  | Grouped active installation jobs and ServiceM8 item lines, with asynchronously drafted Production Specifications, review/confirmation, manual corrections, operational fields, and portal-safe timeline candidates |
| **PS Generator** | Generate PS1 and PS3 Producer Statement PDF packages from published system, option, template, mapping, and wording configuration                                                                                   |
| **Admin**        | User/module access, pricing/tracking settings, dashboard tables, audit/error exports, and client merge review                                                                                                      |

### Quote Movement V1 boundary

Quote Movement is the staff monitoring surface at `/quote-movement`, separate from Quote Tracker but protected by the same `quote-tracker` module grant. It reads ServiceM8 Quote jobs one way into retained rgtools history, shows explicit Complete or Incomplete Source Coverage, and preserves converted Quote evidence while operations continue in Work Orders.

V1 deliberately does not rank or score Quotes, recommend sales actions, assign owners, manage next actions or due dates, draft customer messages, or write changes back to ServiceM8. Automatic What Matters Now summaries organise retained evidence; they do not act as a priority engine or workflow manager.

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **Tailwind CSS 4**
- **pnpm workspace** for apps, workers, and shared packages
- **Drizzle ORM** + **Neon PostgreSQL** (serverless)
- **NextAuth v5** - credential-based auth, JWT sessions, admin/staff roles
- **Google Maps** - Places autocomplete + Distance Matrix
- **Cloudflare Workers + R2** - `rg-viewer`, `rg-tracker`, `rg-notifier`, and `rg-cleanup`
- **Resend** - transactional email
- **OpenAI API** - optional lead and quote AI guidance
- **Vitest** and **Playwright** - unit, integration, workspace, and e2e tests

## Developer docs

- [Local setup](docs/dev/setup.md) - prerequisites, env vars, DB migration, seeding, testing
- [Architecture](docs/dev/architecture.md) - system design, modules, auth, and lead scoring
- [Royal Glass Precision UI](docs/dev/royal-glass-precision-ui.md) - theme contract, semantic tokens, shared presentation seams, and extension rules
- [Deployment](docs/dev/deployment.md) - Vercel + Cloudflare Worker deployment
- [Branch workflow](docs/dev/branch-workflow.md) - feature to staging and staging to production flow
- [Changelog](docs/CHANGELOG.md) - release history and unreleased notes
- [Security policy](docs/SECURITY.md) - reporting and operational security expectations
- [Security runbook](docs/dev/security.md) - auth, access control, secrets, data boundaries, and incident response
- [Quote tracking privacy note](docs/dev/quote-tracking.md) - what is collected, retention, access
- [Quote Movement developer notes](docs/dev/quote-movement.md) - cached ServiceM8 Quote monitoring, retained evidence, automatic summaries, conversion, and durable non-blocking refresh behavior
- [ServiceM8 sync architecture](docs/dev/servicem8-sync-architecture.md) - lead-to-ServiceM8 sync model
- [Work Order enrichment operations](docs/dev/work-order-enrichment.md) - manual Hobby processing, privacy boundary, retry, monitoring, and rollback
- [ServiceM8 MCP notes](docs/dev/servicem8-mcp.md) - ServiceM8 MCP setup and limits
- [Domain and environment setup](docs/dev/rgtools-domain-and-env-setup.md) - Royal Glass domains, Neon branches, and env separation
- [Cloudflare DNS migration](docs/dev/dns-migration-cloudflare.md) - DNS migration plan
- [Cloudflare DNS record](docs/dev/dns-migration-cloudflare-record.md) - migration record and caveats

## User docs

- [Getting started](docs/user/getting-started.md) - login, dashboard, roles
- [Appearance themes](docs/user/getting-started.md#appearance) - Light, Dark, and System usage
- [Lead intake form](docs/how-to/lead-intake.md) - field-by-field guide
- [Leads dashboard](docs/how-to/leads.md) - list, filters, detail view, ServiceM8 fetch
- [RG Leads manual checklist](apps/web/tests/rg-leads-test-plan.md) - safe human verification for Quote-status lead workflows
- [Client records](docs/how-to/clients.md) - client list, detail, links, and merge review
- [Scoring guide](docs/user/scoring-guide.md) - Decision Matrix fields, tiers A-E, and follow-up actions
- [Phone script](docs/user/phone-script-lead-intake.md) - call structure for consistent lead capture
- [Quotes how-to](docs/how-to/quotes.md) - create tracked quotes, review Quote Movement, share links, read engagement, troubleshooting
- [PS Generator how-to](docs/how-to/ps-generator.md) - generate PS packages, understand configuration, and seed prerequisites

## Security

See [docs/SECURITY.md](docs/SECURITY.md) for reporting and operational security expectations. The short version: do not commit secrets, keep local and preview environments off production data unless explicitly performing a production operation, and use the documented module-access and audit boundaries for staff-facing changes.

## Changelog

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for version history.

## Quick start (dev)

```bash
pnpm install
cp .env.example .env.local   # fill in values - see docs/dev/setup.md
pnpm db:migrate
pnpm seed                    # creates initial admin user and module rows
pnpm seed:ps-generator       # seeds published PS Generator config
pnpm seed:tracking           # seeds quote tracking settings
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

For a one-off production migration without changing `.env.local`, set `DB_URL_PROD`
to the production Neon pooled URL and run:

```bash
pnpm db:migrate:prod
```

## Quote pipeline scripts

```bash
pnpm quote:pull --latest        # pull metadata + PDF from ServiceM8 to tmp/
pnpm quote:preview --latest     # local viewer in browser
pnpm quote:share --latest       # public Cloudflare tunnel link
pnpm quote:create --job R260210 # create a tracked quote in the DB
pnpm quotes:client-backfill     # link historical quotes to client records
pnpm clients:merge-cleanup      # apply reviewed client merge cleanup
```

## Tests

```bash
pnpm test             # workspace tests, then web app test run
pnpm test:run         # alias for the full test command
pnpm test:workspace   # root workspace guardrail tests only
pnpm test:integration # live DB integration tests
pnpm test:e2e         # Playwright e2e tests
```
