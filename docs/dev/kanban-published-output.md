# Direct Kanban Work Orders publisher

RG-408 replaces the rgtools Google HTML/Sheet reader with **Kanban → authenticated rgtools POST → atomic snapshot/history → dashboard**. The bot may continue using Google internally. rgtools needs no Kanban Google scopes, OIDC/WIF settings, receipt range or service-account key. Existing Google Maps settings serve their separate feature. No bot/routine/cloud configuration or live connection is established by installing this code.

## Server configuration and deployment

Set server-only `KANBAN_PUBLISH_SECRET` to a new random secret of at least 32 characters. It must differ from `KANBAN_BOT_WEBHOOK_SECRET`. Put the same publisher secret in the bot's approved secure secret store; never paste it into chat, tracked files, payloads or logs. Deploy the receiver before changing the producer. Use a stable approved endpoint, for example `https://www.rgtools.co.nz/api/kanban/publish` only after that environment has this code.

The producer sends `POST /api/kanban/publish` with `Content-Type: application/json` and `Authorization: Bearer <publisher secret>`. The route has its own authentication; the proxy exempts only this exact path from interactive sign-in. All dashboard pages/actions, including history/version reads, still require a signed-in dashboard user. For a Vercel deployment protected Preview, configure the separately approved automation bypass header in the producer as well; it does not replace the app Bearer secret. Do not weaken deployment protection or export browser cookies. Disable redirects on outbound publisher HTTP so credentials cannot follow another destination.

Optional Request update uses the existing fixed HTTPS `KANBAN_BOT_WEBHOOK_URL` and separate `KANBAN_BOT_WEBHOOK_SECRET`, server-side only. It sends Bearer authentication and `{ "action":"refresh_work_orders", "requestId":"<UUID>" }` once with a 15-second timeout. Exactly HTTP 200 acknowledges routine acceptance; other statuses do not. A transport error may still have delivered; the app never retries automatically. Response bodies are cancelled without reading/logging them. This does not change schedules or authorize unrelated routine actions.

Local `pnpm dev` loads root `.env.local` through the shared database loader, and Next can also load app-local variables. Preserve existing secrets; add only these names to the intended secure environment. Do not copy example values into production. No credentials are included here.

## Version1 full snapshot contract

```json
{
  "schemaVersion": 1,
  "board": "work-orders",
  "publicationId": "12345678-1234-4123-8123-123456789abc",
  "requestId": "22345678-1234-4123-8123-123456789abc",
  "sourceAsOf": "2026-11-20T00:00:00.000Z",
  "generatedAt": "2026-11-20T00:01:00.000Z",
  "complete": true,
  "tables": {
    "jobs": [{"id":"job-source-uuid","cells":["R260001","Fictional Customer","Example Road","TBC","N"]}],
    "products": [{"id":"job-source-uuid:immutable-row-id","cells":["R260001\nFictional Customer\nExample Road","Shower","","?","N","Y","Y","PS1 issued","N","?",""]}]
  }
}
```

`requestId` is optional for scheduled/manual publications; include the webhook request UUID when supplied. UUIDs are normalized to lowercase. All other shown fields are required and unknown fields are rejected, including arbitrary board/storage destinations. `complete` must be true. Both arrays must exist; empty arrays explicitly represent complete empty tables, so never publish an empty fallback after a failed collection. Send unescaped strings and preserve blanks/newlines/source row granularity. React renders them as text, never raw HTML.

`jobs` has exactly 5 cells in this order: **WO; Customer; Short address; Approx install date; Within 3 weeks?**. `products` has exactly 11: **WO / client / address; Materials (per product); Client waiting for; Site ready; Glass ready; Hardware ready; Design Y/N/?; PS1 / PS3; Bottle strut; BC?; Minor var?**. Membership and values come from the completed bot output; rgtools performs no date/readiness inference or splitting.

Row `id` is invisible and stable across runs: use a genuine immutable job/item UUID or an established persistent source-row identity matching the existing output granularity. It must be unique within its table,1–128 ASCII letters/digits/`.`/`_`/`:`/`-`, beginning with a letter/digit. Never derive identity from row position, customer/address/material text or a mutable display label. Keep the same identity after a field edit or reordering. If the existing exporter lacks such an identity, add it before enabling delivery; do not invent an index identity.

Limits: streamed UTF-8 body ≤4 MiB, ≤5,000 rows per table, ≤16,000 characters per string cell, exact cell widths and types. NUL and unpaired UTF-16 surrogates are rejected because PostgreSQL JSONB cannot store them; valid Unicode, whitespace and blanks are preserved. No partial patch payloads. Timestamps are valid canonical UTC ISO with milliseconds (`YYYY-MM-DDTHH:mm:ss.sssZ`). `sourceAsOf` is the complete source snapshot cutoff, not the finish time; it must be ≤`generatedAt`. Generation cannot be more than 5 minutes ahead of receiver time. Keep source clocks accurate.

Generate JSON from the same fully built **in-memory rows** used for the completed board, before HTML escaping/shared-file writes. Do not scrape a shared HTML file another run may be rewriting. Finish all source collection and validation first; publish only complete results. The receiver does not add a bot lock, queue, scheduler or rate limit.

## Acknowledgement, ordering and history

- `200` with `{outcome:"published"|"no_change",publicationId,duplicate}` confirms durable acceptance. Inspect JSON and the matching ID; a login HTML page is not acceptance.
- Retry delivery uncertainty with the **same ID and immutable envelope**. Hashing protects metadata/request identity and all cells while ignoring row ordering. Identical delivery returns `duplicate:true`, without another event or replacing a newer publication. Do not regenerate a new ID for a retry.
- `409 conflict` means that ID was already used for different immutable content (or another audit identity). Stop and investigate; do not overwrite or silently assign another ID.
- Older `sourceAsOf`, or equal cutoff with older `generatedAt`, returns `409 stale`. Equal cutoff/generation with changed row content returns `409 ambiguous`. Fresh/new-ID unchanged content produces `no_change`, including reordered-only output. Same timing/unchanged content is also a valid no-change publication. Stale/ambiguous complete deliveries get one metadata-only rejection event; retries return that same rejection.
- `400/413/415` means contract/body/type rejection; last good data stays unchanged. `401` means publisher authentication failed. `503` means configuration/storage unavailable; retry the same complete ID/content after resolving it. Raw payloads, secrets and exception text are not logged or returned.

Latest complete snapshot lives in existing `settings.key=kanban.work-orders.latest.v1` as JSON text. One transaction bootstraps/locks that row `FOR UPDATE`, checks audit publication UUID/hash/order, inserts history and updates latest. `audit_log.id=publicationId`, `actorId=null`, `entityType=kanban.work-orders.publication`; events identify `kanban-bot`, not a staff user. No schema migration is needed. Diffs are computed by stable IDs in rgtools: added/removed rows and individual field Before/After values. Reordering is not a field edit. The first event is labeled initial snapshot with Table A/B counts. Accepted event details contain full changes; rejection details contain safe metadata only. Database failure rolls back latest and history together.

History summaries paginate20events; selected changes paginate50entries and retain all saved cell values. Reads include archived audit events. Existing cleanup archives/clears IP and retains IDs/detail. **Do not hard-delete these publication audit rows without revisiting dedupe/history guarantees.** Storage grows with publications/changes; no additional retention policy or generic event platform is introduced. Existing assessments/staff history are not merged or deleted.

Visible dashboard tabs check only rgtools' stored publication ID every30seconds and refresh on change; there is no bot completion/Google polling. Request update disables its button only for dispatch and reports acceptance truthfully. Before first publication the dashboard is empty; there is no fallback to old Google/manual/AI values.

## Verification and rollout boundary

From `apps/web`, use the installed direct CLI if package-manager shims attempt to download themselves:

```powershell
node ../../node_modules/vitest/vitest.mjs run modules/kanban/__tests__/publication.test.ts modules/kanban/__tests__/publisher-route.test.ts modules/kanban/__tests__/bot-refresh.test.ts modules/kanban/__tests__/PublishedRefreshControl.test.tsx 'app/(dashboard)/dashboard/__tests__/work-order-tables.test.tsx' __tests__/kanban-publisher-proxy.test.ts --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
```

Guarded integration test: `tests/integration/kanban-direct-publication.test.ts` runs only with the exact fictional loopback `RG408_TEST_DATABASE_URL` and fresh schema. See the local execution brief for fixture preparation; do not point it at shared development/production or run the package build, which migrates. Real PostgreSQL tests cover atomic rollback, concurrent duplicates/conflicts/staleness and archived dedupe. Mocked/fictional checks do not prove the bot can reach the deployed endpoint.

After separately approved deployment/secret/bot configuration, prove one fictional authenticated bot→receiver request, matching JSON acknowledgement, duplicate retry/one history event, then approve the intended routine wiring and real output. Production promotion remains separate. Keep original schedules and unrelated routine actions unchanged until specifically approved.
