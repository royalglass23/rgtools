# Scout report — workorder-enrichment

- Date: 2026-07-15
- Question asked: Which domain should own canonical structured production specifications extracted from noisy ServiceM8 descriptions, and which existing data and test seams can support it?
- Scope: Read-only repository scouting. No production code, configuration, secrets, branches, external systems, or data were changed.

## Recommendation

Canonical production-spec enrichment should be owned by **Work Orders at Work Order Item level**. Quote Tracker is a job-level commercial/tracking record and does not retain ServiceM8 item identity. The lifecycle handoff is a useful shared input assembler, but it is deliberately a read model, not a source of operational truth. A Work Order-owned enrichment boundary can consume Lead/calculator, Quote, ServiceM8 history/file, parent-job, and item-line evidence while persisting the result against the stable `work_order_items.id` / `servicem8_item_uuid` identity.

Keep two boundaries distinct:

1. **Shared evidence assembly:** reuse or extend `loadLifecycleHandoffContext()` only to collect cross-lifecycle context and provenance for a ServiceM8 job.
2. **Canonical extraction and persistence:** add a Work Order domain service and Work Order-owned persistence for versioned, structured per-item production specifications. Do not store the canonical result in Quote Tracker or in the transient handoff object.

This recommendation does not decide the final field vocabulary, confidence/review workflow, source precedence, or whether every requested attribute is item-level. Those require product definition with representative ServiceM8 descriptions.

## What I found

### 1. Calculator data starts structured but is flattened before it reaches the downstream lifecycle

- `CalculatorSubmission.answers` accepts the source answer object (`apps/web/modules/lead-intake/calculator/map-calculator-submission.ts:4-29`). Known values already include scenario/structure, fixing system, substrate, hardware finish, glass type/colour, length, corners, gates, and landing length (`map-calculator-submission.ts:49-104`, `170-207`).
- `mapCalculatorSubmissionToIntakeInput()` converts those answers into one human-readable multiline `jobDescription`; it does not persist the raw answer object or a typed production-spec object (`map-calculator-submission.ts:106-134`, `170-207`).
- Lead persistence stores that flattened value in `leads.job_description`; the Lead schema has business/scoring columns but no production-spec aggregate (`packages/db/src/schema-leads.ts:201-244`; `apps/web/modules/lead-intake/actions.ts:271-297`).
- The ServiceM8 lead sync reads `leads.jobDescription` back as `freeText` and reparses known calculator lines for the ServiceM8 payload (`apps/web/modules/lead-intake/servicem8/sync.ts:156-182`; `apps/web/modules/lead-intake/servicem8/payload.ts:248-270`). This is evidence that useful structure currently crosses the boundary as formatted text and can become noisy or incomplete.

Implication: calculator/Lead context can be a provenance-bearing input, but Lead cannot be the canonical owner for production output because later ServiceM8 item lines can differ from the original estimate and one Lead/job can produce multiple items.

### 2. Quote Tracker is job-level and discards item detail

- `quotes` is uniquely keyed by one ServiceM8 job UUID and stores job description, address, value, and tracking/guidance fields; it has no ServiceM8 `jobmaterial` identity or per-line production-spec relation (`packages/db/src/schema.ts:34-67`).
- Tracked-quote creation copies `meta.jobDescription`, address, and total quote value into that job-level record (`apps/web/modules/quote-tracker/create-tracked-quote.ts:135-180`).
- `getJobQuoteMeta()` fetches the ServiceM8 job and uses job materials only to calculate a subtotal; it returns no individual jobmaterial descriptions or identities to Quote Tracker (`apps/web/lib/servicem8/client.ts:844-882`).

Implication: Quote Tracker can supply commercial/customer evidence, but making it the canonical enrichment owner would collapse multiple production lines into one job-level result and couple production truth to a pre-production tracking record.

### 3. Work Order Item is the existing stable production identity and operational ownership seam

- The domain glossary defines one Work Order as a ServiceM8 job and one Work Order Item as exactly one ServiceM8 `jobmaterial` line monitored independently (`CONTEXT.md`).
- `work_order_items` stores stable ServiceM8 item and job UUIDs, item code, quantity, original description, line total, activity state, label lifecycle, and independent RG operational fields. `servicem8_item_uuid` is unique (`packages/db/src/schema-workorders.ts:128-159`; `drizzle/migrations/0050_work_order_items.sql:15-51`).
- ServiceM8 refresh fetches jobs, companies, active jobmaterials, and the material catalogue; normalisation joins `material_uuid` to `material.item_number`, preserves each noisy original description, and emits one input per stable item UUID (`apps/web/modules/work-orders/actions.ts:116-179`; `apps/web/modules/work-orders/servicem8-sync.ts:94-161`).
- Reconciliation upserts each item by `servicem8_item_uuid` without overwriting RG-owned item fields and archives absent items rather than deleting them (`apps/web/modules/work-orders/actions.ts:271-331`).
- The item already has a source fingerprint-driven enrichment precedent: short-label generation runs after reconciliation, does not roll back ServiceM8 sync on AI failure, preserves manual overrides, and reacts to source-description changes (`apps/web/modules/work-orders/actions.ts:345-349`; `apps/web/modules/work-orders/item-label-lifecycle.ts:24-50`).
- Queries already load item data separately after parent pagination and expose it on the summary/detail models (`apps/web/modules/work-orders/queries.ts:118-224`, `307-391`). The detail page renders one article per active or removed item (`apps/web/app/(dashboard)/work-orders/[id]/page.tsx:60-98`).
- Item edits are permission-gated and audited through `work_order_events.work_order_item_id`, providing an existing review/manual-override pattern (`packages/db/src/schema-workorders.ts:174-195`; `apps/web/modules/work-orders/actions.ts:354-452`).

Implication: a structured specification such as system, substrate/material, structure type, internal/external, glass type/thickness, door type, finish, interlinking rail, and conditional components/factors naturally attaches to the production line that has the stable external identity and operational lifecycle.

### 4. Shared lifecycle evidence is already available, but it is not a canonical store

- `loadLifecycleHandoffContext()` accepts a ServiceM8 job UUID and composes linked Lead/client/contact context, Quote/engagement context, separate Lead and Quote AI records, reviewer notes, ServiceM8 notes/emails, interpreted files, and per-source timestamps/status (`apps/web/modules/ai-guidance/lifecycle-handoff.ts:110-157`, `177-223`).
- Its dependencies are explicit adapters, and ServiceM8 history/file failures degrade to partial context instead of discarding the whole read model (`lifecycle-handoff.ts:225-246`, `401-499`).
- The interpreted-file cache is shared by ServiceM8 attachment UUID plus edit date, stores only metadata/AI summaries, and reports interpreted/unsupported/failed counts (`apps/web/modules/ai-guidance/servicem8-file-context.ts:13-57`, `63-126`; `packages/db/src/schema.ts:223-243`).
- The existing MT-191 review explicitly says this loader was built for future Work Orders but is currently consumed only by tests and added no Work Order prompt, UI, or schema (`famiglia/MT-191/review.md:24-34`).

Implication: the handoff model is the correct reusable evidence boundary if extraction needs lifecycle context beyond the item description. It should not become the canonical persistence owner because it is assembled on demand, contains heterogeneous lifecycle records, and has no Work Order Item identity.

### 5. The current Work Order “AI Suggestion” is not this capability

- The Work Order detail page exposes a job-level `AI Suggestion` string and five-minute refresh cooldown (`apps/web/app/(dashboard)/work-orders/[id]/page.tsx:100-127`).
- `generateWorkOrderAiSuggestionAction()` selects parent/job-level legacy fields and saves one string directly to `work_orders.ai_suggestion` (`apps/web/modules/work-orders/actions.ts:777-817`).
- `buildWorkOrderAiSuggestion()` is deterministic string assembly; it does not call OpenAI, inspect jobmaterials, use lifecycle handoff context, emit structured output, or preserve model/prompt/source metadata (`apps/web/modules/work-orders/actions.ts:877-899`).
- The shared AI Guidance runtime already provides validated generation, prompt/model/input versions, timeout, retry/regeneration cooldowns, and durable failure record shape (`apps/web/modules/ai-guidance/runtime.ts:1-49`, `51-145`).

Implication: do not extend the legacy parent `aiSuggestion` text column into the canonical production-spec store. Treat replacement or coexistence as an explicit migration/product decision.

## Recommended ownership and seams

### Canonical owner

- Domain: `apps/web/modules/work-orders/`
- Persistence: `packages/db/src/schema-workorders.ts` plus an additive migration
- Identity: internal `workOrderItemId` with stable `servicem8ItemUuid` and parent `servicem8JobUuid`
- Likely module seam: a dedicated extractor/lifecycle module (for example, a production-spec enrichment service) invoked **after successful atomic ServiceM8 reconciliation**, following the non-blocking short-label pattern
- Query/UI seam: extend `WorkOrderItemSummaryRow` and the detail/summary item surfaces only after the display/edit/review contract is defined
- Audit seam: `workOrderEvents.workOrderItemId` for accepted manual corrections or review transitions

For persistence, prefer a distinct Work Order-owned enrichment record over overloading `work_orders.ai_suggestion` or Quote Tracker. The exact shape is a design decision, but it needs at least: item FK, schema/extractor version, source-description fingerprint, structured output, status, source/provenance metadata, generated/updated timestamps, and safe failure/review state. If staff must filter/report individual attributes, select typed columns or explicit indexes rather than leaving all semantics in unindexed JSON.

### Shared input, not canonical owner

- Reuse `loadLifecycleHandoffContext()` for cross-lifecycle job evidence only when the extractor needs it.
- Pass the current Work Order parent/item data separately so item identity and current operational truth remain explicit.
- Keep the extractor interface domain-specific even if it uses shared AI runtime/file adapters. Extract a shared production-spec vocabulary later only if another bounded context demonstrably needs the same validated object.

### Source precedence that must be decided before implementation

The repository does not define which source wins when they conflict. Product must decide at least:

1. ServiceM8 jobmaterial description/current material catalogue versus older calculator/Lead text.
2. Quote PDF/file interpretation versus current jobmaterial description.
3. Parent-job facts versus per-item facts.
4. AI-extracted values versus staff-reviewed/manual corrections.
5. Whether a changed description invalidates all fields or only affected fields.

## Existing test seams and likely additions

Existing focused seams are healthy: on 2026-07-15, 61 tests passed across lifecycle handoff, shared AI runtime, Work Order detail page, Work Order permissions/actions, and Work Order queries using:

`npm.cmd test -- --run modules/ai-guidance/__tests__/lifecycle-handoff.test.ts modules/ai-guidance/__tests__/runtime.test.ts modules/work-orders/__tests__/detail-page.test.ts modules/work-orders/__tests__/actions-permissions.test.ts modules/work-orders/__tests__/queries.test.ts --reporter=verbose`

Likely new tests:

- Pure extractor contract tests with representative noisy ServiceM8 descriptions, missing/ambiguous fields, multiple components, contradictions, and conditional factors; validate a versioned schema and prohibit invented values.
- Source-precedence tests using calculator-derived text, Quote/Lead context, files, parent-job fields, and current jobmaterial descriptions.
- Refresh integration tests proving enrichment runs only after committed reconciliation, does not make refresh fail, preserves the last good structured result on provider failure, and re-runs only when its source fingerprint/version changes.
- Identity tests proving two item lines under one job receive independent specifications and a returning/removed item retains its enrichment/history.
- Permission/audit tests for staff review or manual correction, including preservation across refresh and actor/previous/new values.
- Query/UI tests for structured item display, pending/partial/failed/review states, and no leakage of internal ServiceM8 UUIDs or unsafe provider errors.
- Migration/schema tests for one canonical current enrichment per item (or explicit version history), provenance/version fields, and any required filtering indexes.
- A controlled end-to-end journey with one ServiceM8 job containing differently specified items, plus a source-description change and a failed extraction.

## What I could not determine

- No representative ServiceM8 descriptions or approved output examples were provided, so extraction accuracy and the correct controlled vocabulary cannot be assessed.
- The listed attributes may mix job-level, item-level, and component-level concepts; the repository does not define their cardinality.
- “Material” may mean substrate, glass, hardware, or ServiceM8 catalogue material. The current glossary does not disambiguate it.
- It is unknown whether staff need display only, filtering/export, manual correction, approval, or write-back to ServiceM8.
- It is unknown whether calculator answers should remain authoritative after quoting or only serve as historical evidence.
- `docs/dev/branch-workflow.md`, named in the job state as part of the repository contract, is absent in this checkout. `CLAUDE.md`, `CONTEXT.md`, and `famiglia/profile.json` were available.

These uncertainties require a product contract before schema or prompt design. The most useful next artifact is a small corpus of real anonymised descriptions paired with staff-approved structured outputs and explicit source-precedence decisions.

## Risks spotted

- **Wrong owner/cardinality:** job-level persistence would silently merge distinct item specifications.
- **Stale-history override:** calculator or Quote context could overwrite a later production change in ServiceM8 without a precedence contract.
- **AI hallucination:** conditional components are especially vulnerable to being inferred rather than present; output must support unknown/ambiguous and evidence per field.
- **Refresh coupling:** synchronous extraction inside the atomic ServiceM8 transaction would make an external AI/file failure threaten operational freshness.
- **Manual correction loss:** generated updates need the same override/source-change protection already used for item labels.
- **Schema opacity:** a single unversioned JSON blob would be difficult to query, migrate, audit, or validate.
- **Cost/latency:** lifecycle file interpretation plus per-item generation can multiply external calls; caching/fingerprints, bounded concurrency, and explicit status/observability are required.
- **Existing dirty worktree:** ServiceM8 timeout/pagination changes and MT-192 artifacts are user-owned and must remain outside this feature's commits.

## Recommended next move and size

Run a focused product/specification interview before implementation. Lock the per-field vocabulary/cardinality, evidence requirements, source precedence, staff review behavior, and visible workflow using real anonymised examples.

Size recommendation: **full**. Even with strong reusable seams, this crosses calculator/Lead history, Quote context, ServiceM8 jobmaterial/files, Work Order item persistence, external AI/runtime behavior, schema/migration, UI/review, audit, and operational observability. It should be sliced vertically; a sensible first tracer is one item description -> validated structured record -> item detail read-only display -> source-change refresh behavior, without cross-item bulk extraction or filtering until the contract is proven.
