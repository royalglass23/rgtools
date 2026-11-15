# Work Orders dashboard

After signing in, open the arrow beside **Dashboard**, then **Work Orders**.
Clicking the Dashboard label itself always opens the main operations dashboard.
Quote tracking is grouped in the same submenu. Roxy Dashboard is visible only to Roxy's configured account and Admins.

## Find and plan work

Search by job number, customer, site or product. **All work orders** lists the matching active saved ServiceM8 Work Orders.
Select a product name to open its planning details. Source quantity and description are read-only.

**Product planning** has All products, Next 3 weeks, Overdue, Unknown and Review conflicts views.
Next 3 weeks includes today through 21 days ahead in Auckland time. A booking does not establish an installation date.
Manual include/exclude choices that disagree with a target date appear under Review conflicts; dates are not silently changed.
An unknown readiness state is different from No. PS1/PS3 needed is separate from issued.

## Edit a product

All signed-in staff can set readiness, client waiting for, installer, target installation date, materials ETA,
design/document requirements, issue checks, aftercare, estimated hours and notes, then select **Save product**.
Different products on the same job keep separate values. Installer and target date are shared with the existing Work Orders item record.

Each change records the signed-in actor, time, and before/after values. Open **Change history** to read recent entries or older pages.
If somebody saves a newer version, your stale save is rejected and your unsaved text remains available.
Copy any work you need before selecting **Reload saved version**. A source refresh preserves manual fields and explicit clears.

## Refresh source data

**Refresh from ServiceM8** reads current source jobs and product lines into saved RG Tools records.
It sends no ServiceM8 updates and starts no AI generation. Overlapping refreshes are protected and repeated requests are rate-limited.
While this dashboard is visible, it checks once a minute and requests source refresh when the saved source time is over five minutes old.
No unattended scheduler has been enabled.
Refresh is paused while any product has unsaved edits. A save also waits to refresh the page while another product is being edited.
If editing begins during a source request, source data may finish saving but the displayed rows stay in place until edits are saved or reloaded.
Drafts also remain in **Unsaved product drafts** above the page if a product disappears during a refresh already in progress.
Expand that draft to copy its values, or return to All products to continue editing the same product. Drafts are held only in this signed-in tab; they do not survive a full browser reload or sign-out.

If a refresh fails, the previous saved records remain and the failure is shown. The displayed source time is the last successful reconciliation,
not the time of a staff readiness edit or proof of complete Diary history.

## Legacy workbook values

Existing spreadsheets and backups need an import preview and product mapping review before their values are applied.
They are not silently imported when opening or refreshing this dashboard. Keep current team copies until the reviewed cutover.
AI follow-up drafting and sending are outside this release.
