# Royal Glass Precision design contract

RGTools is an operational product for Royal Glass staff. Its interface must feel precise, efficient, and trustworthy while keeping dense operational work easy to scan.

## Information hierarchy

Every page should make information useful in this order:

1. What needs attention.
2. What action should happen next.
3. Current status, ownership, and blockers.
4. Source, timestamps, and history needed for traceability.
5. Supporting metrics, configuration, and recommendations.

The hierarchy applies to Dashboard, Lead Intake, Leads, Quote Tracker, Work Orders, Clients, PS Generator, Admin, and the sign-in experience. Future pre-install and invoicing modules should use the same patterns.

## Visual language

- Use the semantic tokens in `app/globals.css`; do not add raw palette values to route components.
- Support Light, Dark, and System with identical information and geometry in every mode.
- Use the shared `precision-ui` presentation components for headings, panels, metrics, priorities, tables, statuses, controls, and feedback.
- Prefer structured sections, aligned rows, and compact tables over repeated decorative card grids.
- Use restrained radii and shadows. Do not use gradients, glassmorphism, decorative animation, or oversized display headings.
- Use colour as reinforcement only. Status and chart series require readable text labels.
- Use tabular numerals for operational quantities, currency, dates, and identifiers where it improves scanning.

## Interaction rules

- Keep the next action close to the context that explains it.
- Preserve domain logic, permissions, field names, server actions, and recovery paths when presentation changes.
- Provide explicit loading, empty, success, validation, error, and recovery states.
- Keyboard focus must remain visible. Motion must respect `prefers-reduced-motion`.
- Mobile layouts may stack content, but may not hide critical status or actions.

## Product-specific language

- Quote Tracker tracks quotes sourced from ServiceM8. It is not a quote-authoring tool.
- Business Performance charts must label the time range, axes or periods, series, and metric meaning.
- Navigation order follows the workflow: Dashboard, Lead Intake, Leads, Quote Tracker, Work Orders, Clients, PS Generator, Admin.

## Migration rule

`app/precision-legacy.css` is a scoped compatibility bridge for existing route modules. It maps their literal Tailwind surface, text, border, control, and status utilities to semantic Precision tokens inside the authenticated shell. New or substantially revised surfaces should use semantic tokens and shared components directly rather than adding more legacy mappings.
