# Work Orders due-date assessment

The signed-in dashboard refresh action reconciles ServiceM8 first, then runs `refreshDueAssessments` under the existing shared refresh lease. Visible auto-refresh uses the same action. Page reads only recompute the Auckland today-through-21-days window; they do not call AI. Existing Production Specification enrichment is a separate workflow.

## Rules and source

Read-only inspection of the [Kanban bot](https://grok.com/bot/e53f85c3-1944-43c3-b3f9-260c5c9c0c88) and its saved Daily RG Kanban refresh routine found vendor verification, preservation of manual values and a ban on using bookings as installation dates. The delegated [build_kanban.py](https://drive.google.com/file/d/1xxW_fDCIHX_D2h3tanBJsqCwrUZg8JoM/view) consumes curated evidence and spreadsheet flags; it is not itself a runtime AI detector. Its explicit Y/N/? priority is preserved here. Sheet/PDF rebuilds, uploads, messaging and related-job writes are outside this implementation.

`modules/kanban/assessment-source.ts` reads complete bounded active note/email cursor slices plus current job/item descriptions using the GET-only wrapper. Source failure, cursor loops or oversized history fail closed. There is no calendar/task input. Known client/address, contact, price, link and obvious secret text is redacted before provider input. Opaque product/source tokens replace record IDs in the provider payload. Source text remains untrusted data.

`assessment-provider.ts` uses the existing backend `OPENAI_API_KEY`, optional `KANBAN_ASSESSMENT_MODEL` (otherwise `OPENAI_MODEL`, then `gpt-5.4-mini`) and Responses structured output with provider storage disabled. Exact quotes, known product/source tokens, dates, purpose and product scope are validated locally. Uncertain scope, unsupported year, cancellation or booking intent requires review. Relative wording is anchored to the source timestamp, never today's retrieval time. Results remain AI suggestions and cannot confirm dates or modify staff fields.

The v3 response is an object keyed by exact product tokens, with one required assessment per key and a shared schema definition. The server restores the item IDs from those keys before semantic validation. This prevents a model returning human product labels as IDs, a failure reproduced using entirely fictional inputs. Evidence source IDs are constrained to known tokens. The format follows [OpenAI structured-output schemas](https://developers.openai.com/api/docs/guides/structured-outputs); local validation remains mandatory.
Complete evidence is bounded to 160,000 characters and 900 sources, with existing per-record and pagination limits retained. The previous 60,000-character cap rejected six current job histories before AI. Raising the bound keeps those histories complete; no dates or later cancellations are silently truncated. The configured provider passed a synthetic nine-product, 128,442-character case after repair. Historical failed assessments remain failed until a normal refresh retries them under the new rules.

## Imported Master flags

`kanban.master-flags.v1` is a dedicated JSON settings value holding source-provenance-bearing job flags; it requires no new migration. The source Sheet stays read-only. Each entry is bound to the RG Tools job ID, ServiceM8 job UUID and job number. Product choices have highest priority, then imported Master Y/N/?, then the automatic date rule. Y can retain TBC/overdue work even when AI fails. Imported flags never change dates, readiness, notes, installers or product revisions. A product reset to automatic inherits its job flag again; new products inherit it too.

The current approved transfer is a one-time snapshot, not continuous Google Sheets synchronisation. Read the live Master Job No/Status and Within 3 weeks? columns, retain source sheet ID/cell/modified time in a private manifest, and use the CLI from the repository root:

```powershell
node node_modules/tsx/dist/cli.mjs --tsconfig apps/web/tsconfig.json apps/web/scripts/kanban-flags.ts --target prod --input tmp/rg406/kanban-master-flags.json --output tmp/rg406/kanban-master-import-plan.json
node node_modules/tsx/dist/cli.mjs --tsconfig apps/web/tsconfig.json apps/web/scripts/kanban-flags.ts --target prod --input tmp/rg406/kanban-master-flags.json --apply --expected-plan "PLAN_HASH_FROM_PREVIEW"
```

Preview is read-only. Apply checks the exact preview fingerprint, locks current job identities and the settings row, rejects unmatched/ambiguous/stale plans, and writes only the dedicated setting and `dashboard_kanban_flag_imported` job events under the shared refresh lease. Unchanged re-imports do not create events. Events are visible from each product's history. A CLI import uses the System actor and records staff-requested provenance rather than impersonating a staff account. Existing entries outside the manifest are retained for archived jobs. Use `--target local` with the named disposable database for tests. Keep manifests/previews out of Git.

## Storage, refresh and failure

Rule version `kanban-due-v3-20261117` accepts day/month dates without a year only in dated notes/emails, using the unique calendar date within 90 days of the source timestamp. It handles December/January rollover and checks associated full weekdays. It never supplies a year from retrieval time or an undated description. Unsupported/contradictory dates remain reviewable. The rule bump forces existing cached assessments to be reconsidered on the next source refresh.

Assessment failures appear above the tables even when the due view is empty. Subsequent failure records distinguish source preparation, provider timeout/request, output validation and persistence using fixed safe messages; raw provider errors and source text are never used as error messages. Older failed records retain their generic message until retried. A dated suggestion is still unconfirmed and never overwrites a staff target.

Migration **0073** adds `work_order_items.dashboard_assessment` JSONB, separate from canonical `install_date` and `dashboard_state`. Apply it through the normal approved release migration process before deploying this code. No backfill or workbook import is required.

Each product stores source/snapshot hashes, rule/model versions, checked/assessment times, evidence, result and error. An unchanged complete source/rules/model fingerprint avoids another AI call. A note-only change triggers reassessment. Four workers start work within a 90-second budget, with request timeouts; remaining work is pending for the next refresh. Oldest checked jobs are prioritised. A locked transaction rechecks active source identity, description and product inventory before saving. Meaningful changes create actor-attributed `dashboard_evidence_assessed` events; cache checks do not spam history.

Staff dates take priority over suggested dates. Product Include/Exclude/Needs review controls determine membership before imported Master flags and automatic rules. Assessment storage never changes those values or their revision. A suggestion is usable only when complete, on the current rules, matching the current source descriptions and checked after the latest successful source sync. Failed or stale results remain visible for review and cannot classify an automatic date row; explicit flags still apply. Missing configuration, incomplete access and pending/failed work are surfaced in refresh feedback. Invalid saved flag data fails closed for inherited automatic choices and produces a visible banner; product overrides still apply.

## Validation and rollout

Run focused Kanban Vitest tests, TypeScript and lint, then the opt-in `tests/e2e/dashboard-work-orders.spec.ts` against its named disposable localhost fixture. The browser test uses synthetic ServiceM8 GET endpoints and a synthetic AI provider and asserts zero ServiceM8 writes. Never point this acceptance fixture at a live database or service. A production build must use an isolated database; package build scripts may apply migrations.

Source Sheets and ServiceM8 remain read-only. The explicitly requested flag import writes only RG Tools settings/history; deployment, bot changes, messaging and unattended schedules remain separate. Roll back the app revision to stop assessment; retain the additive column, imported provenance and history, and preserve staff edits.
