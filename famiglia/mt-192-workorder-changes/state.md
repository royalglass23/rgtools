# Job: mt-192-workorder-changes

- Mode: full
- Entry: feature
- Current phase: verify
- Status: blocked
- Repository contract: `CLAUDE.md`, `CONTEXT.md`, Linear `MT-192`, and `famiglia/work-order-items/contract.md`
- Artifact root: `famiglia/mt-192-workorder-changes/`
- Issue/contract: Linear `MT-192` with delivery slices `MT-193` through `MT-199`
- Approval boundary: local implementation and verification of the recorded must-fix findings; no push, merge, deployment, shared database mutation, or production mutation
- Base/target branch: `feature/workorder` -> `dev` -> `main`; `dev` is currently two merge commits ahead of the feature branch and already contains committed work through `MT-198`
- Worktree: `D:/Royal Glass Dev/rgtools/.worktrees/feature-workorder`
- Reviewed baseline: `e2c167aad9f7a77851c548afd3d33b5f7efd0224` plus the dirty `MT-199` working-tree delta

## Quality routing

| Track | Status | Reason |
|---|---|---|
| API and interface contracts | required | Work Orders export route and server actions changed |
| User interface and accessibility | required | Grouped dashboard, inline controls, filters, notices, and admin configuration changed |
| Data and migrations | required | Work Order Items schema, reconciliation, query, audit, and export behavior changed |
| External systems and side effects | required | ServiceM8 and OpenAI adapters, database writes, and CSV download are in scope |
| Performance | required | Parent pagination, child filtering, sorting, and item-row export affect a user-critical data path |
| Operations and observability | required | Manual refresh status, safe errors, counts, and rollback behavior are production-facing |

## Pipeline

| Stage | Skill | Status | Artifact or evidence |
|---|---|---|---|
| Contract reconstruction | godfather | done | Linear `MT-192` and `MT-193` through `MT-199`; local contract and shakedowns |
| Deliberate tests | testing | done | Post-repair verification: workspace 4/4; focused repaired seams 77 passed / 1 DB-gated skip; full web 810 passed / 17 skipped; web and DB typechecks pass |
| Execute repairs | soldato | done | `shakedown.md` - must-fix findings repaired test-first; 146/146 Work Orders and 9/9 auxiliary tests pass |
| Refresh authorization repair | soldato | done | Direct callable refresh boundary now enforces Manage access; full web 804 passed / 16 skipped |
| ServiceM8 completeness repair | soldato | done | All required datasets now exhaust cursor pagination before reconciliation; full web 807 passed / 16 skipped |
| Active item write repair | soldato | done | Manual label, operational, and AI regeneration writes require an active row at UPDATE time; full web 810 passed / 17 skipped |
| Visible runtime proof | testing / Playwright | blocked | The DB race and browser acceptance tests are discoverable and sentinel-protected, but no dedicated migrated E2E database or matching sentinel is configured; authenticated accessibility and representative performance proof are also absent |
| Security review | omerta | done | `security/signoff.md` - FAIL with no High/Critical; Medium/Low abuse bounds, advisories, retention, logging, and provider-error gaps remain |
| Exit review | enforcer | done | `review.md` - APPROVED; all three verify must-fixes are resolved and no new code-review must-fix was found |
| Validation gate | enforcer gate | done | `gate.md` - RED; deterministic checks are green, but strict security, runtime evidence, dependency, and `.gitignore` scope checks remain blocked/failed |

## Next phase

Return to `/soldato mt-192-workorder-changes` for the first remaining security slice: bound expensive refresh/provider/export work with enforceable single-flight, timeout/page, and size controls. Then rerun Omerta and verify. Before release, also configure the dedicated migrated sentinel database, execute the DB/browser journeys, complete authenticated accessibility and representative performance proof, resolve or accept dependency advisories, and remove or separately justify the unrelated broad `.gitignore` additions.
