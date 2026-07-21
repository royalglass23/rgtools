# Production Label sample test run

- Date: 2026-07-16
- Source: Eight representative ServiceM8 item descriptions supplied during the sit-down.
- Purpose: Naming and extraction regression reference for the Work Order Production Specification.

## Label pattern

`Item/System | Location + Structure Type/Area | Quantity/Dimensions | Glass Construction + Appearance | Fixing/Substrate or Configuration | Finish | Critical Extras/Scope`

Include only source-supported/applicable segments. Use `Location TBC` when Int/Ext/Both is not explicit. Never include price. Keep long standards, exclusions, drawings, templates, and component detail in the expanded specification.

## Expected examples

| Sample | Expected Production Label pattern | Required review/detail |
|---|---|---|
| Shower glass, five pieces | `Shower Glass | Location TBC - Bathroom | 5 pcs | 1960H | 10 mm Toughened Clear | Hinged | Chrome` | Confirm Int/Ext/Both; retain AS/NZS 2208:1996 and polished edge outside label |
| Round stainless rail | `Round SS Rail | Int Stair Area | 22 m | 50.8 mm | Chrome | Supply & Install` | Confirm exact product name if source does not say handrail |
| Double Disc | `Double Disc Balustrade | Ext Balcony | 14.9 m x 1.0 m | 12 mm Toughened Clear | Timber | 21 x 25 IL Rail | Chrome/316 SS` | Retain template, concept plan, shop drawing, PS1/PS3 inclusions outside label |
| EdgeTec PosiGlaze pool fence | `EdgeTec PosiGlaze Pool Fence | Location TBC - Pool Area | 16.5 m x 1200H | 12 mm Toughened Clear | Timber Top-Mount | 1 Gate | Black/Ironsand` | Confirm Int/Ext/Both; preserve separate gate-hardware and channel finishes |
| Handrail brackets | `Handrail Brackets | Int Stair Area | 7 pcs | Chrome | Supply Only` | Preserve 1 glass-mount 104 mm, 2 hollow, and 4 standard brackets plus exclusions as components/requirements |
| Pool-fence design change | `Pool Fence Variation | Location TBC | Boundary Panels | Custom Anti-Toe-Hold Design | 1200H` | Flag likely variation; do not treat it as a complete system or auto-attach it |
| Hinged shower over bathtub | `Shower Glass | Location TBC - Bathroom | 1 Set | 800W x 1380H | 10 mm Toughened Clear | Hinged + Fixed Panel | Brushed Nickel` | Confirm Int/Ext/Both; retain bathtub context and polished edge |
| Multi-screen shower item | `Shower Screens | Location TBC | 4 Sets | 10 mm Toughened Clear | 2 Single + Corner + Diamond | Chrome | Install Included` | Preserve four component dimensions; confirm Int/Ext/Both |

## Regression rules

- Equivalent catalogue IDs and approved label wording are required; AI prose itself is not the assertion.
- Do not infer Int/Ext/Both from Bathroom or Pool Area without explicit evidence or staff confirmation.
- Keep Glass Construction and Glass Appearance separate in data and combined only for label display.
- Preserve multiple finish roles and components.
- Unknown wording remains Unmapped/TBC rather than becoming an invented confirmed value.
