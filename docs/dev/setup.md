# Developer setup

This guide is for a collaborator installing RG Tools on a new computer. The normal local
environment is the repository root, the web app is served at `http://localhost:3000`, and the
local database connection must point to the Neon `dev` branch (never the production branch).

## Prerequisites

Install these before cloning the repository:

- Git.
- Node.js 20.9 or newer. The application uses Next.js 16.
- pnpm 11.7.0, matching the `packageManager` field in the root `package.json`.
- Access to a PostgreSQL database for development. The supported setup uses a pooled Neon
  connection string for the shared `dev` branch.

Check the tools after installing them:

```text
node --version
pnpm --version
```

The pnpm version should be `11.7.0`. If pnpm is not installed, use Corepack or install the
version explicitly:

```text
corepack enable
corepack prepare pnpm@11.7.0 --activate
```

If Corepack is unavailable, install pnpm 11.7.0 with `npm install --global pnpm@11.7.0`.

## Clone and install

```text
git clone <repository-url>
cd rgtools
pnpm install
```

`pnpm install` installs the root workspace, both Next.js apps, the shared database package, and
the Cloudflare Worker packages.

## Create the local environment file

Copy the example file to `.env.local`. On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

On macOS or Linux:

```bash
cp .env.example .env.local
```

At minimum, set these values in `.env.local`:

| Variable | Local value |
| --- | --- |
| `DATABASE_URL` | Pooled PostgreSQL URL for the Neon `dev` branch |
| `AUTH_URL` | `http://localhost:3000` |
| `AUTH_SECRET` | A new random value for this machine |
| `CRON_SECRET` | A new random value; used by protected cron routes |

Generate a local auth secret with OpenSSL or Node:

```text
openssl rand -base64 32
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

The remaining variables in `.env.example` enable optional integrations:

- Google Maps autocomplete and distance checks.
- ServiceM8 lead, quote, attachment, and Work Order integration.
- R2 quote and Producer Statement PDF storage, or local quote storage for development.
- Resend customer estimate email and quote notifications.
- OpenAI staff guidance and Work Order Production Specification enrichment.
- Calculator and Turnstile server-to-server submissions.

Do not copy production credentials into a collaborator's local environment. Keep local and Vercel
Preview on the Neon `dev` branch, and use the pooled connection string (`-pooler` in the host)
where Neon provides one.

## Prepare the database

Run migrations from the repository root:

```text
pnpm db:migrate
```

Seed the local admin, module rows, and default settings:

```text
pnpm seed
pnpm seed:ps-generator
pnpm seed:tracking
```

The base seed creates the local bootstrap administrator:

- Username: `rgadmin`
- Password: `*royalglass23`

This credential is intended only for an isolated local database. Do not use it in Preview or
Production. After login, an administrator can create collaborator accounts from **Admin ->
Administration**. The PS Generator seed creates published configuration; actual PDF generation
also needs the configured template PDFs available in the selected storage provider.

## Run the applications

Start the internal web app:

```text
pnpm dev
```

Open `http://localhost:3000` and sign in with the local bootstrap account. The catalog app is a
separate placeholder app and can be started in another terminal:

```text
pnpm --filter @rgtools/catalog dev
```

It runs at `http://localhost:3001`.

For a production-mode local check, build first and then start the web app:

```text
pnpm build
pnpm start
```

## Verify a change

Use the narrowest useful check while developing, then run the full gates before handoff:

```text
pnpm lint
pnpm test
pnpm build
```

Additional suites are available when their environment is prepared:

```text
pnpm test:workspace
pnpm test:integration
pnpm test:e2e
```

Integration tests use `DATABASE_URL`. Mutating Work Order and Quote Movement E2E journeys require
a separate sentinel-protected `E2E_DATABASE_URL`; never point those tests at the shared `dev` or
production database. The Playwright configuration also supports `E2E_USERNAME`, `E2E_PASSWORD`,
`E2E_DATABASE_SENTINEL`, `E2E_QUOTE_MOVEMENT`, and `E2E_QUOTE_MOVEMENT_V1`.

## Run Worker tests or development servers

Workers are separate deployables. Each worker has `dev`, `test`, and `deploy` scripts:

```text
pnpm --dir workers/viewer test
pnpm --dir workers/tracker test
pnpm --dir workers/notifier test
pnpm --dir workers/cleanup test
```

Run a Worker locally with `pnpm --dir workers/<name> dev`. Worker secrets are configured with
Wrangler, not committed to `wrangler.toml`; see the comments in each Worker configuration before
running a deployment command.

## Database and source-control rules

- Use `dev` as the normal base branch for changes. `main` is reserved for explicit production
  promotion.
- Generate a migration after a schema change with `pnpm db:generate`, review it, then apply it
  with `pnpm db:migrate` against the intended development database.
- Keep `.env.local`, database URLs, API keys, R2 credentials, and Wrangler secrets out of Git.
- For a one-off production migration, leave `DATABASE_URL` on development and set
  `DB_URL_PROD`, then run `pnpm db:migrate:prod` only after the target has been independently
  verified and approved.

## Common setup problems

**`DATABASE_URL is required`**: `.env.local` is missing, the variable is blank, or the URL is not
reachable. Confirm the file is at the repository root and that it points to the Neon `dev` branch.

**Migration fails**: check that the connection is pooled, the database is reachable, and the
correct branch is selected. Do not solve a local migration failure by switching to the production
URL.

**The app starts but no modules are visible**: run `pnpm seed` against the same database used by
the app, then sign out and back in to refresh the session.

**PDF generation reports a missing template**: the PS Generator configuration is seeded, but the
configured R2/local storage object is not present. Upload or configure the template before testing
generation.
