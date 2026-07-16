# Work Order retention cleanup

The Work Order retention cleanup runs weekly through Vercel Cron at `15:00 UTC` every Sunday
(early Monday in New Zealand). It removes only data outside the approved retention windows:

- completed and inactive Work Orders, their items, and events after 7 years;
- Work Order refresh-run history after 2 years;
- raw ServiceM8 snapshots are not retained.

## Deployment

1. Apply Work Order migrations through `0056_work_order_retention_index.sql`.
2. Set a strong `CRON_SECRET` in the Vercel Production environment.
3. Deploy `main`. Vercel registers the schedule from `apps/web/vercel.json` on the production deployment.
4. Confirm `/api/cron/work-orders-retention` appears in the Vercel Cron Jobs page.

The endpoint fails closed with `401` when `CRON_SECRET` is missing or the bearer token does not
match. Successful responses contain only deletion counts. Internal failures return a safe `500`
response and write the error to Vercel logs.

## Manual verification

Run the same cleanup directly from `apps/web` only when the target `DATABASE_URL` has been
explicitly verified and approved:

```powershell
pnpm work-orders:retention-cleanup
```

After the first scheduled run, confirm a `200` result in Vercel Cron logs and record the deletion
counts. Investigate any `401`, `500`, missing invocation, or unexpected count before the next run.

## Rollback

Disable the cron entry or remove the schedule and redeploy if cleanup must stop. The endpoint can
remain deployed while disabled because it is protected by `CRON_SECRET`. Migration `0056` adds only
an index and does not need to be removed to stop cleanup. Deleted expired records are not restored
by an application rollback; database point-in-time recovery is the recovery path for an erroneous
cleanup, so the target database retention and recovery window must remain enabled.
