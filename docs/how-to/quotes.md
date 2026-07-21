# Quote Tracker — Workflow & Troubleshooting Guide

A practical guide for Royal Glass staff. Covers the full lifecycle from generating a quote in ServiceM8 through to reading engagement data back in the dashboard.

---

## How it works (overview)

```
ServiceM8 job  →  staff creates tracked quote in rgtools
                  (PDF pulled, stored in R2, short link generated)
                       ↓
              staff pastes link into email to client
                       ↓
         client opens  https://quotes.royalglass.co.nz/q/<code>
                       ↓
              tracker worker records events (opens, scroll, time, etc.)
                       ↓
         engagement appears in the Quote Tracker dashboard
```

The viewer and tracker are Cloudflare Workers. The dashboard is the rgtools app on Vercel.

---

## Step-by-step workflow

### 1. Generate the quote in ServiceM8

Before creating a tracked link, the quote PDF must exist in ServiceM8.

1. Open the job in ServiceM8.
2. Go to **Quote** and click **Generate / Produce Document** to produce the PDF.
3. Make sure the quote line items are complete — the tracked quote value is calculated as the sum of job material line items × 1.15 GST.

> If you skip this step the tracker will return an error: *"Generate the quote in ServiceM8 first."*

### 2. Create a tracked quote

From the **Quote Tracker** page:

1. Go to **Quote Tracker** in the dashboard sidebar.
2. Click **Track Quote** (top-right of the page).
3. In the dialog, type the ServiceM8 **Job ID** (e.g. `R260210`) and click **Create** (or press Enter).
4. The dialog shows *Fetching quote from ServiceM8…* while it pulls the PDF, uploads it to R2, and mints a short link. This takes a few seconds.
5. On success it shows **Quote found** with the client name, job address, the quote link, and the expiry. Click **Copy** to grab the link, then **Done** — the list refreshes with the new quote.

If something is wrong, the dialog shows an inline message and keeps the Job ID field editable so you can fix it and retry:

- **"No matching ServiceM8 job found."** — the Job ID is wrong, or the job doesn't exist in ServiceM8.
- **"Generate the quote in ServiceM8 first."** — the job exists but has no quote PDF yet (do step 1 first).
- **"A live tracked quote already exists for this job."** — there is already an unexpired tracked quote for this job. The dialog shows that existing quote's link and expiry with a **Copy** button — just use it. (To mint a brand-new link you have to wait for the current one to expire.)

You can also create a tracked quote from the command line (useful for testing):

```powershell
pnpm quote:create --job R260210
# or by UUID
pnpm quote:create --uuid <servicem8-job-uuid>
```

### 3. Copy and share the link

From the **Quote Tracker** list or the quote detail page:

1. Find the quote row.
2. Click **Copy quote link** — it copies `https://quotes.royalglass.co.nz/q/<code>` to your clipboard.
3. Paste the link into your email to the client. That's it — no other steps required.

> The link is permanent for the duration of the expiry window. If you recreate a tracked quote for the same job, the same short code is reused and the PDF is refreshed.

### 4. (Optional) Enable the email gate

The email gate requires the client to enter their email address before the PDF is shown. Use it when you want to verify who opened the quote or when the job involves multiple decision-makers.

1. Open the quote in **Quote Tracker → [quote name]**.
2. In the **Quote** section, check **Email gate**.
3. Enter the recipient email addresses (comma or semicolon-separated). Example:
   ```
   client@example.co.nz, manager@example.co.nz
   ```
4. Click **Save gate**.

When the client visits the link they will see an email input before the PDF loads. Their email must match one of the recipients you listed — otherwise the viewer shows an error.

> Enable the email gate **before** you send the link, not after the client has already opened it.

### 5. Read the engagement data

Open the quote in the dashboard (**Quote Tracker → [quote name]**).

**Engagement section** shows:

| Field | What it means |
|---|---|
| Total opens | How many times the PDF was loaded |
| Unique viewers | Distinct browser sessions |
| Total time | Cumulative active reading time across all sessions |
| Max scroll | How far down the page the client scrolled (%) |
| Forwarding | Flagged when more than one IP address opened the link |
| Interest score | 0–100 computed from opens, scroll, devices, and CTA clicks |

**Viewers section** shows per-session or per-recipient details (depending on whether the email gate is on).

**Event Timeline** shows every tracked event in order: opens, page views, scroll milestones, downloads, and close events.

### 6. Understand the status badge

Each quote is automatically tagged based on engagement. Manual overrides are available on the quote detail page.

| Status | Computed when… |
|---|---|
| **Hot** | 3+ opens, return visit on a different day, CTA click, or >5 min reading time |
| **Warm** | 1–2 opens with >50% scroll depth |
| **Cold** | Opened but engagement is still low |
| **Dead** | Never opened after 3+ days since creation |

The KPI cards at the top of the Quote Tracker list summarise counts across all quotes.

### 7. Get notified by email (optional)

You don't have to keep checking the dashboard — rgtools can email the team automatically:

- **Quote opened** — sent the first time a client (not internal staff) opens a quote.
- **High interest** — sent when a quote crosses the high-intent threshold (3+ opens, a return visit on another day, a CTA click, forwarding suspected, or deep reading).

Internal-only opens (you previewing your own link) are skipped, and each email is sent at most once per quote so you won't get spammed. Notifications are checked every few minutes, so allow a short delay after an open.

Turn this on and choose who receives the emails at **Quote Tracker -> Configuration -> Open notifications** (see [Tracking settings](#tracking-settings) below).

---

## Common tasks

### Re-share an updated quote

The tracked link doesn't change, so to re-share just copy and resend the same link.

To refresh the **PDF** (e.g. the quote changed in ServiceM8): **Track Quote** will not overwrite a quote that is still **live** — if you enter the job while a tracked quote is unexpired, it returns the existing link rather than re-pulling. Wait until the current tracked quote expires, then run **Track Quote** again for the same job to pull the updated PDF and mint a fresh link.

### Override the status badge

Open the quote detail page → **Manual Status Override** section → pick a status → **Save**. The manual tag wins over the computed tag. A note shows when an override is active.

### Change who can pass the email gate

Open the quote → **Email gate** section → update the Recipient emails field → **Save gate**. Changes take effect immediately for the next visitor.

### Disable the email gate

Uncheck **Email gate** and click **Save gate**. Visitors will land directly on the PDF viewer without being asked for their email.

---

## Expiry

Quotes expire automatically. The default expiry is **1 hour** from creation (configurable when creating via the API or CLI with an `--expiry` flag: `1h`, `3h`, `12h`, `1d`, `7d`, `30d`, or a custom ISO date).

When a quote expires:

- The viewer shows "This link has expired" to anyone who opens it.
- The cleanup cron (runs nightly) deletes the PDF from R2 and archives the quote row.
- Archived quotes no longer appear in the tracker list but their engagement history is preserved.

IP addresses in events are purged after 90 days by the same cron job.

---

## Tracking settings

Admins can toggle individual tracking signals at **Quote Tracker -> Configuration**.

| Setting key | What it controls |
|---|---|
| `track.ip` | Whether raw IP is stored (hashed copy always kept) |
| `track.geo` | Cloudflare country, city, region, and ISP |
| `track.page_completion` | Per-page view events |
| `track.return_visits` | Whether return visits count toward status |
| `track.distinct_viewers` | Forwarding detection (requires `track.ip`) |
| `track.download_print` | Download and print button events |
| `track.active_time` | Focused active reading time |
| `track.time_to_open` | Time from link creation to first open |
| `track.cta_clicks` | Accept / Contact Us button clicks |
| `viewer.download` | Show Download button in viewer |
| `viewer.print` | Show Print button in viewer |
| `viewer.accept` | Show Accept button (off by default, coming soon) |
| `viewer.contact_us` | Show Contact Us button (off by default, coming soon) |

Settings are cached for 60 seconds in the tracker worker. Changes take up to a minute to propagate to new events.

### Open notifications

The same **Quote Tracker -> Configuration** page controls the email alerts (see [step 7](#7-get-notified-by-email-optional)):

| Setting key | What it controls |
|---|---|
| `notifications.enabled` | Master on/off for "Quote opened" and "High interest" emails |
| `notifications.to` | Who receives them — one or more addresses, comma-separated (defaults to `support@royalglass.co.nz`) |

Notifications are sent by the `rg-notifier` worker on a schedule (every ~10 minutes) via Resend, so there is a short delay between an open and the email.

---

## AI Guidance

On a quote detail page, staff may see **AI Guidance** when the feature is configured. It uses current quote details, engagement signals, and the latest conversation snapshot to suggest a next viable move.

AI Guidance can include:

| Field | What it means |
|---|---|
| Next viable move | The recommended follow-up action |
| Suggested timing | When to follow up and why |
| Confidence | Low, Medium, or High confidence with a reason |
| Likely customer state | A plain-English read of the client's current position |
| Phone talking points | Bullets for a call |
| Email draft | Draft follow-up copy staff can review and send manually |
| Use care guidance | Notes about where to be careful |

AI Guidance is advisory. It does not send email, call clients, change the status badge, or update ServiceM8. Staff should review and edit any copied email content before sending it.

If the snapshot is partial or stale, the panel shows that context so you know how much confidence to put in the suggestion.

---

## Troubleshooting

### "Generate the quote in ServiceM8 first"

The quote PDF does not exist in ServiceM8 yet.

- Open the job in ServiceM8.
- Go to the **Quote** tab and click **Generate** (or **Produce Document**).
- Wait for ServiceM8 to confirm the PDF was created, then try again.

### "No matching ServiceM8 job found"

The Job ID you entered doesn't match any job in ServiceM8.

- Double-check the Job ID (e.g. `R260210`) against the job in ServiceM8 — a typo is the most common cause.
- Confirm the job actually exists in ServiceM8 and hasn't been deleted.

### "A live tracked quote already exists for this job"

There is already a tracked quote for this job that hasn't expired yet. This is expected — the system won't overwrite a live quote.

- The dialog shows the existing quote's link and expiry with a **Copy** button — use that link.
- If you genuinely need a fresh link with new tracking, wait for the current one to expire, then run **Track Quote** again.

### Link shows "This link has expired"

The quote's expiry time has passed.

- Go to **Quote Tracker**, find the quote, and open the detail page.
- The Expires field will confirm the expiry date.
- There is no current UI to extend an expiry — once it has expired, run **Quote Tracker → Track Quote** for the same job to mint a fresh link.

### Email gate shows "Please use the email address this quote was shared with"

The email the client entered doesn't match any of the recipients configured on this quote.

- Open the quote detail → Email gate section.
- Check the Recipient emails list for typos.
- Add the client's actual email if it's missing and click **Save gate**.
- Ask the client to try again.

### Client opened the link but no events appear

Check a few things in order:

1. Confirm the quote is not expired (viewer shows "This link has expired" — events are only recorded for live quotes).
2. Confirm the tracker worker is deployed: `cd workers/tracker && wrangler deploy`.
3. Confirm `TRACKER_URL` is set in the viewer worker's `wrangler.toml` or vars — it needs to point to the deployed tracker worker URL, not `/track`.
4. Check Cloudflare Workers logs for the tracker worker for errors.

### Forwarding flagged unexpectedly

The system flags forwarding when more than one unique IP opens the quote. This can be a false positive if:

- The client is on a VPN that routes through different IPs.
- The link was accidentally opened on a phone and a laptop on different networks.
- QA testing opened the link before the client did.

You can ignore the flag or manually override the status badge. It's a signal, not a block.

### Quote value shows $0 or an unexpected amount

The tracked value is the sum of all job material line items × 1.15 GST. It is **not** the `total_invoice_amount` field from ServiceM8 (which stays 0 until the invoice is raised).

- Check the job in ServiceM8 → **Materials** tab to confirm line items are entered.
- Recreate the tracked quote to refresh the stored value.

### Can't copy the quote link (Copy button does nothing)

The Copy Link button uses the browser Clipboard API, which requires a secure context (HTTPS) or localhost.

- If you're accessing the dashboard over HTTP, the button will silently fail — switch to HTTPS.
- As a workaround, the full URL is also shown in the detail page under **Link** — you can select and copy it manually.

---

## CLI reference (developers / testing)

All commands run from the root of the rgtools project.

```powershell
# Pull and preview a quote PDF locally
pnpm quote:pull --job 123
pnpm quote:pull --uuid <jobUuid>
pnpm quote:pull --latest

# Preview with a local server (auto-opens browser)
pnpm quote:preview --job 123

# Serve a tracked quote through a public Cloudflare tunnel (for demo/testing)
pnpm quote:share --job 123
pnpm quote:share --latest --watch

# Create a tracked quote in the database (staging/prod)
pnpm quote:create --job 123
pnpm quote:create --uuid <jobUuid>
```

`pnpm quote:share` uses a temporary `trycloudflare.com` tunnel — the URL changes each run and is not suitable for sending to real clients.

---

## Where things live

| Thing | Location |
|---|---|
| Quote tracker dashboard | `/quote-tracker` in rgtools |
| Viewer worker code | `workers/viewer/src/index.ts` |
| Tracker worker code | `workers/tracker/src/index.ts` |
| Cleanup cron worker | `workers/cleanup/src/index.ts` |
| Notifier cron worker (open emails) | `workers/notifier/src/index.ts` |
| Quote creation logic | `apps/web/modules/quote-tracker/create-tracked-quote.ts` |
| Engagement scoring | `apps/web/modules/quote-tracker/score.ts` |
| Email gate logic | `apps/web/modules/quote-tracker/email-gate.ts` |
| Tracking settings | Quote Tracker -> Configuration in the dashboard |
| AI Guidance | Quote detail page in rgtools |
| PDFs at rest | Cloudflare R2 bucket `quotes/<shortcode>.pdf` |
| Database | Neon (Postgres) — `quotes`, `quote_events`, `quote_engagement`, `quote_recipients`, `quote_viewer_emails`, quote AI snapshot/suggestion/failure tables |
