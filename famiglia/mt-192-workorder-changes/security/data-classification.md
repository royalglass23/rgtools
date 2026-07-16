# Data classification - mt-192-workorder-changes

- Date: 2026-07-16
- Scope: Work Order refresh, items, labels, events, export, and MT-199 acceptance harness

| Data | Classification | At rest | In transit | Retention | Notes |
|---|---|---|---|---|---|
| ServiceM8 UUIDs, job numbers, status, item codes | internal | PostgreSQL Work Order tables | TLS to/from ServiceM8 | Active while operational; 7 years after completion/inactivity | Safe operational identifiers only |
| Client/company names and job address | personal/confidential | PostgreSQL Work Order tables | ServiceM8 and authenticated RGTools/CSV | Active while operational; 7 years after completion/inactivity | Not written to security logs |
| Job/item free text | confidential, potentially personal | PostgreSQL item/job fields | ServiceM8; item description to OpenAI | Active while operational; 7 years after completion/inactivity | Minimize before external processing |
| Quantity and line totals | confidential business | PostgreSQL | Authenticated UI/CSV | Active while operational; 7 years after completion/inactivity | CSV formula-neutralized |
| Generated/manual labels and item history | internal/confidential | PostgreSQL events/audit | Authenticated UI/CSV | 7 years after event/completion | Actor attribution recorded |
| Actor user ID | personal/security audit | Refresh runs, events, audit log | Internal DB | Events 7 years; refresh runs 2 years; global audit policy applies | Denied refresh attempts are logged |
| Raw ServiceM8 snapshot | personal/confidential | `work_orders.raw_servicem8_snapshot` | N/A after migration | 0 days; cleared and no longer written | Future refreshes store null |
| Provider keys, SMTP password, DB URL | secret | Environment/hosting secret store | Auth headers/encrypted connections | Operational rotation | No real secret in diff |
| E2E sentinel/credentials | secret-like test control | Dedicated E2E DB/env | Runner to isolated DB | Per-run cleanup | Never print values |

## Current minimization status

Migration `0054_clear_work_order_raw_snapshots.sql` clears existing raw snapshots, and refresh input now writes `null`. `modules/work-orders/retention.ts`, the protected cron route, and the weekly Vercel schedule implement the approved 7-year/2-year cleanup policy. Production secret presence and first-run confirmation are deployment checks.
