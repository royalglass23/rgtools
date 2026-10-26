# PS Generator

Use **PS Generator** to generate PS1 and PS3 Producer Statement PDF packages from the published RG Tools configuration.

## Who can use it

- Staff can open **PS Generator -> Generate PS** when PS Generator is enabled for Staff in Role Access.
- Admin users also see **PS Generator -> Configuration**.
- Role Access controls access to the tool. Configuration and publishing require Admin.

## Generate a package

1. Open **PS Generator -> Generate PS**.
2. Choose the generation mode:
   - **PS1 only**
   - **PS3 only**
   - **PS1 + PS3**
3. Enter the project details required by the template, including client name and job address.
4. Choose the system and option values for the job.
5. Generate the package.

The generator validates the selected options against the published system rules, chooses the matching template variant, fills AcroForm text fields and checkboxes, and returns generated PDF outputs.

Current seeded defaults are:

| Field | Default |
|-------|---------|
| System | Double Disc |
| Structure material | Timber |
| Structure type | Deck |
| Location | External |
| Structure built | New |
| Glass type | Toughened |
| Thickness | 12mm |
| Gate required | No |

## Configuration

Admins use **PS Generator -> Configuration** to review the configuration areas that back generation:

| Area | Purpose |
|------|---------|
| Systems | Display names, height rules, visibility state, and template variants |
| Option rules | Allowed option values per system |
| Templates | R2-backed fillable PDF templates |
| Field mappings | Text and checkbox mappings from project values, selected options, rules, dates, descriptions, or fixed values |
| Description templates | Versioned wording inserted into generated documents |
| Audit trail | Draft saves, test generations, publishes, archives, and migrations |

The first published configuration is seeded from the current WordPress-plugin model under the version label `wordpress-plugin-v1`.

## Setup prerequisites

Before generating documents in a new environment:

1. Run the database migrations.
2. Run `pnpm seed` so the `ps-generator` and `ps-generator/configuration` module rows exist.
3. Run `pnpm seed:ps-generator` so a published PS Generator configuration exists.
4. Upload the configured fillable PDF templates to R2 at the object keys referenced by the published configuration.

If generation fails with `published_config_missing`, the PS configuration seed has not been run. If it fails with `template_pdf_missing`, the template PDF is not present in storage at the configured R2 key.

## Developer reference

| Thing | Location |
|-------|----------|
| Generate page | `apps/web/app/(dashboard)/ps-generator/page.tsx` |
| Admin configuration page | `apps/web/app/(dashboard)/ps-generator/configuration/page.tsx` |
| Generate API route | `apps/web/app/api/ps-generator/generate/route.ts` |
| Generation engine | `apps/web/modules/ps-generator/generation.ts` |
| Published configuration read model | `apps/web/modules/ps-generator/configuration.ts` |
| Seed model | `apps/web/modules/ps-generator/seed-config.ts` |
| Seed script | `apps/web/scripts/seed-ps-generator-config-v1.ts` |
| Database schema | `packages/db/src/schema-ps-generator.ts` |
