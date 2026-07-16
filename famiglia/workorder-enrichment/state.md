# Job: workorder-enrichment

- Mode: full
- Entry: feature
- Current phase: plan
- Status: in-progress
- Repository contract: `CLAUDE.md`, `CONTEXT.md`, `docs/SECURITY.md`, and `famiglia/profile.json`
- Artifact root: `famiglia/workorder-enrichment/`
- Issue/contract: Pending product definition; no exact Linear issue was found
- Approval boundary: Planning artifacts and read-only Linear/repository inspection only; no production code, branch creation, issue mutation, implementation, push, merge, deployment, or production data change is authorized
- Base/target branch: Work in `feature/workorder`; normal promotion is `feature/workorder` -> `dev` -> `main`
- Worktree: `D:\Royal Glass Dev\rgtools\.worktrees\feature-workorder`

## Pipeline

| Stage | Skill | Status | Artifact or evidence |
|---|---|---|---|
| Repository contract | godfather | done | Repository instructions, domain glossary, branch policy, profile, worktree, branch, dirty state, and current commits inspected on 2026-07-15 |
| Scout uncertainty | rat | done | `scout-report.md`; Work Orders, ServiceM8, quote, calculator/Lead, shared lifecycle, persistence, UI, and test seams mapped; 61 focused tests passed |
| Specify feature | sit-down | in-progress | Outcome narrowed to a structured Production Specification derived from noisy ServiceM8 item descriptions; ownership recommendation awaits user approval |
| Quality routing | godfather | in-progress | All six tracks are provisionally required; final requirements depend on the approved ownership and review workflow |
| Vertical slices | capo | blocked | Requires an approved contract |
| Codex execution brief | godfather | blocked | Requires approved slices and a Linear contract reference |
| Approval gate | godfather | blocked | PRD, slice boundaries, dependencies, test seams, and execution brief do not yet exist |

## Repository and issue evidence

- The current branch is `feature/workorder` at `73c3e843`, aligned with `origin/feature/workorder` at inspection time.
- The worktree contains unrelated in-progress changes for the MT-192 security/verification follow-up; they are preserved and out of scope.
- Existing Work Order Items behavior is already contracted under `famiglia/work-order-items/contract.md` and delivered through MT-193 to MT-199.
- Linear search found no exact `workorder-enrichment` issue.
- MT-149 (done) uses "Work Order Enrichment" for auditable manual operational edits.
- MT-191 (done) provides a lifecycle context read model but explicitly excludes Work Order AI Guidance UI and prompt implementation.
- Quote Tracker persists only quote-level free-text job description and PDF metadata. It does not own ServiceM8 `jobmaterial` lines or a structured production specification.
- Work Order Items already own the immutable ServiceM8 item description, source fingerprint, AI label lifecycle, manual override behavior, and item-level audit seam.
- Lead Intake calculator submissions demonstrate that some upstream sources can already supply structured values such as substrate, fixing, glass type/colour, and hardware, but those values are not consistently available for every ServiceM8 job.

## First product decision

Approve or reject this ownership boundary:

- The feature belongs primarily to **Work Orders**, where the accepted/current production scope is consumed.
- Each Work Order Item gets a structured **Production Specification** derived from its immutable ServiceM8 item description.
- Quote, Lead, and Calculator data is optional supporting evidence when linked and reliable, not the owning record.
- The extractor is implemented behind a reusable domain interface so a later Quote-stage preview can reuse it without making Quote Tracker the production source of truth.
- The extracted result is advisory until a staff member reviews it; it does not silently change ServiceM8-owned values or existing RG operational fields.

## Accepted requirements from the sit-down

- A Work Order Item's Production Specification can change after the initial quote because the client may revise a selection before installation.
- Every confirmed specification change must automatically create an immutable, staff-visible history entry showing the field, previous value, new value, actor, timestamp, and available reason/source context.
- The item surface must make this history understandable to staff who were not involved in the client conversation; for example, `Finish: Chrome -> Matte Black`.
- This audit history applies to any specification field, not only finish.
- A change reason is mandatory whenever staff change a confirmed specification. Initial reason choices are `Client request`, `Measurement correction`, `Design change`, `Supplier change`, and `Other`; `Other` requires explanatory text.
- RGTools is the source of truth for confirmed Production Specification edits; staff are expected to make those changes in RGTools rather than ServiceM8.
- ServiceM8 write-back is a possible future integration, but it is out of scope for this feature and must never be implied by an RGTools save.
- The design must retain the stable ServiceM8 item UUID and sufficient sync/audit metadata so a later explicit outbound-sync workflow can be added safely.
- The existing Work Order Item Label will become more detailed while remaining quickly readable; abbreviations must come from an agreed Royal Glass vocabulary rather than arbitrary AI shorthand.
- The detailed label is the **Production Label** and is rebuilt automatically from the item's confirmed Production Specification whenever a confirmed field changes; it is not maintained as an independent conflicting description.
- Production Label ordering includes `Location` immediately followed by `Structure Type`, for example `Ext Deck`, `Int Stair Area`, or `Int/Ext Stair and Landing`.
- `Location` has exactly three display values: `Int`, `Ext`, and `Int/Ext` (both).
- `Structure Type` currently uses the Royal Glass choices shown in the supplied UI: `Deck`, `Balcony`, `Pool Area`, `Stair Area`, `Landing`, `Stair and Landing`, and `Stair and Balcony Area`.
- The Production Specification must include the existing PS Generator configuration choices: `System`, `Structure material`, `Structure type`, `Location`, `Structure built`, `Glass type`, `Thickness`, and `Gate required`.
- These fields must use the same canonical option identifiers as the published PS Generator configuration so a future Work Order flow can prefill PS1, PS3, or both without reparsing label text.
- Generating producer statements directly from Work Orders is a planned downstream capability, not part of the current enrichment implementation.
- The Production Specification is a superset of producer-statement inputs. Fields used for fabrication or installation must remain in RGTools even when they do not appear on PS1 or PS3.
- Future PS generation must project only the applicable certification fields from the Production Specification; it must not assume every specification field belongs on the document.
- The future producer-statement cardinality decision (per Work Order, per Work Order Item, or selected item package) remains open until the current PS workflow is demonstrated to the product owner.

## Quality routing (provisional)

| Track | Status | Reason |
|---|---|---|
| API and interface contracts | required | The extractor needs a versioned, validated structured-output contract plus review/regeneration actions |
| User interface and accessibility | required | Staff need readable values, unknown/review/error states, and an accessible review/edit flow |
| Data and migrations | required | Structured values, provenance, review state, source fingerprint, and audit history must persist safely |
| External systems and side effects | required | ServiceM8 and an AI provider are involved; extraction must remain behind adapters and never roll back a successful refresh |
| Performance | required | Enriching multiple item descriptions must not turn manual refresh or the dashboard into an unbounded provider fan-out |
| Operations and observability | required | Enrichment is production-facing and failure-prone; safe partial failure and diagnosability are mandatory |

## Representative-description evidence

- Eight supplied ServiceM8 descriptions were evaluated in `planning/sample-label-test-run.md`.
- The corpus includes complete systems, component-only supply, multi-component assemblies, and a variation/change line.
- The Production Specification needs optional fields, component collections, separate finish roles, location environment plus area/detail, and explicit `TBC` review states.
- The product owner cannot yet confirm a rigid item-classification taxonomy because the correct type depends on the job. Do not require staff to classify every item in the first release.
- Proposed safe default: classification is optional and system-suggested, can remain `TBC`, and only helps select relevant fields or flag likely variation/change lines; label composition continues to depend on available confirmed fields.
- Approved: item classification is optional and mostly hidden in the first release. Staff see it only when a likely variation/change or ambiguity needs review; it never blocks ordinary item enrichment.
- Approved: the first AI-extracted Production Specification is a visible draft with `Needs Review` status. It is not authoritative and is not eligible for future producer-statement generation until an authorised staff member confirms it.
- Approved permissions: existing Work Orders `Manage` users can review, confirm, and edit Production Specifications. View-only users can read the confirmed specification and its immutable change history but cannot alter either.
- Approved source-change behavior: if the ServiceM8 item description changes after confirmation, RGTools preserves the confirmed Production Specification and shows a source-change warning. A Manage user must explicitly ignore the source change or use it to create a new reviewable draft; refresh never silently overwrites confirmed RGTools data.
- Approved dashboard presentation: each Work Order Item remains compact with its Production Label and applicable `Needs Review` or `Source Changed` badge. A `View specification` control expands the structured fields and immutable change history from the item row.
- Approved extraction timing: after successful ServiceM8 reconciliation, new items are enriched automatically outside the transaction. Confirmed specifications are never automatically regenerated. AI failure cannot fail or roll back the ServiceM8 refresh.
- Approved extraction failure state: if initial enrichment fails, the Work Order Item remains visible using its original ServiceM8 description and shows `Enrichment failed - Retry` to Manage users. Provider/internal error detail is not exposed to ordinary users.
- Approved initial-review behavior: Manage users may correct the AI draft before first confirmation without entering a change reason. Confirmation creates the initial audited baseline; mandatory change reasons apply only to later changes of confirmed values.
- Approved glass vocabulary: the Production Specification stores `Glass Construction` (for example Toughened or Laminated) separately from `Glass Appearance` (for example Clear, Tinted, Frosted, or Ultra-Clear). The Production Label combines them naturally, such as `10 mm Toughened Clear`.
- Approved flexible detail model: each Production Specification supports repeatable `Additional Components` and `Special Requirements` entries for job-specific details outside the core fields. Post-confirmation changes to these entries use the same mandatory reason and immutable audit history as core fields.
- Approved label density: the dashboard Production Label is limited to approximately two visual lines and prioritises system, location/structure, dimensions, glass, fixing/substrate, finish, and critical extras. Complete components, standards, exclusions, and history remain in `View specification`.
- Approved search behavior: Work Orders search includes the current Production Label and current Production Specification values. Superseded values and change-history notes are excluded from ordinary search so stale wording does not produce confusing results.
- Approved export behavior: the existing item-level Work Orders CSV export includes the current confirmed Production Specification fields and review status, but excludes the full specification change-history log.
- Revised filter decision: there is no fixed limit on active Production Specification filters for the first release. Administrators can configure which filters appear; all current specification values remain searchable even when their field is not enabled as a filter.
- Approved filter ownership: active Production Specification filters are configured globally through existing Work Orders administration settings. Personal per-user filter layouts are out of scope for the first release.
- Approved option ownership: Work Orders and PS Generator use a shared Royal Glass specification catalogue for overlapping fields. Work Orders may use additional values marked `Not used for PS` so non-certification jobs remain fully described without polluting producer-statement choices.
- Approved naming contract: canonical catalogue entries have stable IDs, approved display names, approved Production Label text/abbreviations, aliases, PS applicability, and active/deprecated status.
- AI extracts structured meaning and source evidence but cannot invent official names or catalogue options. Unmatched values are preserved as `Unmapped - Needs Review`.
- Production Labels are built deterministically from confirmed canonical values and ordered optional fields; filters, search, CSV export, future PS generation, and any future ServiceM8 write-back use the same canonical IDs.
- The eight supplied sample descriptions form a permanent naming/extraction regression corpus.
- Approved catalogue permissions: existing Work Orders `Configure` users can add, rename, alias, deactivate, and mark catalogue options as PS-applicable. Manage users can select approved options or preserve an item-specific unmapped value, but cannot change the shared vocabulary.

## Next phase condition

Resume the sit-down after the user approves or changes the ownership boundary above. Then settle the review/edit behavior one decision at a time before drafting the contract or publishing Linear slices.
