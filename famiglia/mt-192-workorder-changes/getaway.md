# Release readiness - mt-192-workorder-changes

- Date: 2026-07-16
- Mode: full
- Verdict: **NO-GO**
- Validation gate: **GREEN**
- Security sign-off: **PASS**
- Reviewed baseline: `73c3e84341c268ceb335b5a1f342b33685959916` plus the current uncommitted MT-192 delta
- Release authority: not granted; no commit, push, merge, migration, staging deployment, production deployment, or production data mutation is authorized

## Required pre-launch gates

| Check | Status | Evidence |
|---|---|---|
| Approved contract and slices | READY | Linear MT-192 / MT-193 through MT-199 and `famiglia/work-order-items/contract.md` |
| Enforcer validation gate | READY | Independent review APPROVED and `gate.md` is GREEN |
| Omerta security gate | READY | `security/signoff.md` is PASS with no open High/Critical |
| Real user-visible runtime | READY | Authenticated MT-199 Chromium journey passed |
| Required quality tracks | READY | Automated accessibility now passes alongside API, data, external-system, performance, and operations evidence |

## Testing and quality

| Check | Status | Evidence |
|---|---|---|
| Unit/integration/regression/E2E/security | READY | 826 web tests passed, 17 documented unrelated skips; DB race and MT-199 journey passed |
| Retention and cron regression | READY | Fresh release-phase run: 2 files and 6 tests passed |
| Known gaps/skips documented | READY | `verification.md` and security artifacts |
| Performance budgets | READY | Refresh 2.545s/4.778s/3.289s under 30s; export 3.298s under 10s |
| Keyboard/focus/names/errors | READY | Authenticated semantic and focus assertions plus component/action error tests |
| Automated accessibility scan | READY | Axe 4.12.1 reports zero WCAG 2.0/2.1 A/AA violations after the contrast repair |

## Documentation

| Check | Status | Evidence |
|---|---|---|
| Changelog/release note | READY | `docs/CHANGELOG.md` |
| Technical and operator runbook | READY | `docs/ops/work-order-retention.md` documents deployment, manual verification, and rollback |
| Recovery/troubleshooting completeness | BLOCKED | No verified target PITR capability, recovery rehearsal, named recovery owner, or estimated recovery time is recorded |

## Migrations and compatibility

| Check | Status | Evidence |
|---|---|---|
| Backward compatibility | READY | 0053 adds an unused-by-old-code table, 0055 adds nullable actor/FK, 0056 adds an index; 0054 clears a nullable snapshot column old code tolerates |
| Expand/migrate/contract | READY | No column/table removal; legacy Work Order columns remain as rollback seam |
| Real-shaped migration proof | READY | 0053-0056 applied and verified on the isolated E2E database |
| Recovery/down path | BLOCKED | 0054 irreversibly clears raw snapshots; production PITR availability and restore procedure are not verified/rehearsed |
| Public/API compatibility | READY | Existing Work Order routes/actions remain compatible; export failures are bounded with documented 413 behavior |

## Deployment

| Check | Status | Evidence |
|---|---|---|
| Repeatable build/deploy definition | READY | Production Next build passed; `apps/web/vercel.json` limits automatic deployment to `dev` and `main` and registers the weekly cron |
| Target secrets/configuration | BLOCKED | No linked `.vercel/project.json`, no Vercel CLI, and no local `CRON_SECRET`; Production presence cannot be verified |
| Bounded staged rollout | BLOCKED | Contract-required staging ServiceM8 job/item/excluded-count and sample-record comparison has not run |
| Health/dependency readiness | BLOCKED | Cron registration, database target, ServiceM8/OpenAI target credentials, and first authorized cleanup cannot be checked before staging deployment |
| Authorized deployer | BLOCKED | The user has not authorized commit/push/merge/deploy or named the release operator |

## Rollback

| Check | Status | Evidence |
|---|---|---|
| Application rollback shape | READY | Previous app can run with additive schema; legacy job columns remain; cron can be disabled independently |
| Background/data rollback safety | BLOCKED | Cleanup deletion and migration 0054 are not reversed by application rollback; target PITR must be confirmed before migration/cron enablement |
| Triggers/owner/RTO/reconciliation | BLOCKED | No named owner, recovery-time target, or written post-restore ServiceM8 reconciliation procedure is approved |

## Monitoring and success

| Check | Status | Evidence |
|---|---|---|
| Signals | READY | Last-sync/result counts, safe refresh errors, cron 200/401/500, deletion counts, and provider/database error logs are defined |
| Thresholds and alerts | BLOCKED | No alert exists for missed weekly invocation or repeated 401/500; expected cleanup-count/latency thresholds are not approved |
| Dashboard/query and observer | BLOCKED | Vercel logs are the documented query surface, but no named observer/owner is recorded |
| Observation window/rollback conditions | BLOCKED | No approved staging/production watch window or continue/pause/rollback thresholds are recorded |

## Branch and remote state

- Live remote `feature/workorder` matches local HEAD `73c3e84341c268ceb335b5a1f342b33685959916`.
- Live remote `dev` is `95225825d6c7e7ec82af690f3a81a95e1910c404`; local `dev` matches it and is three commits ahead of `feature/workorder`.
- The MT-192 delta is still uncommitted. Separate `famiglia/workorder-enrichment/` planning remains on the same branch and must be excluded from MT-192 staging.

## Release blockers, in resolution order

1. Verify Production `CRON_SECRET` and the target database/ServiceM8/OpenAI configuration without exposing values.
2. Confirm Neon production PITR capability, rehearse/document recovery for migration 0054 and retention deletion, and name the recovery owner/RTO.
3. Authorize and perform the `dev` staging rollout, then compare ServiceM8 job/item/excluded counts and representative records.
4. Configure cron/refresh monitoring: named observer, missed-run and repeated 401/500 alerting, thresholds, observation window, and rollback triggers.

The validation and security gates are green. The remaining operational requirements still block release independently. No release action was performed.
