# Kanban published Work Orders connection

RG-408 implements a small read-only display and explicit bot trigger. It adds no schema, migration, queue, scheduler, editor or independent assessment engine. The installed code is **not a configured live integration** until the following external setup and synthetic round trip are verified. No credentials, bot configuration or production setting was changed during implementation.

## Published source

The display source is the existing generated **`board3-work-orders.html`** Drive file, fixed ID **`1FK4-IptfpzpMLyY-zFxbTTGJxG3mAP_m`**. Fetch it through the authenticated fixed Drive v3 `files.get?alt=media&supportsAllDrives=true` endpoint; shared-drive support does not grant access or allow browsing. The spreadsheet `1-sDKGcNFYjK1IyjOGgnkNo5sVlDuTcCt7pDooWiYfNc` is now used **only for completion receipts**.

Read-only source comparison on 19 November 2026 found that the B3 Sheet's manual readiness cells were blank while the generated HTML already contained automatic findings. Reading the manual cells would hide those findings. The user chose this existing generated board as the source, rather than changing or regenerating data in rgtools.

The HTML has the exact existing five Table A and eleven Table B UI headers. Match those normalized header sequences uniquely; do not infer column aliases. Table B already supplies its combined WO/client/address cell, Materials and the nine findings cells. Preserve source rows, values, blanks and membership directly; do not split material rows or apply old rgtools due/override rules.

The maintained `parse5` parser extracts text only. Decode HTML entities and preserve `<br>` as a line boundary, so combined identity and PS values do not concatenate. Ignore scripts/styles/templates, never execute or render the HTML, and render extracted strings through React text. Missing/ambiguous headers, malformed row widths/spans, oversized files or row counts are explicit errors, not partial successful output. Complete responses are bounded to 4 MB and 10,000 rows per table. No date/time reinterpretation is performed.

## Minimal external setup to approve and perform

1. Complete the **keyless Google connection** below. Use the existing nominated service account `rgtools-kanban-reader@rg-tools-498600.iam.gserviceaccount.com`, which the user has already given receipt-Sheet Viewer access. Give this same reader **Viewer access to the one generated HTML file above** as separately selected by the user; no public link sharing or folder-wide permission is required. Keep `iam.disableServiceAccountKeyCreation` enforced. No JSON key, ADC credentials file or policy exception is needed or supported.
2. Verify the intended Kanban routine and its side effects, then configure its authenticated webhook. Earlier inspected Daily routine has broader Sheet/PDF/ServiceM8 operations; do not silently attach a button to unrelated writes. Prepare the exact intended action set for approval. Store its HTTPS POST URL as `KANBAN_BOT_WEBHOOK_URL` and its secret as `KANBAN_BOT_WEBHOOK_SECRET`, server-side only. The application sends `Authorization: Bearer …` and JSON `{ "action": "refresh_work_orders", "requestId": "<UUID>" }`. URL, secret and actor cannot be chosen by the browser.
3. Provide a completion range in the fixed **receipt spreadsheet**, e.g. `'RGTools Refresh'!A:D`, and set `KANBAN_BOT_RECEIPTS_RANGE` to it. Creating the range/tab and changing the bot's instruction are separate external actions. The app itself never writes the range. Use the following exact header and protocol; preserve recent receipts long enough for the five-minute polling window. Avoid duplicate request IDs.

| requestId | status | outputVersion | completedAt |
| --- | --- | --- | --- |
| UUID received in trigger | `success`, `no_change` or `failed` | nonempty published output version | ISO timestamp with offset or `Z` |

For `success`, finish updating the complete generated HTML **in place under the same fixed Drive ID** before writing the receipt. Do not delete/re-upload it as a different file. Set `outputVersion` to the published Drive version or a stable hash of that completed HTML. For `no_change`, still write a receipt for this request with the confirmed current version. For `failed`, write a failure receipt without claiming the output refreshed. Receipt text never becomes a user-facing raw error. Do not emit success until publication is finished. A matching UUID binds completion; an arbitrary sheet modified time or another run's receipt does not. The app then reads the latest HTML from that fixed file; it does not read B3 manual columns.

4. Verify the setup in an approved isolated/synthetic pilot: explicit Refresh -> bot accepts -> matching receipt after publication -> both table values reload. Include no-change and failure. No live customer diagnostic payloads or unrelated ServiceM8 writes are needed for this proof. A mocked local test does not establish that this account permits unattended publication.

## Keyless Google connection

The app uses the official `@vercel/oidc` helper and Google authentication SDK: **Vercel OIDC -> Google Security Token Service -> nominated service-account impersonation -> read-only Drive board / Sheets receipts**. It never asks for or falls back to a private key. The SDK version used here requires Node.js 22 or later; confirm the deployment runtime before release.

Verified Google project: `rg-tools-498600` (display RG Tools), numeric project number **166329969732**. The project ID and number are different. Verified Vercel Team-mode issuer: `https://oidc.vercel.com/royalglass-debugs-projects`. The standard default Vercel audience for that team is `https://vercel.com/royalglass-debugs-projects`; copy/confirm it from the actual Vercel OIDC configuration. The application URL `https://www.rgtools.co.nz/dashboard/work-orders` is not an issuer or an administrative project identity.

The following is the exact minimal setup to prepare for user approval; no pool/provider/role/environment changes were performed by this code revision:

1. In the existing Google project, ensure the Security Token Service, IAM Service Account Credentials, Google Drive and Google Sheets APIs are enabled. Create a workload identity pool and OIDC provider. Suggested IDs are **`vercel`** and **`rgtools`**; these names are proposals until actually created.
2. Set the provider issuer to the verified Team-mode issuer above. Explicitly add the verified **default Vercel token audience** to the provider's Allowed audiences. Map `google.subject` to `assertion.sub`. Copy the exact subject for the intended Vercel **project and production environment** from its owning configuration/token claims; do not guess a project slug from the public app URL. Restrict the provider condition to that exact subject and grant no preview/team-wide wildcard.
3. On the nominated reader service account only, grant `roles/iam.workloadIdentityUser` to the matching exact subject principal for this pool. The principal format is `principal://iam.googleapis.com/projects/166329969732/locations/global/workloadIdentityPools/vercel/subject/<EXACT_VERIFIED_SUBJECT>`; use the actual Google-generated/member form for that subject. Do not grant the whole pool/team a wildcard and do not add project Storage/Admin roles. Viewer access to the generated file and receipt Sheet supplies the data permissions. A separate development subject, if needed for local testing, requires its own explicit narrowly scoped approval.
4. Enable Vercel OIDC for the intended project/environment, and set only these non-secret runtime fields after the proposed pool/provider actually exist:

```text
KANBAN_GOOGLE_PROJECT_NUMBER=166329969732
KANBAN_GOOGLE_WORKLOAD_IDENTITY_POOL_ID=vercel
KANBAN_GOOGLE_WORKLOAD_IDENTITY_PROVIDER_ID=rgtools
```

For those IDs the Google **STS target audience** is `//iam.googleapis.com/projects/166329969732/locations/global/workloadIdentityPools/vercel/providers/rgtools`. This is different from the **`aud` claim inside the Vercel token**. The code calls `getVercelOidcToken()` without a custom audience; the provider must therefore allow the actual default Vercel audience above. Do not replace the code's provider resource audience with the public site URL or silently request a custom token audience.

The reader identity and Google STS/IAM endpoints are fixed in code; the browser cannot supply a principal, credentials file or token destination. The SDK's intermediary STS token uses its normal IAM impersonation scope. The final nominated service-account token has exactly `https://www.googleapis.com/auth/drive.readonly` and `https://www.googleapis.com/auth/spreadsheets.readonly` for the user-approved board and receipt reads. OAuth scopes do not make files public or replace the reader's file-specific Viewer permissions. No claim is made that the intermediary token is itself a data-readonly token.

### Local development versus deployed Vercel

Deployed requests obtain OIDC through Vercel's request context once the feature/trust are configured. The official helper first uses that request context, otherwise reads the rotating file named by `VERCEL_OIDC_TOKEN_FILE` when configured, otherwise uses the short-lived `VERCEL_OIDC_TOKEN` environment value. A configured unreadable/empty file is an error; this app does not catch it and silently use another identity. Raw Vercel tokens are never cached by this app. Google access-token expiry/reuse/refresh is owned by the Google SDK, which asks the helper for the current subject token on refresh.

For a user-operated local test, run `vercel link` and choose the actual existing Vercel project/account. This app loads the existing **root `.env.local`** through its custom Next configuration. Never overwrite that file with `vercel env pull`; it contains unrelated secrets. Pull into an explicitly ignored scratch file instead, for example:

```powershell
vercel env pull tmp/rg408-keyless/vercel-development.env --environment=development
```

Review this destination and its access protection first. Do not print or attach the pulled file. Supply only the necessary short-lived OIDC token or a securely maintained rotating token-file path to the app's local process, alongside the non-secret WIF fields; preserve all existing root settings. Use the official helper's documented local refresh flow/CLI login if a token expires, or refresh the reviewed file/process token and restart as appropriate. Local development needs its exact development principal to be trusted separately; a production-only Google condition will correctly reject a development token. No broad server-side ADC login or service-account key is a fallback.

## Runtime behavior

All new source/trigger calls are reached through signed-in server page/actions. Google authorization uses the keyless workload flow above; auth/Sheets destinations are fixed Google URLs. Before sending a bot trigger, the app verifies static WIF configuration and asks the official helper for a currently available Vercel identity, discarding that preflight token without a Google exchange. Missing/unreadable identity stops the bot POST with a safe message. This preflight does not prove IAM trust or Sheets access; those must be verified by the separate live pilot. The app exposes no OIDC token, Google token or webhook secret to the client. Google calls never use the Maps keys.

The Google SDK's cached client is keyed by the complete non-secret provider audience, not a raw identity token. Its final Google access token is reused/refreshed according to SDK expiry rules. The installed `google-auth-library` version **11.3.4 is pinned exactly**: its standard factory creates a separate STS transport without forwarding caller timeout options. A tiny typed `IdentityPoolClient` extension replaces that STS transport object using the SDK's `StsCredentials` constructor, sharing the same fixed-destination transport as impersonation. This uses the SDK protocol, not a hand-written token exchange. The necessary internal `build/src/auth/stscredentials` import must be reviewed when updating the pinned SDK. Tests drive the real SDK through mocked STS and impersonation, including expiry refresh. Both exchanges enforce ten-second abort/deadline, zero retries and redirect errors after SDK request options. SDK request/response logging interceptors are disabled, and errors exposed by the app are sanitized.

All trigger, source and receipt settings are checked before sending a trigger. A missing setting produces a setup message, not an attempted run that cannot be monitored. HTTP `200` means accepted, never completed. There is no automatic retry on an ambiguous timeout. The UI checks the matching receipt every ten seconds for at most five minutes, retains current rows on failure/timeout and reloads through the normal page read only after success/no-change. Unmount stops polling, not the cloud bot. There is no new cooldown/quota/rate-limit policy; only a local in-flight button guard.

Expected legacy source/history remains stored and unchanged. This path does not call the OpenAI assessment runtime, write staff fields or run ServiceM8 reconciliation. No database migration is required. The current package build script runs migrations, so do not execute it against inherited/shared credentials merely to verify this display change.

## Verification

From `apps/web`, use fictional fixtures/mocked network only:

```powershell
node ../../node_modules/vitest/vitest.mjs run modules/kanban/__tests__/published-output.test.ts modules/kanban/__tests__/published-source.test.ts modules/kanban/__tests__/bot-refresh.test.ts modules/kanban/__tests__/PublishedRefreshControl.test.tsx 'app/(dashboard)/dashboard/__tests__/work-order-tables.test.tsx' modules/kanban/__tests__/MaterialDescription.test.tsx --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
```

The legacy disposable browser fixture has an explicit unconfigured-source smoke test, not a live bot roundtrip. Setup status must remain unverified until the separate external pilot above is observed.

Primary references: [Drive files.get media download / readonly scope](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/get), [Vercel OIDC with Google Cloud](https://vercel.com/docs/oidc/gcp), [Google workload identity federation](https://cloud.google.com/iam/docs/workload-identity-federation-with-other-providers), [Sheets receipt values / readonly scope](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get), [Grok Bot routine webhook and acceptance semantics](https://docs.x.ai/grok-bot/skills-routines-and-automations). Installed SDK types/source were inspected for token-supplier, expiry and transport behavior. These describe interfaces; they do not prove cloud trust, file permissions or a live exchange for this account.
