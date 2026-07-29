# Security Policy

rgtools is an internal Royal Glass operations system. It handles staff accounts, client contact details, lead scoring data, ServiceM8 job references, quote PDFs, quote engagement telemetry, and generated Producer Statement outputs.

## Reporting

Report suspected vulnerabilities, exposed credentials, suspicious quote links, or accidental production-data access to the Royal Glass system owner immediately. Do not open a public GitHub issue containing secrets, customer data, tokens, quote PDFs, or exploit details.

When reporting, include:

- The affected environment: local, dev/staging, production, or a Cloudflare Worker.
- The route, worker, script, or document involved.
- Exact time observed and the user/action that triggered it, if known.
- Whether any customer, client, quote, lead, or credential data may have been exposed.

## Supported Environments

Security fixes are expected to land through the normal branch flow:

- Feature or docs branch from `dev`.
- Pull request into `dev` for staging.
- Pull request from `dev` into `main` for production.

Critical fixes may be expedited, but production should still receive only reviewed changes from `dev` unless the system owner approves an emergency exception.

## Operational Rules

- Never commit `.env.local`, database URLs, API keys, R2 credentials, OpenAI keys, Resend keys, ServiceM8 keys, or Wrangler secrets.
- Keep local and Vercel preview environments on the Neon `dev` branch. Use production credentials only for explicit production operations.
- Use `DB_URL_PROD` and `pnpm db:migrate:prod` for one-off production migrations rather than changing everyday `DATABASE_URL`.
- Store Cloudflare Worker secrets with `wrangler secret put`; do not place secrets in `wrangler.toml` `[vars]`.
- Treat quote PDFs and generated PS PDFs as customer data. Do not paste them into tickets, logs, prompts, or public channels.
- Preserve audit trails for admin, access, quote, lead, and client-merge changes.

## More Detail

- [Developer setup](dev/setup.md)
- [Architecture overview](dev/architecture.md)
- [Work Order retention operations](ops/work-order-retention.md)
- [Quote tracking how-to](how-to/quotes.md)
