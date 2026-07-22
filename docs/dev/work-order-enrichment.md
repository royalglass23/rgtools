# Work Order Production Specification enrichment

Work Order enrichment uses durable, versioned jobs after ServiceM8 reconciliation commits. There
are two Manage-only operating paths:

- **Update job** refreshes one exact ServiceM8 Work Order, commits its saved job and item changes,
  then processes only that job's currently available AI drafts.
- **Refresh all jobs** performs broad ServiceM8 discovery and reconciliation without waiting for
  OpenAI. Eligible new items are queued and must later be processed by entering each job number in
  **Update job**.

A later enrichment failure never rolls back or falsifies a committed reconciliation.

## Hobby deployment

No Work Order enrichment cron is scheduled. This is intentional for the Vercel Hobby plan; the
weekly Work Order retention cron remains separate and scheduled.

1. Apply migrations through `0058_work_order_item_enrichment_jobs.sql` to the intended Neon branch.
2. Configure `OPENAI_API_KEY` in the Vercel environment.
3. Optionally set `OPENAI_MODEL`; the application default is `gpt-5.4-mini`.
4. Deploy the app and confirm `apps/web/vercel.json` contains no
   `/api/cron/work-orders-enrichment` schedule and still contains the weekly retention schedule.
5. As a Manage user, enter a known current ServiceM8 job number and click **Update job**. Confirm the
   result separately reports refreshed items, created drafts, failures, skipped work, delayed
   retries, or remaining queued work.

The protected `/api/cron/work-orders-enrichment` route remains available for explicit operator
diagnostics, but normal button operation does not call it and it is not scheduled. Configure a
strong `CRON_SECRET` only if direct route invocation is required; missing or incorrect credentials
must return `401`.

## Manual processing and recovery

**Update job** fetches only the selected current Work Order, its company, its job-material lines,
and the material records referenced by those lines. It commits reconciliation first, then drains
that job's available enrichment queue with leases, bounded concurrency, per-item timeouts, and a
conservative processing-time budget.

If the time budget is reached, the result says more drafts may remain. Wait one minute, then click
**Update job** again for the same job. If AI infrastructure fails after reconciliation, the result
still confirms that the ServiceM8 update was saved and says queued drafts remain retryable.

Delayed retries are not available again until their bounded backoff expires. Wait for the stated
delay, then click **Update job** again. For a terminal **Enrichment failed - Retry** item, verify the
original ServiceM8 description and use the item-level **Retry** control. There is no automatic daily
enrichment fallback.

After **Refresh all jobs**, use the dashboard's queued/failed item states to identify job numbers
that still need **Update job**. The durable queue preserves this work until a Manage user processes
or retries it.

## Data boundary

The provider receives only the redacted ServiceM8 item description and the active approved
Production Specification catalogue. Known client/company names, job addresses, email addresses,
phone numbers, and prices are removed before a job is stored. Client contacts, quote PDFs, broad
job history, and line prices are not sent. Provider output is treated as untrusted and must pass
the versioned schema, catalogue, size, evidence, and hostile-input validation before persistence.

## Runtime safety

Workers claim jobs with a lease and bounded concurrency. Each identity includes item, source
fingerprint, extraction schema version, and prompt version. Timed-out or invalid attempts retry
with bounded backoff; terminal failures expose only staff-safe state. Jobs created by an older
schema or prompt are never executed under current rules. A Manage-user retry creates or requeues
the current version and writes an attributable Work Order event.

Monitor queued, processing, retry, and failed states in the Work Orders UI, plus application and
audit logs for repeated failures. The item and original ServiceM8 description remain usable when
enrichment fails.

## Dashboard review states

Keep each item's Production Specification collapsed by default so the Work Orders dashboard remains
compact. While enrichment is queued or processing, show the status instead of an empty TBC review
form. When a draft is ready, **View specification** reveals the editable catalogue-backed fields
for staff review. Do not duplicate the original ServiceM8 description, a read-only field summary,
or revision history above that editor.

Staff may confirm a Production Specification only when every dropdown contains an approved catalogue
value or **Not Applicable**. **TBC** means an applicable value is still unknown, and **Unmapped** means
source wording has not yet been matched to an approved value; either state blocks confirmation.
Enrichment must leave a source-silent dropdown as **TBC** rather than infer **Not Applicable**; staff
choose **Not Applicable** during review when the field does not apply to that item.
If a source-supported value is **Unmapped**, retain it as unresolved and keep the item in **Needs
Review** until an approved catalogue option exists; never substitute an approximate option.
Grandfather existing confirmed specifications that already contain **TBC** or **Unmapped**: preserve
their confirmed status and display the unresolved values. Apply the resolution gate when confirming
a new draft or reconfirming an edited specification; do not rewrite historical records in place.

Measurements, Additional Components, and Special Requirements are deferred from the current review
surface and enrichment output. Retain their existing stored fields as empty arrays for compatibility;
do not remove existing data or introduce a destructive schema migration.

Before confirmation, retain the item's existing editable label. Confirming a fully resolved Production
Specification automatically rebuilds the Production Label from its approved dropdown values, omitting
**Not Applicable** fields. A confirmed item no longer permits an independent free-text label override;
staff correct its dropdown values and reconfirm so the label and specification remain consistent.

## Rollback

Set `NEXT_PUBLIC_WORK_ORDER_PRODUCTION_SPECIFICATIONS_ENABLED=false` to disable the specification
surface. To stop enrichment execution completely, also disable the **Update job** action and the
protected direct route in the deployment, then redeploy. Do not drop the job/specification tables:
queued jobs, drafts, evidence, and audit history are durable operational records. Re-enable the
surface and manual processing action after the issue is corrected.
