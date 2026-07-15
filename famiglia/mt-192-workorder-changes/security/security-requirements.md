# Security requirements — mt-192-workorder-changes

- Mode: retrofit
- Stack: Node.js / Next.js 16, React 19, Drizzle/PostgreSQL, NextAuth 5 beta
- Stack source: `famiglia/profile.json` (`marker:package.json`)
- Reviewed state: `e2c167aad9f7a77851c548afd3d33b5f7efd0224` plus the current dirty MT-199 repair delta
- Date: 2026-07-15

## Actors and trust

| Actor | Trust | Allowed capability |
|---|---|---|
| Unauthenticated user | untrusted | Login only; no Work Order data or actions |
| Work Orders viewer | partially trusted | Read configured Work Orders and export rows |
| Work Orders manager | privileged | Refresh ServiceM8 data and edit active Work Order Items |
| Work Orders configurator/admin | privileged | Manage summary fields, exclusions, and active option lists |
| ServiceM8 | external system | Supply the complete paginated job/item truth set through the read-only API key |
| OpenAI | external processor | Receive one item description and return one short label |
| E2E runner | highly privileged test actor | Mutate only a dedicated database proven by an exact sentinel |

## Security acceptance criteria

1. Every remotely invokable mutation performs its own server-side authentication and role/grant check before external calls or writes.
2. View, Manage, and Configure remain separate grants; a viewer cannot refresh, relabel, edit, delete, or configure Work Orders.
3. Item mutations reject missing/removed resources and require active configured option IDs.
4. Every required ServiceM8 cursor page is fetched and validated before the reconciliation transaction; repeated cursors fail closed.
5. Stable ServiceM8 job/item UUIDs are mandatory identities.
6. Active item state is a write precondition, not only a prior read check.
7. Manual and AI label mutations persist the value, item event, and global audit atomically.
8. OpenAI output is one non-empty line of at most 160 characters; outbound calls have a timeout and abuse control; provider bodies are not exposed or logged verbatim.
9. CSV formula cells are neutralized, and exports are bounded or streamed.
10. Mutating Playwright tests require an exact strong isolated-database sentinel and scoped/restorative cleanup.
11. Provider/database credentials stay in environment secret storage and never enter source, logs, URLs, CSV, or audit detail.
12. Refresh attempts/results, denials, and item changes are attributable without logging secrets or unnecessary personal data.
13. Raw ServiceM8 payloads and historical data have a documented minimization, retention, and deletion policy.
14. Production dependency audit has no unresolved applicable advisory or has an approved time-bounded exception.

## Abuse cases

- A viewer directly invokes a registered Server Action instead of the visible UI wrapper.
- An authorised user repeatedly starts refreshes or OpenAI generation to exhaust quota, workers, or database capacity.
- ServiceM8 paginates/truncates a dataset and unseen records are mistakenly deactivated.
- A refresh removes an item between the mutation read and write.
- A user forges an inactive option UUID or edits a removed item.
- Exported upstream/user/admin text executes a spreadsheet formula.
- A test points at a shared database and performs full-set reconciliation.
- A provider error leaks request/provider detail.
- An oversized upstream response or export exhausts memory.

## Compliance and blast radius

`famiglia/profile.json` declares no opt-in compliance framework. Personal and confidential information is nevertheless present and requires operational review under applicable New Zealand privacy obligations.

A full compromise could expose client/job/address and pricing context, change assignments/history, deactivate the active snapshot, consume provider capacity, and create misleading exports. Provider or database credential disclosure would extend impact into external systems.
