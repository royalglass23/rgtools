# Change Lifecycle: audited client revisions and ServiceM8 source comparison

Status: ready-for-agent

## Parent

Work Order Enrichment contract: `famiglia/workorder-enrichment/contract.md`

## What to build

Make confirmed Production Specifications safely changeable in RGTools. Every post-confirmation change must require an approved reason and produce understandable immutable history. Rebuild the Production Label from the new confirmed values. When the original ServiceM8 description changes, preserve RGTools truth and give Manage users an explicit compare, ignore, or create-new-draft workflow without losing the last confirmed specification.

## Acceptance criteria

- [ ] A Manage user can edit a confirmed core field, component, or special requirement only with an approved change reason.
- [ ] Supported reasons include Client request, Measurement correction, Design change, Supplier change, and Other; Other requires explanatory text.
- [ ] Each confirmed change atomically records field/component identity, previous value, new value, actor, timestamp, reason, and optional note.
- [ ] The deterministic Production Label rebuilds from the new confirmed values in the same transaction or consistent committed workflow.
- [ ] Concurrent/stale edits are detected and cannot silently overwrite a newer confirmed revision.
- [ ] A changed ServiceM8 source fingerprint never mutates or replaces the confirmed specification.
- [ ] All users can see a Source Changed warning and the relevant source comparison without provider/internal error leakage.
- [ ] A Manage user can explicitly ignore the source change or create a new reviewable draft; both decisions are audited.
- [ ] Creating a new draft leaves the current confirmed specification authoritative until the draft is confirmed.
- [ ] Source-change behavior continues to preserve removed/returning item history.
- [ ] Permission, reason validation, revision concurrency, label rebuild, source compare/ignore/new-draft, and audit-history tests pass, including a Chrome-to-Matte-Black client-request journey.

## Blocked by

- Production Specifications: review and confirm one item end-to-end.
- AI Enrichment: create safe drafts after ServiceM8 refresh.
