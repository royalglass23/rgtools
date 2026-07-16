# Production Specifications: review and confirm one item end-to-end

Status: ready-for-agent

## Parent

Work Order Enrichment contract: `famiglia/workorder-enrichment/contract.md`

## What to build

Deliver the first complete Production Specification tracer for one Work Order Item. Staff must be able to create or receive a structured draft, correct it, confirm it as the RGTools-owned baseline, see a deterministic Production Label in the compact item row, and expand the full specification and history. The slice establishes additive persistence, versioned validation, initial catalogue values, View/Manage permission behavior, repeatable components and special requirements, removal/return preservation, and the legacy-label rollback seam.

## Acceptance criteria

- [ ] One Work Order Item can hold a current draft, a current confirmed Production Specification, and immutable revision/history records without changing its stable ServiceM8 identity.
- [ ] The structured schema supports the approved core fields, measurements, Location environment/detail, Glass Construction, Glass Appearance, separate finish roles, delivery scope, repeatable Additional Components, and repeatable Special Requirements.
- [ ] Missing fields can remain `TBC`, and item-specific unmatched text can remain Unmapped without blocking draft review.
- [ ] A Manage user can correct a draft and confirm it; draft corrections before first confirmation do not require a reason.
- [ ] Confirmation atomically creates the initial audited baseline with actor and timestamp.
- [ ] A view-only user can read the confirmed specification and history but cannot create, change, or confirm a draft.
- [ ] A deterministic Production Label is built from the approved ordered optional fields and catalogue wording, excludes price/boilerplate, and is displayed in approximately two visual lines.
- [ ] `View specification` exposes original ServiceM8 description, structured fields, components, requirements, status, and history with keyboard/focus/screen-reader support.
- [ ] Removed items retain their specification/history, and returning items regain them.
- [ ] Existing short-label/original-description behavior remains available as a reversible fallback while the new feature is disabled or lacks a confirmed specification.
- [ ] Additive migration, schema, action, query, UI, permission, audit, item-lifecycle, and accessibility tests pass through public seams.

## Blocked by

None - can start immediately.
