# AI Enrichment: create safe drafts after ServiceM8 refresh

Status: ready-for-agent

## Parent

Work Order Enrichment contract: `famiglia/workorder-enrichment/contract.md`

## What to build

After a successful ServiceM8 reconciliation, durably and asynchronously enrich new active Work Order Items that lack a confirmed specification. The AI boundary receives only minimal item/source context and returns schema-validated catalogue IDs, evidence, TBC/Unmapped candidates, components, and requirements. Refresh must not wait for or roll back because of AI. Staff see safe queued, processing, Needs Review, failure, and retry states. The eight approved descriptions become the golden naming/extraction regression corpus.

## Acceptance criteria

- [ ] Successful ServiceM8 reconciliation durably queues eligible new active items only after the transaction commits.
- [ ] The refresh response does not wait for provider generation and remains successful if enrichment later fails.
- [ ] Work is idempotent by item, source fingerprint, extraction schema version, and prompt version, with one active job per key.
- [ ] Execution has bounded concurrency, timeout, retry limits, safe terminal failure, and duplicate-work protection.
- [ ] The provider receives the minimum necessary item/source data and does not receive client contacts, address, price, quote PDF, or broad lifecycle history.
- [ ] Structured output validation rejects malformed types, unsupported fields, invalid catalogue IDs, unsafe sizes, and invented confirmed values.
- [ ] Known aliases map to stable catalogue IDs; unknown wording is preserved as `Unmapped - Needs Review` with evidence.
- [ ] Drafts are visible with `Needs Review` and are never automatically confirmed.
- [ ] Provider failure leaves the item and original ServiceM8 description visible with a staff-safe `Enrichment failed - Retry` state for Manage users.
- [ ] Confirmed Production Specifications are never regenerated or overwritten by this automatic path.
- [ ] The eight supplied examples pass golden structured-meaning and deterministic-label regression tests, including correct `Location TBC` behavior.
- [ ] Refresh, worker/runtime, schema validation, retry, permission, redaction, hostile-input, and golden-corpus tests pass.

## Blocked by

Production Specifications: review and confirm one item end-to-end.
