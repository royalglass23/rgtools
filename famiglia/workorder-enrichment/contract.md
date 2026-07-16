## Problem Statement

Royal Glass Work Order Items inherit long, noisy ServiceM8 descriptions containing a mixture of product scope, dimensions, glass selections, fixing details, finishes, inclusions, exclusions, compliance language, and pricing. The current short label makes items easier to scan but does not give production and installation staff a dependable structured record of what has been agreed.

Client requirements can also change after quoting. A finish may move from Chrome to Matte Black, a design may change near a boundary, or an item may gain a gate or custom component. Royal Glass intends to make and confirm those production changes in RGTools. Staff who were not present for the client conversation must be able to see the current specification and understand what changed, when, why, and by whom.

The same core data overlaps with PS Generator, but a Production Specification contains more than PS1 or PS3 requires. Naming is currently inconsistent across contexts: PS Generator calls Toughened or Laminated `Glass type`, while calculator-facing data also uses glass language for Clear, Tinted, Frosted, and Ultra-Clear. Without canonical identities and explicit mappings, AI extraction, filters, exports, labels, producer statements, and any future ServiceM8 write-back would drift.

## Solution

Add an RGTools-owned **Production Specification** to each Work Order Item. AI converts the immutable ServiceM8 item description into a structured draft after a successful Work Order refresh. The draft is visible as `Needs Review`; a Work Orders Manage user corrects and confirms it before it becomes authoritative.

Every confirmed specification generates a deterministic, human-readable **Production Label** from approved catalogue values. AI extracts meaning and evidence but never invents official names, abbreviations, or catalogue options. Unknown values remain `Unmapped - Needs Review` or `TBC`.

The compact item row shows a maximum two-line Production Label and any review/source-change status. `View specification` expands the complete structured fields, additional components, special requirements, source evidence, and immutable change history.

RGTools is the source of truth after confirmation. Later staff edits require a reason and automatically record the field, previous value, new value, actor, timestamp, and available note/source context. A changed ServiceM8 description never overwrites a confirmed specification; it produces a warning and an explicit compare/ignore/new-draft workflow.

Work Orders and PS Generator share a canonical **Specification Catalogue** for overlapping fields. The Production Specification is a superset: only fields marked applicable to PS1 or PS3 may be projected into a future producer-statement workflow. Direct Work Order generation of PS1/PS3 and outbound ServiceM8 write-back are future features, not part of this implementation.

The sample-label test run in `planning/sample-label-test-run.md` is the initial human-readable naming reference and regression corpus.

## User Stories

1. As Royal Glass production staff, I want a concise Production Label for each Work Order Item, so that I can understand the item without reading a noisy ServiceM8 description.
2. As Royal Glass production staff, I want the full Production Specification available from the item row, so that important detail is not lost from the compact label.
3. As Royal Glass installation staff, I want Location to show Internal, External, or Both plus the relevant area, so that I know where the item belongs.
4. As Royal Glass staff, I want Structure Type recorded separately from Location, so that `Ext Balcony` and `Int Stair Area` remain unambiguous.
5. As Royal Glass staff, I want Glass Construction stored separately from Glass Appearance, so that `Toughened` and `Clear` do not compete for one field.
6. As Royal Glass staff, I want the label to combine those glass values naturally, so that I see wording such as `10 mm Toughened Clear`.
7. As Royal Glass staff, I want hardware/fittings finish separate from system or channel finish, so that a black gate and Ironsand channel are both represented accurately.
8. As Royal Glass staff, I want dimensions and quantities retained in structured form, so that different item shapes and component sizes remain understandable.
9. As Royal Glass staff, I want repeatable Additional Components, so that one ServiceM8 line can retain several panels, brackets, screens, gates, or fittings without being split into multiple Work Order Items.
10. As Royal Glass staff, I want repeatable Special Requirements, so that standards, custom design constraints, drawings, templates, inclusions, and exclusions remain visible.
11. As Royal Glass staff, I want supply scope recorded separately, so that Supply Only, Supply & Install, and Install Only are not hidden in prose.
12. As Royal Glass staff, I want likely variation/change lines flagged only when useful, so that I am alerted without being forced to classify every item.
13. As Royal Glass staff, I want uncertain classifications to remain hidden or `TBC`, so that an unstable taxonomy does not block work.
14. As a Work Orders Manage user, I want AI to draft the specification from ServiceM8 text, so that I do not have to retype every known field.
15. As a Work Orders Manage user, I want source evidence beside extracted values, so that I can verify why the system suggested them.
16. As a Work Orders Manage user, I want missing values shown as `TBC`, so that absence is not mistaken for a confirmed answer.
17. As a Work Orders Manage user, I want unmatched source wording preserved as `Unmapped - Needs Review`, so that no information disappears when the catalogue lacks a value.
18. As a Work Orders Manage user, I want to correct an initial draft before confirmation without entering a change reason, so that review remains efficient.
19. As a Work Orders Manage user, I want confirmation to establish the first audited baseline, so that subsequent changes have a clear starting point.
20. As Royal Glass staff, I want unconfirmed drafts clearly marked `Needs Review`, so that they are never mistaken for production truth.
21. As Royal Glass staff, I want unconfirmed specifications excluded from future producer-statement generation, so that draft data cannot enter compliance documents.
22. As a Work Orders Manage user, I want to change a confirmed field in RGTools, so that client revisions are captured where production work is managed.
23. As a Work Orders Manage user, I want every post-confirmation change to require a reason, so that the history explains why the specification changed.
24. As a Work Orders Manage user, I want standard reasons for Client request, Measurement correction, Design change, Supplier change, and Other, so that common causes use consistent language.
25. As a Work Orders Manage user, I want Other to require explanatory text, so that it never produces a meaningless history entry.
26. As Royal Glass staff, I want the history to show old and new values, actor, timestamp, and reason, so that I can understand changes I did not witness.
27. As Royal Glass staff, I want the Production Label rebuilt after a confirmed change, so that it cannot retain old wording such as Chrome after the finish becomes Matte Black.
28. As Royal Glass staff, I want only current confirmed values used in search, so that historical wording does not create stale results.
29. As a Work Orders Manage user, I want a changed ServiceM8 description to create a warning without overwriting RGTools, so that rare external edits remain safe.
30. As a Work Orders Manage user, I want to compare a changed ServiceM8 description with the confirmed specification, so that I can decide whether it matters.
31. As a Work Orders Manage user, I want to ignore the changed source or create a new reviewable draft, so that adopting source changes is explicit.
32. As a Work Orders viewer, I want to read the confirmed specification and history without edit controls, so that view access remains read-only.
33. As a Work Orders Manage user, I want to review, confirm, edit, and retry enrichment, so that operational ownership follows the existing permission model.
34. As a Work Orders Configure user, I want to manage catalogue options and aliases, so that Royal Glass terminology stays consistent.
35. As a Work Orders Configure user, I want to mark catalogue values as applicable or not applicable to PS1 and PS3, so that non-PS details do not pollute document generation.
36. As a Work Orders Configure user, I want catalogue options deactivated rather than deleted, so that historical specifications remain valid.
37. As a Work Orders Configure user, I want an affected-item preview before renaming or deactivating a used option, so that global changes are not silent.
38. As Royal Glass staff, I want affected item labels rebuilt with system history after a confirmed catalogue change, so that global terminology changes remain traceable.
39. As a Work Orders Manage user, I want AI to select only approved catalogue IDs, so that it cannot create spelling variants or unofficial abbreviations.
40. As a Work Orders Manage user, I want an item-specific unmapped value preserved when no catalogue option fits, so that unusual jobs can still be described.
41. As Royal Glass staff, I want Production Labels limited to approximately two visual lines, so that the grouped dashboard remains readable.
42. As Royal Glass staff, I want regulatory boilerplate, prices, and long exclusions omitted from the label, so that it remains production-focused.
43. As Royal Glass staff, I want the original ServiceM8 description always available, so that I can compare the structured result with its source.
44. As Royal Glass staff, I want current Production Specification values searchable, so that any relevant current detail can locate an item.
45. As an administrator, I want to configure which Production Specification filters appear, so that the dashboard matches current operational needs.
46. As an administrator, I do not want an arbitrary filter-count limit, so that the useful filter set can evolve.
47. As Royal Glass staff, I want filter configuration shared globally, so that the team sees a consistent dashboard.
48. As Royal Glass staff, I want the CSV export to include current confirmed specification values and review status, so that operational exports remain useful.
49. As Royal Glass staff, I want the detailed history excluded from the normal CSV, so that the export does not become an audit dump.
50. As a manager, I want new Work Order Items enriched automatically only after successful ServiceM8 reconciliation, so that AI cannot compromise refresh integrity.
51. As a manager, I want AI enrichment outside the reconciliation transaction, so that provider latency or failure cannot roll back ServiceM8 data.
52. As a manager, I want confirmed specifications left untouched by automatic enrichment, so that AI cannot overwrite staff decisions.
53. As a Work Orders Manage user, I want a failed enrichment to retain the item and original description, so that production work never disappears.
54. As a Work Orders Manage user, I want an `Enrichment failed - Retry` state with safe error wording, so that recovery is actionable without leaking provider detail.
55. As a manager, I want an explicit one-time action to enrich existing active items, so that deployment itself does not unexpectedly start a large AI batch.
56. As a manager, I want batch progress and counts for processed, Needs Review, Unmapped, failed, and retried items, so that I can supervise rollout.
57. As a manager, I want duplicate enrichment batches prevented and failed items safely resumable, so that repeated clicks cannot duplicate work.
58. As Royal Glass staff, I want removed items and their specifications preserved with item history, so that temporary ServiceM8 status changes do not destroy production knowledge.
59. As Royal Glass staff, I want a returning item to regain its confirmed specification, so that refresh lifecycle behavior remains consistent.
60. As a reviewer, I want the supplied eight descriptions retained as golden examples, so that future AI, prompt, catalogue, and label changes do not regress approved naming behavior.
61. As a system owner, I want the existing short label and original description retained during rollout, so that the feature has a safe rollback path.
62. As a system owner, I want future PS1/PS3 generation to consume canonical confirmed specification IDs, so that documents do not reparse labels.
63. As a system owner, I want future ServiceM8 write-back to be a separate explicit workflow, so that saving in RGTools never unexpectedly changes customer-facing quote or invoice text.

## Implementation Decisions

### Ownership and identity

The Production Specification belongs to one Work Order Item and uses the existing internal item identity plus stable ServiceM8 item UUID. Quote Tracker, Lead Intake, calculator records, and lifecycle handoff data may provide future evidence, but they do not own the canonical production result.

Version one extracts from the immutable current ServiceM8 item description and existing Work Order Item/parent fields only. It does not send client contact data, address, price, quote PDFs, or broad lifecycle history to the AI provider. This minimises stale-source conflicts and unnecessary customer-data exposure.

One ServiceM8 line remains one Work Order Item. Multi-panel, multi-bracket, and multi-screen descriptions use repeatable components inside the specification rather than splitting the external item identity.

### Persistence and lifecycle

Use additive Work Order-owned persistence with:

- One current Production Specification record per Work Order Item.
- Immutable revision/history records for confirmation, post-confirmation edits, catalogue-driven label changes, source-change decisions, and review transitions.
- Stable catalogue references for controlled values.
- Structured repeatable components and special requirements validated by a versioned application schema.
- Source-description fingerprint, extraction schema version, prompt version, model identifier, generated time, reviewed time, reviewer, and status.
- Safe status values covering queued, enriching, needs review, confirmed, failed, source changed, and superseded draft.

The current confirmed specification and current draft are distinct. Creating a new draft never removes or mutates the confirmed version. Confirming a draft atomically promotes it and records the previous confirmed snapshot when applicable.

Initial draft corrections are part of establishing the baseline. The initial confirmation creates one baseline history entry. Every later confirmed change requires a reason; `Other` also requires explanatory text. Standard reasons may include an optional note.

Specifications follow Work Order Item lifecycle. Removed items retain specifications and history. Returning items restore them. Refresh never deletes RGTools-owned specification data.

### Specification fields

Core controlled fields include:

- System.
- Structure Material/Substrate.
- Structure Type.
- Location Environment: Internal, External, or Both.
- Location Detail/Area, such as Bathroom.
- Structure Built: New or Existing where applicable.
- Glass Construction, such as Toughened or Laminated.
- Glass Appearance, such as Clear, Tinted, Frosted, or Ultra-Clear.
- Thickness.
- Gate Required.
- Door/Opening Type.
- Fixing Method.
- Hardware/Fittings Finish.
- System/Channel Finish when distinct.
- Interlinking Rail and dimensions.
- Delivery Scope: Supply Only, Supply & Install, or Install Only.

Structured measurements support quantity, length, width, height, diameter, and freeform dimension detail where a standard measurement does not fit. Values retain units and avoid converting ambiguous source numbers.

Additional Components are repeatable entries with name, quantity, dimensions, construction/material, finish, and notes as applicable. Special Requirements are repeatable entries for compliance standards, design constraints, inclusions, exclusions, templates, drawings, and other production-relevant factors.

Optional system-suggested item kind may help distinguish installed systems, components/accessories, variations/changes, or services/documents. It remains mostly hidden, can be `TBC`, never blocks review, and is not a required staff classification.

### Specification Catalogue

The shared catalogue is the sole source for official controlled wording. Each option has:

- Stable immutable ID.
- Field/category ownership.
- Approved full display label.
- Approved Production Label wording or abbreviation.
- Recognised aliases and spelling variants.
- PS1 applicability, PS3 applicability, or `Not used for PS`.
- Active/deprecated status.
- Sort order and audit metadata.

Aliases normalise source variants but do not change confirmed values. AI can return only catalogue IDs allowed for the target field or an unmapped candidate with raw evidence. It cannot add catalogue values.

Configure users govern the catalogue. Manage users select existing options or preserve item-specific unmapped text. Catalogue changes are audited. Renaming or deactivating a value already in use requires an affected-item count and preview, explicit confirmation, deterministic label rebuild, and system-generated history on affected items.

PS Generator retains familiar screen wording where needed. Its `Glass type` maps to Glass Construction; calculator `glassColour`/appearance wording maps to Glass Appearance. Integrations translate at their boundary while canonical Work Order terminology remains unambiguous.

### AI extraction boundary

The AI adapter receives only the minimum item/source fields required. It must return a versioned, schema-validated structured object containing proposed catalogue IDs, unmapped candidates, repeatable components/requirements, source evidence, and ambiguity flags.

AI extraction never creates the final free-text label. It never confirms data, changes catalogue configuration, writes to ServiceM8, updates PS Generator, or modifies unrelated operational fields.

Use durable idempotent enrichment work keyed by Work Order Item, source fingerprint, extraction schema version, and prompt version. Allow only one active job for the same key. Process with bounded concurrency, timeout, retry limits, and safe terminal failure. Provider errors are translated into staff-safe messages; raw responses and secrets are not exposed.

Successful ServiceM8 reconciliation enqueues enrichment for new active items with no confirmed specification. The refresh response does not wait for provider completion. Confirmed items are skipped. A changed source creates a warning; it does not enqueue a replacement confirmed result automatically.

### Production Label

Build the Production Label deterministically from the current confirmed specification, or from the visible draft while clearly marked `Needs Review`. Use this ordered optional pattern:

`Item/System | Location + Structure Type/Area | Quantity/Dimensions | Glass Construction + Appearance | Fixing/Substrate or Configuration | Finish | Critical Extras/Scope`

Only applicable confirmed or clearly draft-marked values appear. Missing environment uses `Location TBC`; the system does not infer Internal/External/Both from words such as Bathroom or Pool unless staff confirms it.

Approved compact terms include `Int`, `Ext`, `Int/Ext`, `SS`, and `IL Rail`. Other abbreviations require catalogue approval. Prices, long standards, long inclusions/exclusions, and boilerplate do not appear in the label. The dashboard visually limits the label to approximately two lines and exposes the complete specification accessibly.

### UI and permissions

The compact Work Order Item row shows the Production Label, current status badge, and `View specification`. The expanded view supports:

- Original ServiceM8 description.
- Draft/confirmed structured fields.
- Source evidence and `TBC`/Unmapped states.
- Additional Components and Special Requirements.
- Review, correct, confirm, retry, and source-change actions for Manage users.
- Immutable chronological change history for all viewers.

View-only users cannot mutate specifications. Manage users can review, confirm, edit, retry, and act on source changes. Configure users additionally govern catalogue options and globally configure visible filters.

Long-running actions show obvious pending state and prevent duplicate submission. Validation errors stay attached to the relevant field and preserve unsaved draft input.

### Search, filters, and export

Search covers the current Production Label and current specification values. It excludes superseded values and history notes.

Administrators globally configure which specification filters appear. There is no fixed filter count in the first release. Personal filter layouts remain out of scope.

The existing item-level CSV adds review status and current confirmed specification fields. Items without a confirmed specification export blank confirmed fields plus their non-confirmed status. The ordinary export excludes history, raw AI evidence, provider metadata, and ServiceM8 prices already excluded by the existing contract.

### Future PS Generator and ServiceM8 integration

Production Specification is a superset of PS inputs. Future PS1/PS3 generation must project only confirmed catalogue values marked applicable to the selected document type. It must not parse the Production Label or send item-specific unmapped values without review.

Future outbound ServiceM8 sync is technically feasible through stable item UUIDs but requires a separate contract, explicit user action, conflict handling, scopes, retries, and customer-facing field mapping. No save in this feature writes to ServiceM8.

### Operations and observability

Provide batch and runtime metrics for queued, processing, drafted, needs-review, unmapped, failed, retried, and confirmed counts plus processing duration. Logs use item/internal correlation IDs without client names, addresses, description bodies, prices, API keys, or raw provider responses.

The explicit one-time `Enrich existing active items` action shows progress and final counts, prevents concurrent duplicate runs, and resumes only failed/pending work. Removed items are excluded from the initial batch.

Capture a baseline before implementation. The refresh path must not wait on provider calls; database enqueue overhead for a realistic 100-item refresh fixture must remain within one second of the pre-feature baseline. Dashboard query/render performance must not regress by more than 10 percent on the agreed realistic fixture without explicit approval.

## Testing Decisions

The primary acceptance seam is one controlled end-to-end Work Orders journey:

1. Refresh a ServiceM8 Work Order containing representative new item descriptions.
2. Confirm refresh succeeds before enrichment completes.
3. Observe queued/enriching/Needs Review states without losing item visibility.
4. Review an extracted draft, correct values, confirm it, and verify the deterministic Production Label.
5. Change Chrome to Matte Black with reason `Client request`, reload, and verify the new label plus immutable previous/new history.
6. Change the ServiceM8 description, refresh, and verify the confirmed specification survives with a source-change warning.
7. Exercise ignore and create-new-draft behavior.
8. Verify a view-only user can read but cannot mutate the specification or catalogue.
9. Verify search, configured filters, and CSV use current confirmed values.
10. Force provider failure and confirm refresh remains successful, the item remains visible, and Manage users receive a safe retry state.

The eight supplied ServiceM8 descriptions become a golden regression corpus. Tests assert structured meaning and label-equivalent output rather than brittle prose beyond approved catalogue wording. Expected cases include shower glass, round stainless rail, Double Disc balustrade, EdgeTec PosiGlaze pool fence, supply-only handrail brackets, a pool-fence variation, hinged shower glass, and a multi-screen shower item.

Focused automated coverage includes:

- Schema validation rejects wrong field types, unsupported catalogue IDs, invented fields, unsafe lengths, and malformed components.
- Alias normalisation maps known variants to one canonical ID and preserves unknown wording as Unmapped.
- Glass Construction and Glass Appearance remain distinct through calculator, Work Orders, and PS mappings.
- Label composition is deterministic, ordered, two-line appropriate, and excludes price/boilerplate.
- Location never becomes Int/Ext/Both without explicit evidence or staff confirmation.
- Draft confirmation and revision state transitions are atomic and idempotent.
- Initial draft corrections require no reason; post-confirmation changes require an allowed reason and `Other` requires text.
- Every confirmed field/component/requirement change creates correct immutable history.
- ServiceM8 source changes preserve confirmed RGTools data.
- Removed/returning item lifecycle preserves specifications and history.
- Manage/View/Configure authorization is enforced in UI and server actions, including negative cases.
- Catalogue rename/deactivate impact preview, confirmation, stable-ID retention, label rebuild, and history work safely.
- Refresh enqueues enrichment only after successful reconciliation and never waits for or rolls back on provider failure.
- Work deduplication, bounded retry, one-time batch progress, duplicate-start prevention, and safe resume work under failure.
- Search excludes historical values; filters use canonical IDs; CSV exports confirmed fields/status and excludes history.
- Performance checks use realistic parent/item counts and the stated budgets.
- Accessibility checks cover keyboard expansion, focus restoration, status announcements, field errors, accessible names, and read-only rendering.
- Security checks cover hostile description text, prompt-injection-like instructions, oversized inputs, provider-error leakage, authorization bypass, catalogue abuse, and log redaction.

Required verification includes focused Work Orders and AI suites, database integration tests for persistence/revisions, app type/lint checks, the app-scoped production build, the controlled end-to-end journey, migration forward/rollback rehearsal, and a staging run of the golden corpus plus a representative active-item batch.

Success requires:

- All eight golden examples produce approved structured meaning without invented confirmed values.
- Provider failure cannot fail ServiceM8 refresh or hide an item.
- Confirmed RGTools values survive refresh and source changes.
- Every later change is attributable and understandable from history.
- Labels, search, filters, CSV, and future-ready mappings use canonical IDs consistently.
- No viewer can mutate data and no Manage user can mutate the global catalogue.
- Staging operators can complete the review/change/source-change/batch journey without database intervention.

## Out of Scope

- Generating PS1 or PS3 directly from a Work Order.
- Choosing final producer-statement grouping/cardinality across one or many Work Order Items.
- Writing Production Specification or label data back to ServiceM8.
- Editing ServiceM8-owned quantity, item code, original description, price, job number, status, client, or address.
- Automatically confirming AI output.
- Automatically creating catalogue options from AI output.
- A mandatory visible item-classification taxonomy.
- Splitting one ServiceM8 jobmaterial line into multiple Work Order Items.
- Using quote PDFs, client/contact details, ServiceM8 files, or broad lifecycle context as extraction input in version one.
- Personal filter layouts or a hard limit on globally configured filters.
- Including full change history in the ordinary CSV export.
- Removing legacy label/source fields during the first rollout.
- Retrofitting historical inactive/removed items in the initial enrichment batch.

## Risks & Rollout Notes

The largest safety risk is an AI-generated production detail being mistaken for confirmed truth. All initial output is a visible draft, unsupported values remain TBC/Unmapped, and only Manage-user confirmation makes a specification authoritative.

The largest naming risk is free-text drift. Stable catalogue IDs, aliases, explicit integration mappings, Configure-only governance, and deterministic label composition prevent synonymous wording from fragmenting filters and downstream documents.

The largest data-ownership risk is a later ServiceM8 refresh overwriting client-approved RGTools changes. Confirmed RGTools data always wins; changed source text becomes a compare/ignore/new-draft workflow.

The largest operational risk is coupling external AI latency to Work Order refresh. Reconciliation commits first, enrichment is durable and asynchronous, concurrency is bounded, and provider failure has an independent retry lifecycle.

The largest migration risk is replacing the current label too early. Roll out additively: add specification/catalogue/revision/work persistence, keep the existing short label and original description, expose the new UI behind a reversible configuration flag, and retire legacy label behavior only after production stability.

Staging rollout order:

1. Apply additive migrations and seed the initial shared catalogue/aliases.
2. Enable the feature for administrators only.
3. Run the eight golden examples and approve expected mappings/labels.
4. Run the controlled end-to-end acceptance journey for Manage, View, and Configure roles.
5. Start the explicit active-item batch and review batch counts, failures, Unmapped values, and a representative sample across systems.
6. Validate search, configured filters, CSV, source-change handling, catalogue impact preview, and rollback flag.
7. Enable for normal staging staff and observe for an agreed working period before production.

Production rollout repeats the explicit batch rather than triggering automatically at deploy. Success signals are refresh latency, enrichment completion/failure/unmapped rates, review backlog, catalogue changes, and operator-reported corrections. Rollback disables the new UI and enrichment worker while preserving all additive tables and history; the existing short label/original description remains available. No rollback deletes Production Specifications.
