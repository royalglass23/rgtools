# Work Orders Discovery: search, configurable filters, and CSV export

Status: ready-for-agent

## Parent

Work Order Enrichment contract: `famiglia/workorder-enrichment/contract.md`

## What to build

Extend Work Orders discovery and export around current Production Specification data. Staff must be able to search current labels and specification values, administrators must globally choose any useful specification filters without a hard count limit, and CSV must add review status and current confirmed specification values without exposing drafts as confirmed or exporting detailed audit history.

## Acceptance criteria

- [ ] Work Orders search matches current Production Labels and current specification values.
- [ ] Search excludes superseded values and change-history notes so old wording does not create stale matches.
- [ ] Specification filters use canonical IDs and retain the existing parent-header/item-match behavior.
- [ ] Configure users can globally enable, disable, and order specification filters with no fixed count limit.
- [ ] Ordinary staff cannot change global filter configuration, and personal filter layouts are not introduced.
- [ ] Disabled filter fields remain searchable.
- [ ] The item-level CSV includes review status and current confirmed specification fields with repeated parent context.
- [ ] Items without a confirmed specification export blank confirmed fields plus their actual review status; draft values are not represented as confirmed.
- [ ] CSV excludes full change history, raw evidence, provider metadata, and source price data.
- [ ] Existing export row limits, authorization, query-state behavior, removed-item handling, and human-readable headings remain intact.
- [ ] Search, canonical filtering, global configuration, permission, pagination/parent visibility, and CSV route/content tests pass.

## Blocked by

Production Specifications: review and confirm one item end-to-end.
