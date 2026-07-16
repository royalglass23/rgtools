# Specification Catalogue: govern canonical names, aliases, and PS applicability

Status: ready-for-agent

## Parent

Work Order Enrichment contract: `famiglia/workorder-enrichment/contract.md`

## What to build

Provide Configure-user governance for the shared Royal Glass Specification Catalogue. Canonical values must have stable identities, approved display/label wording, aliases, active/deprecated state, and PS1/PS3 applicability. Work Orders and PS Generator must map overlapping concepts through those identities while retaining familiar context-specific UI wording. Catalogue changes that affect confirmed items require impact preview, confirmation, deterministic label rebuild, and system history.

## Acceptance criteria

- [ ] Catalogue options have stable immutable IDs, field/category ownership, display label, Production Label wording/abbreviation, aliases, sort order, PS1 applicability, PS3 applicability, and active/deprecated state.
- [ ] Only Configure users can add, rename, alias, deactivate, reorder, or change PS applicability.
- [ ] Manage users can select approved options or preserve item-specific Unmapped text but cannot mutate the shared catalogue.
- [ ] Options are deprecated/deactivated rather than deleted when history or confirmed specifications reference them.
- [ ] Known source aliases resolve to one canonical value without creating duplicate filter/export identities.
- [ ] Glass Construction maps to the PS context currently labelled Glass type; Glass Appearance maps separately from calculator appearance/colour values.
- [ ] Non-PS production values can be marked `Not used for PS` and remain valid in Work Orders.
- [ ] Renaming or deactivating a used option shows an affected-item count and preview and requires explicit confirmation.
- [ ] A confirmed global naming change rebuilds affected Production Labels from stable IDs and creates system-generated history for each affected item.
- [ ] The slice does not generate PS documents or parse Production Labels for PS input.
- [ ] Catalogue authorization, alias collision, deactivation/history, impact preview, label rebuild, Work Orders mapping, and PS compatibility tests pass.

## Blocked by

Production Specifications: review and confirm one item end-to-end.
