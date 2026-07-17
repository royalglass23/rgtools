# Work Order Production Specification enrichment

Work Order enrichment runs asynchronously after a successful ServiceM8 reconciliation commits.
Eligible new active item lines receive a versioned durable job; refresh does not wait for OpenAI
and a later enrichment failure does not roll back or falsify the committed reconciliation.

## Deployment

1. Apply migrations through `0058_work_order_item_enrichment_jobs.sql` to the intended Neon branch.
2. Configure `OPENAI_API_KEY` and a strong `CRON_SECRET` in the Vercel environment.
3. Optionally set `OPENAI_MODEL`; the application default is `gpt-5.4-mini`.
4. Deploy the app and confirm `/api/cron/work-orders-enrichment` appears in Vercel Cron Jobs with
   the schedule from `apps/web/vercel.json`.
5. Confirm an authorised invocation returns `200` with only safe counters for claimed, drafted,
   retried, failed, and skipped jobs. Missing or incorrect cron credentials must return `401`.

## Data boundary

The provider receives only the redacted ServiceM8 item description and the active approved
Production Specification catalogue. Known client/company names, job addresses, email addresses,
phone numbers, and prices are removed before a job is stored. Client contacts, quote PDFs, broad
job history, and line prices are not sent. Provider output is treated as untrusted and must pass
the versioned schema, catalogue, size, evidence, and hostile-input validation before persistence.

## Runtime and recovery

Workers claim jobs with a lease and bounded concurrency. Each identity includes item, source
fingerprint, extraction schema version, and prompt version. Timed-out or invalid attempts retry
with bounded backoff; terminal failures expose only the staff-safe retry state. Jobs created by an
older schema or prompt are never executed under current rules. A Manage-user retry creates or
requeues the current version and writes an attributable Work Order event.

Monitor Vercel Cron invocations for missing schedules, `401`, `500`, repeated retries, or growing
failed counts. The item and original ServiceM8 description remain usable when enrichment fails.

## Rollback

Set `NEXT_PUBLIC_WORK_ORDER_PRODUCTION_SPECIFICATIONS_ENABLED=false` and remove or disable the cron
schedule to stop the surface and worker, then redeploy. Do not drop the job/specification tables as
an application rollback: queued jobs, drafts, evidence, and audit history are durable operational
records. Re-enable the flag and schedule after the issue is corrected.
