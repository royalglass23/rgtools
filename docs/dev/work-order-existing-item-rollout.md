# Existing-item Production Specification rollout

This rollout is a manager-started, one-time enrichment of existing active Work Order Items. A
deployment or migration never starts it. The batch only creates reviewable drafts; it never confirms
a specification, writes to ServiceM8, or generates PS1 or PS3 documents.

## Staging prerequisites

1. Use the isolated staging database and verify its Work Orders acceptance sentinel.
2. Apply the reserved Quote Movement migrations `0061–0065` before the Work Orders migrations
   `0066_work_order_existing_item_rollout` and `0067_work_order_rollout_retry_marker`.
3. **Catalogue seed:** open Work Orders configuration and confirm every active canonical option,
   alias, Production Label value, and PS applicability flag required by the rollout corpus.
4. **Golden examples:** run the eight approved Production Specification examples and review their
   structured meaning, evidence, deterministic label, Unmapped values, and Location TBC behavior.
5. Keep `WORK_ORDER_EXISTING_ITEM_ROLLOUT_ENABLED=false` during deployment and migration checks.

## Migration and rollback rehearsal

The migrations are additive: they add a rollout ledger and nullable enrichment-job metadata. They
do not rewrite or remove Work Order Items, specifications, drafts, confirmed values, labels, or
history. On a disposable sentinel-verified staging clone:

1. Record counts for Work Order Items, enrichment jobs, specifications, and revisions.
2. Apply migrations through `0067` and confirm the recorded counts are unchanged.
3. In a transaction, rehearse the inverse schema operations against only the newly added rollout
   table and columns, verify the pre-existing counts, and issue `ROLLBACK` rather than `COMMIT`.
4. Re-run the application migrations and `drizzle-kit check` to prove the forward path remains clean.

Operational rollback is flag based: set `WORK_ORDER_EXISTING_ITEM_ROLLOUT_ENABLED=false` and
redeploy. Rollback must never delete specifications, drafts, enrichment jobs, labels, or immutable
history. Existing short labels and original ServiceM8 descriptions remain available through the
separate Production Specification surface flag.

## Explicit batch start

1. Set `WORK_ORDER_EXISTING_ITEM_ROLLOUT_ENABLED=true` and deploy to staging.
2. Sign in with Manage Work Order access and open `/work-orders`.
3. Confirm the panel says no rollout has started; deployment alone must leave all rollout counts at
   zero and make no provider calls.
4. Select **Start existing-item enrichment** once. Confirm the button announces its pending state
   and cannot be submitted twice.
5. Record the correlation ID, total, queued, processing, drafted, Needs Review, Unmapped, failed,
   retried, and skipped counts.

## Success and failure review

- Review generated drafts against original descriptions and the golden examples. Drafts remain
  Needs Review until a manager explicitly confirms them.
- Confirm removed items, confirmed specifications, and already-current work keys were skipped.
- Force a safe provider failure and confirm staff see only the safe failure class and **Resume failed
  enrichment**. Resume must preserve successful drafts and requeue only failed work.
- Exercise the Manage, View, and Configure journey: draft review, confirmation, client-request
  change, ServiceM8 source comparison, catalogue impact, search/filter/export, failure/resume, and
  batch progress.
- Verify keyboard operation, focus restoration, live status announcements, field-error association,
  and read-only semantics for View users.
- Verify hostile and prompt-injection-like text, oversized source input, catalogue abuse,
  authorization negatives, log/error redaction, and external-call isolation.

## Performance acceptance

Use the realistic 100-item fixture. Compare five warmed median runs against the pre-rollout baseline.
Provider generation must remain outside the refresh critical path, enrichment enqueue overhead must
stay within one second of baseline, and dashboard query/render duration must stay within the approved
10-percent regression budget. Record fixture seed, timings, commit, database branch, and runner.

## Monitoring signals

Monitor structured `work_order.existing_item_rollout_status` events by correlation ID. Alert on a
stalled processing count, growing failed count, repeated retries, `enrichment_failed`, duration above
the staging budget, or a mismatch between total and terminal outcomes. Logs and errors may contain
counts and safe failure classes only—never client names, addresses, descriptions, prices, secrets,
or raw provider responses.

## Observation period

Observe staging for at least one full business day after the batch reaches a terminal state. Review
progress, failures, retries, draft quality, dashboard latency, and logs at start, midpoint, completion,
and the end of the observation period. Disable the rollout flag immediately if safety, privacy,
performance, or data-integrity signals breach their gates.
