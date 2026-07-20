# Quote Movement

Quote Movement is the cached, read-only view of active ServiceM8 Quote jobs in rgtools.

## Scope

- `/quote-movement` lists cached active ServiceM8 jobs whose status is `Quote`.
- `/quote-movement/[id]` provides the protected detail shell for later Quote Movement slices.
- Access reuses the existing `quote-tracker` module grant. Admins keep implicit access through the normal guard.
- rgtools performs one-way inbound reads from ServiceM8. It does not write Quote Movement state back to ServiceM8.

## Data flow

Manual refresh calls `refreshQuoteMovementAction`, which checks `quote-tracker` access, records the acting user when available, and calls `refreshQuoteMovementFromServiceM8`.

The sync reads:

- `/job.json` filtered to active `Quote` jobs.
- `/company.json` for customer names.
- `/jobmaterial.json` filtered to active lines for ex-GST value totals.
- The complete accessible note, email, file, photo, and quote-change source sets for each active Quote job.
- Existing rgtools tracked-open and tracked-download events associated with the ServiceM8 job.

The resulting snapshot is upserted into `quote_movement_records`. Previously cached records that are not present in the refreshed active Quote snapshot are marked inactive, leaving historical cache rows available for diagnostics and detail-route safety.

Refresh attempts are recorded in `quote_movement_refresh_runs`. On ServiceM8 failure, rgtools stores a staff-safe failure message and leaves the previous cache intact.

Source collection is intentionally fail-safe. A failed collection or interpretation is recorded as incomplete coverage without deleting an earlier retained source. `latest_activity_at` is derived only from meaningful source timestamps; sync metadata does not advance it.

## Tables

- `quote_movement_records` stores ServiceM8 job identity, customer/address fields, ex-GST quote value, active status, source update time, meaningful latest activity, source-coverage state/counts, and last rgtools sync time.
- `quote_movement_sources` retains immutable provider evidence by stable source identity. A later refresh updates the same retained source if ServiceM8 reclassifies it; absence from a later response never deletes it.
- `quote_movement_source_enrichment` stores RG-owned interpretation state, staff-safe errors, and summaries separately from provider evidence.
- `quote_movement_refresh_runs` stores success/failure metadata, synced row count, optional actor, and safe error text.

The persistence transaction upserts current records and retained sources atomically. Source identity is unique within a Quote Movement record, so concurrent refreshes cannot create duplicate history entries.

## Coverage contract

Coverage is `complete` only when every discovered source has been retained and interpreted. It is `incomplete` when any source is unread, unsupported, failed, inaccessible, or could not be retained. Counts and staff-safe details explain the gap; they never imply that unavailable evidence was inspected.

## Follow-on slices

Later tickets present the retained history, summaries, complexity, filtering, and conversion-candidate workflows. MT-220 establishes the evidence and coverage model without turning Quote Movement into a workflow manager.
