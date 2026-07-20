# Quote Movement

Quote Movement is the cached, read-only monitoring history of ServiceM8 Quote jobs in rgtools.

## Scope

- `/quote-movement` lists cached ServiceM8 Quote records with Search, Project Complexity, Active/Converted, and Sort controls. Active is the default lifecycle.
- `/quote-movement/[id]` presents the cached What Matters Now summary, Source Coverage, contextual evidence links, and protected Quote history after conversion. `/quote-movement/[id]/evidence/[sourceIdentity]` opens one retained supporting source at a time.
- Access reuses the existing `quote-tracker` module grant. Admins keep implicit access through the normal guard.
- rgtools performs one-way inbound reads from ServiceM8. It does not write Quote Movement state back to ServiceM8. The staff-selected `project_complexity` field is RG-owned and is omitted from snapshot upserts.

## Data flow

Manual refresh calls `refreshQuoteMovementAction`, which checks `quote-tracker` access, records the acting user when available, and calls `refreshQuoteMovementFromServiceM8`.

The sync reads:

- `/job.json` filtered to active `Quote` jobs.
- `/job.json` filtered separately to active `Work Order` jobs for conversion evidence.
- `/company.json` for customer names.
- `/jobmaterial.json` filtered to active lines for ex-GST value totals.
- The complete accessible note, email, file, photo, and quote-change source sets for each active Quote job.
- Existing rgtools tracked-open and tracked-download events associated with the ServiceM8 job.

The resulting Quote snapshot is upserted into `quote_movement_records`. An existing monitored record whose ServiceM8 UUID appears in the active Work Order response receives a one-way `converted_at` marker and keeps its Project Complexity, sources, and enrichment history. Previously cached records absent from both responses are marked inactive but are not inferred to be converted. A failed ServiceM8 read leaves the previous cache and conversion state intact.

After source persistence commits, the summary repository fingerprints the meaningful record fields and complete retained source set. A first-seen or changed fingerprint is sent automatically to the controlled What Matters Now summarisation adapter; unchanged history is skipped. The adapter uses strict structured output and may extract only Current Position, Material Facts, Important Dates, Participants, Unresolved Matters, Latest Meaningful Movement, relevant Consent State, and retained source identities as Supporting Evidence. It must not produce scores, rankings, recommendations, sales actions, drafts, or a raw chronological history.

Valid summaries are cached on the Quote Movement record with their source fingerprint and generated timestamp. Provider or validation failure records only a staff-safe attempted timestamp/error and leaves the last valid cached summary and fingerprint unchanged. Routine automated tests inject a deterministic summarisation adapter and never call live OpenAI.

Refresh attempts are recorded in `quote_movement_refresh_runs`. On ServiceM8 failure, rgtools stores a staff-safe failure message and leaves the previous cache intact.

Source collection is intentionally fail-safe. A failed collection or interpretation is recorded as incomplete coverage without deleting an earlier retained source. `latest_activity_at` is derived only from meaningful source timestamps; sync metadata does not advance it.

## Tables

- `quote_movement_records` stores ServiceM8 job identity, customer/address fields, ex-GST quote value, active status, nullable `converted_at` evidence, RG-owned Project Complexity, source update time, meaningful latest activity, source-coverage state/counts, the structured cached summary, summary fingerprint/generation state, and last rgtools sync time.
- `quote_movement_sources` retains immutable provider evidence by stable source identity. A later refresh updates the same retained source if ServiceM8 reclassifies it; absence from a later response never deletes it.
- `quote_movement_source_enrichment` stores RG-owned interpretation state, staff-safe errors, and summaries separately from provider evidence.
- `quote_movement_refresh_runs` stores success/failure metadata, synced row count, optional actor, and safe error text.

The persistence transaction upserts current records and retained sources atomically. Source identity is unique within a Quote Movement record, so concurrent refreshes cannot create duplicate history entries.

## Coverage contract

Coverage is `complete` only when every discovered source has been retained and interpreted. It is `incomplete` when any source is unread, unsupported, failed, inaccessible, or could not be retained. Counts and staff-safe details explain the gap; they never imply that unavailable evidence was inspected.

Both list and detail summaries display Complete or Incomplete Source Coverage. The detail view includes unread counts and safe details. Coverage is calculated by deterministic ingestion code and is not delegated to the summarisation provider.

## List and mutation contract

`listQuoteMovementRecords(filters)` searches job number, customer, and address; filters by the database-backed complexity enum and lifecycle; and applies deterministic Latest Activity, Quote Value, or Customer ordering. Active requires an active ServiceM8 Quote with no conversion marker. Converted requires explicit `converted_at` evidence. Latest Activity and Quote Value sort descending with nulls last. Customer sorts ascending.

List and detail queries derive `workOrderId` by joining the current Work Order on `servicem8_job_uuid`; Quote Movement stores no redundant Work Order foreign key. Converted history remains reachable even when no current Work Order row is available, with an explicit fallback state.

`updateQuoteMovementComplexityAction(formData)` reuses `requireModule('quote-tracker')`, accepts only `recordId` and an approved complexity value, calls the narrow repository updater, and revalidates `/quote-movement`. Important Now displays the cached Current Position plus Source Coverage, or **Not yet summarised** while the first background summary is pending.

## Follow-on slices

Later tickets make refresh scheduling non-blocking/resilient and prove the secured ten-second journey. Quote Movement remains a monitoring surface rather than a workflow manager.
