# Data classification — mt-192-workorder-changes

- Date: 2026-07-15
- Scope: Work Order refresh, items, labels, events, export, and MT-199 acceptance harness

| Data | Classification | At rest | In transit | Retention | Logging / notes |
|---|---|---|---|---|---|
| ServiceM8 job/item UUIDs, job number, item code, status | internal | PostgreSQL Work Order tables | TLS to/from ServiceM8; app TLS in production | No explicit policy found | Safe operational errors may identify a record; never log API keys |
| Client/company name and job address | personal / confidential | PostgreSQL and raw snapshot | ServiceM8 and authenticated RGTools responses | No explicit policy found | Exported to staff CSV; unnecessary in security logs |
| Job/item free text | confidential; potentially personal | PostgreSQL including `raw_servicem8_snapshot` | ServiceM8; item description also goes to OpenAI | No explicit policy found | May contain names, addresses, or instructions; minimize before external processing |
| Quantity and line total excluding GST | confidential business | PostgreSQL | ServiceM8, authenticated UI, CSV/hover | No explicit policy found | CSV leaves app-controlled storage after download |
| Generated/manual label | internal / confidential | PostgreSQL and audit/event tables | OpenAI result and authenticated UI/export | Historical values retained indefinitely | Formula-neutralized on CSV export |
| Installer, stage, hardware, dates, risk, importance, maintenance | internal / confidential | PostgreSQL and event history | Authenticated UI/export | Historical values retained indefinitely | Item events carry actor attribution |
| Actor user ID and request IP | personal / security audit | `work_order_events` and `audit_log` | Internal application/database | Repository-wide audit retention applies | Label writes are atomic with audit; refresh runs still lack actor ID |
| Raw ServiceM8 job snapshot | personal / confidential, open-ended | `work_orders.raw_servicem8_snapshot` JSONB | ServiceM8 to PostgreSQL | **Undefined** | Entire upstream object is stored; minimization/retention is not demonstrated |
| Provider keys, SMTP password, DB URL | secret | Environment/hosting secret store | Auth headers or encrypted connections | Rotate operationally | Static scan found environment names and fake test values only |
| E2E DB sentinel and URL | secret-like test control | Environment and DB setting | Runner to dedicated DB | Per test environment | Sentinel compared exactly and not printed |
| E2E admin credentials | secret, ephemeral | Test DB for one run | Local browser/app test | Cleanup after verified run | Random per run; setup/cleanup gated by DB proof |

## Data-minimization finding

The feature duplicates the complete ServiceM8 job object in `raw_servicem8_snapshot` while also storing required fields separately. No retention/deletion workflow was found for that object or Work Order history. This remains an ASVS V8 data-protection gap.
