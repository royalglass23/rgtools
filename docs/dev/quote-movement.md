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

The resulting snapshot is upserted into `quote_movement_records`. Previously cached records that are not present in the refreshed active Quote snapshot are marked inactive, leaving historical cache rows available for diagnostics and detail-route safety.

Refresh attempts are recorded in `quote_movement_refresh_runs`. On ServiceM8 failure, rgtools stores a staff-safe failure message and leaves the previous cache intact.

## Tables

- `quote_movement_records` stores ServiceM8 job identity, customer/address fields, ex-GST quote value, active status, source update time, and last rgtools sync time.
- `quote_movement_refresh_runs` stores success/failure metadata, synced row count, optional actor, and safe error text.

## Follow-on slices

MT-220 and later tickets add conversion history, summaries, complexity, filtering, and conversion-candidate workflows. This foundation intentionally avoids those decisions.
