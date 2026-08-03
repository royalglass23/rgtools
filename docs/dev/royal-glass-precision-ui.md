# Royal Glass Precision UI system

Royal Glass Precision is the product-wide presentation foundation for RG Tools. MT-201 extends the Phase 1 shell and reference screens across all 29 user-facing pages while preserving each module's data, permissions, field names, and workflows.

## Theme contract

The resolved theme is stored on the document root as `data-theme="light"` or `data-theme="dark"`. The account-area appearance control stores `light`, `dark`, or `system` under `rgtools-theme`. A small inline bootstrap applies the resolved theme before first paint; the React control then keeps System mode synchronized with operating-system changes.

Theme preference remains browser-local. It must not be added to the database or session without a separate product decision.

## Tokens

Semantic CSS variables live in `apps/web/app/globals.css`. They cover canvas and elevated surfaces, text hierarchy, borders, brand accents, focus, status colours, shadows, geometry, motion, spacing, typography, and shell dimensions. Light and dark redefine the same names, so page markup and geometry remain identical.

New presentation code must consume semantic variables such as `--surface-elevated`, `--text-secondary`, `--border-default`, and `--status-warning-text`. Raw palette values belong in the token definitions. Data-series colours may be separate tokens when their meaning is documented.

Status components must include readable text and may not communicate meaning by colour alone. Numeric summaries and identifiers should use tabular numerals where this improves scanning.

## Shared presentation seams

`apps/web/components/precision-ui/PrecisionUI.tsx` contains small presentation-only seams: page and section headings, data panels, KPI and priority cards, table shells, status badges, buttons, controls, and feedback states. Domain modules continue to own queries, actions, permissions, wording, and content order.

`apps/web/app/precision-legacy.css` is the scoped migration bridge for established route modules. Inside the authenticated shell it remaps literal Tailwind surface, text, border, form, focus, button, and status utilities to semantic Precision tokens. This gives every existing page consistent Light, Dark, and System behaviour without rewriting business markup. New or substantially revised presentation code should use semantic tokens and shared components directly rather than extending the bridge.

The sign-in screen consumes the same theme contract outside the authenticated shell. Quote Tracker language identifies ServiceM8 as the quote source and must not imply quote authoring. Business Performance charts label their time range, periods, series, and metric meaning.

When extending the system:

1. Reuse an existing semantic token or shared seam when its meaning matches.
2. Add a semantic token before introducing a new raw colour or component-specific shadow.
3. Keep decision logic and server actions in the domain module.
4. Verify Light, Dark, keyboard focus, reduced motion, and narrow viewport behaviour.
5. Use the compatibility bridge only for established literal utilities; use direct semantic styling for new surfaces.

## Verification

Theme-domain and control tests live under `apps/web/components/theme/__tests__`. Shared component tests live under `apps/web/components/precision-ui/__tests__`. `apps/web/app/__tests__/precision-route-coverage.test.ts` locks the 29-page production inventory. `apps/web/tests/e2e/ui-themes.spec.ts` captures the reference screens in Light and Dark and checks the mobile shell, overflow, keyboard focus, and reduced motion.
