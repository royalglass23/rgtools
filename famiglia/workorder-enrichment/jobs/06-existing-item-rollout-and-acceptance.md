# Existing Item Rollout: supervised batch, observability, rollback, and acceptance

Status: ready-for-agent

## Parent

Work Order Enrichment contract: `famiglia/workorder-enrichment/contract.md`

## What to build

Make the completed Production Specification capability safe to introduce across existing active Work Order Items. A manager deliberately starts the one-time enrichment batch, sees live progress and outcome counts, cannot duplicate an active run, and can resume failed work. Add operational metrics/redaction, reversible enablement, migration/rollback proof, performance and security gates, and the complete staging acceptance journey. Preserve the existing short label/original description as fallback and prove that this release neither generates producer statements nor writes to ServiceM8.

## Acceptance criteria

- [ ] Deployment alone never starts bulk enrichment; a Manage-authorized explicit action starts the existing-active-item batch.
- [ ] The batch excludes removed items and skips items with confirmed specifications or already-current work keys.
- [ ] Staff can see total, queued/processing, drafted, Needs Review, Unmapped, failed, and retried counts plus clear running/completed/failed state.
- [ ] Concurrent duplicate starts are prevented, and interrupted/failed work can resume without duplicating successful drafts.
- [ ] Long-running controls show pending state and prevent duplicate submission.
- [ ] Structured logs and metrics include correlation IDs, counts, duration, and safe failure class without client names, addresses, descriptions, prices, secrets, or raw provider responses.
- [ ] The feature can be reversibly disabled while existing short-label/original-description behavior remains usable; disabling never deletes specifications or history.
- [ ] Additive migration forward/rollback rehearsal succeeds without destructive data loss.
- [ ] A realistic 100-item refresh fixture proves provider calls are off the refresh critical path and enqueue overhead stays within one second of baseline.
- [ ] Dashboard query/render performance stays within the approved 10-percent regression budget on the realistic fixture.
- [ ] The complete Manage/View/Configure journey passes in a real browser, including draft review, confirmation, client-request change, source change, catalogue impact, search/filter/export, failure/retry, and batch progress.
- [ ] Accessibility verification covers keyboard expansion, focus restoration, live status, field errors, and read-only semantics.
- [ ] Security verification covers authorization negatives, hostile source text, prompt-injection-like content, oversized input, catalogue abuse, log/error redaction, and external-call isolation.
- [ ] Staging documentation covers catalogue seed, golden examples, explicit batch, success/failure review, rollback, monitoring signals, and the observation period.
- [ ] Runtime/contract tests prove no Work Order save writes to ServiceM8 and no Work Order action generates PS1 or PS3 in this release.

## Blocked by

- AI Enrichment: create safe drafts after ServiceM8 refresh.
- Change Lifecycle: audited client revisions and ServiceM8 source comparison.
- Specification Catalogue: govern canonical names, aliases, and PS applicability.
- Work Orders Discovery: search, configurable filters, and CSV export.
