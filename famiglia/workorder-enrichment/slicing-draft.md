# Work Order Enrichment - proposed vertical slices

Parent contract: `contract.md`

Status: Approved on 2026-07-16. Published as local agent-ready briefs under `jobs/` because the repository profile does not configure an issue tracker.

## 1. Production Specifications: review and confirm one item end-to-end

- Blocked by: None - can start immediately.
- User stories covered: 1-13, 18-21, 32-33, 41-43, 58-59.
- Observable outcome: one Work Order Item can hold a structured draft and confirmed Production Specification, render a deterministic two-line Production Label, expose full details/components/requirements, enforce View/Manage permissions, establish the first audited baseline, and preserve data through removal/return.
- Includes the additive persistence/revision foundation, shared-catalogue read seam with initial seed values, core field validation, repeatable components/requirements, manual draft creation/correction, confirmation, label composition, expanded item UI, and legacy-label fallback.

## 2. AI Enrichment: create safe drafts after ServiceM8 refresh

- Blocked by: Slice 1.
- User stories covered: 14-17, 20-21, 50-54, 60.
- Observable outcome: a successful ServiceM8 refresh queues AI enrichment for a new item, returns without waiting for the provider, and later displays a validated `Needs Review` draft with evidence/TBC/Unmapped states; provider failure leaves the item visible with safe retry.
- Includes the minimal-data AI adapter, versioned structured-output validation, idempotent durable work, bounded execution/retries, safe error translation, source fingerprint/version keys, and the eight-description golden regression corpus.

## 3. Change Lifecycle: audited client revisions and ServiceM8 source comparison

- Blocked by: Slices 1 and 2.
- User stories covered: 22-31.
- Observable outcome: a Manage user changes a confirmed value such as Chrome to Matte Black with a required reason, the Production Label updates, and all staff can see the immutable before/after history; a later ServiceM8 description change preserves RGTools truth and offers compare, ignore, or new-draft actions.
- Includes reason validation, atomic revision promotion, component/requirement change history, source-change warning and decisions, explicit new draft creation, and concurrency protection against stale edits.

## 4. Specification Catalogue: govern canonical names, aliases, and PS applicability

- Blocked by: Slice 1.
- User stories covered: 34-40, 62.
- Observable outcome: a Configure user manages approved names, label abbreviations, aliases, active/deprecated state, and PS1/PS3 applicability; Manage users can select approved values or retain item-specific Unmapped text; changing a used option shows impact, requires confirmation, rebuilds labels, and writes system history.
- Includes shared Work Orders/PS Generator identities and boundary mappings, including Glass Construction versus Glass Appearance, without adding Work Order PS generation.

## 5. Work Orders Discovery: search, configurable filters, and CSV export

- Blocked by: Slice 1.
- User stories covered: 44-49.
- Observable outcome: staff can locate items by current Production Label/specification values, administrators globally configure any useful specification filters without a fixed count, and CSV exports confirmed specification fields plus review status while excluding drafts/history from confirmed columns.
- Includes canonical-ID filtering, current-only search semantics, parent/item visibility rules, export limits, and authorization/configuration regression coverage.

## 6. Existing Item Rollout: supervised batch, observability, rollback, and acceptance

- Blocked by: Slices 2, 3, 4, and 5.
- User stories covered: 55-57, 61, 63, plus the cross-slice success criteria.
- Observable outcome: a manager explicitly enriches existing active items with visible progress/counts, duplicate-start protection, resumable failures, and no deploy-time surprise; the complete role/change/source/catalogue/search/export journey passes in staging with performance, accessibility, security, logging, migration, and rollback evidence.
- Includes the reversible feature/configuration flag, legacy-label fallback, operational metrics/redaction, realistic performance budgets, migration/rollback rehearsal, staging runbook, and proof that no current save writes to ServiceM8 or generates PS documents.

## Dependency shape

```text
Slice 1
|- Slice 2 -> Slice 3 -|
|- Slice 4 ------------|-> Slice 6
`- Slice 5 ------------|
```

## Capo recommendation

Keep all six slices separate. Slice 1 is the smallest useful tracer that proves the domain and UI. Combining Slice 2 with Slice 6 would make AI runtime and rollout supervision too large to verify honestly. Slices 4 and 5 can proceed independently after Slice 1, reducing the critical path without creating horizontal-only work.
