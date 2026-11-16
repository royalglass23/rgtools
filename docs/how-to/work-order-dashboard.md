# Work Orders dashboard

After signing in, open the arrow beside **Dashboard**, then **Work Orders**.
Clicking the Dashboard label itself always opens the main operations dashboard.
Quote tracking is grouped in the same submenu. Roxy Dashboard is visible only to Roxy's configured account and Admins.

## Find and plan work

Search by job number, customer, site or product. **Table A - All Work Orders** lists WO, Customer, Short address, Approx install date and Within 3 weeks?, following the prototype.
**Table B - Due within 3 weeks** follows the prototype's eleven columns: WO/client/address, Materials per product, Client waiting for, Site ready, Glass ready, Hardware ready, Design, PS1/PS3, Bottle strut, BC and Minor variation.
Each Table B row represents one product. Materials shows a short description (up to 80 characters). Hover over it, focus it with the keyboard, or tap it to open the full source description. The preview stays open while you read it; select Close, press Escape or use another control to dismiss it. The preview's **Edit product** link opens the planning details, as does expanding **Edit product** below the row. Source quantity and description are read-only.

Both tables use the standard RG Tools pagination: matching count, Previous / current page / Next, then Page size and Apply. Each starts with 5 rows; choose 5, 10, 20 or 50. Changing one table's page or size preserves the other table and the current search/focus. Changing size returns that table to page one.

**Product planning** has All products, Due within 3 weeks, Overdue, Unknown and Review conflicts views.
Due within 3 weeks includes today through 21 days ahead in Auckland time. A booking does not establish an installation date.
Membership follows this order: a product's **Include manually / Exclude manually / Needs review** choice, then the imported Master **Y / N / ?** job flag, then the automatic 21-day date calculation where no flag exists. A Y flag includes TBC or overdue work; N excludes it; ? keeps it for review. Each product inherits the job flag independently and can override it without changing the other products.
The displayed date uses a saved staff target first, otherwise an evidence-backed **AI-suggested** installation or delivery date. Suggestions are unconfirmed and never overwrite staff dates. Open **Detected planning evidence** inside Edit product to read the reason, source quotes and assessment time. Imported flag provenance appears above the editor and in **Change history**. Spreadsheet dates and other manual fields are not transferred by the flag import.
Manual include/exclude choices that disagree with a target date appear under Review conflicts; dates are not silently changed.
Following the Kanban bot's rules, **Include manually** keeps a product in Due within 3 weeks even when its date is overdue or outside the window. **Exclude manually** and **Needs review** override the imported flag. **Use Kanban flag / automatic date** clears the product override and restores inheritance. Clearing a staff date leaves it blank; it does not clear the job flag.
An unknown readiness state is different from No or N/A. PS1/PS3 needed is separate from issued. Bottle strut and BC are editable product fields and are included in change history.

## Edit a product

All signed-in staff can set readiness, client waiting for, installer, target installation date, materials ETA,
design/document requirements, issue checks, aftercare, estimated hours and notes, then select **Save product**.
Different products on the same job keep separate values. Installer and target date are shared with the existing Work Orders item record.

Each change records the signed-in actor, time, and before/after values. Open **Change history** to read recent entries or older pages.
If somebody saves a newer version, your stale save is rejected and your unsaved text remains available.
Copy any work you need before selecting **Reload saved version**. A source refresh preserves manual fields and explicit clears.

## Refresh source data

**Refresh from ServiceM8** reads current source jobs and product lines into saved RG Tools records.
After reading the source, every refresh checks descriptions, active notes and emails for installation/delivery evidence per product. Changed evidence is assessed using AI; unchanged evidence reuses its saved result. Bookings, task dates and site visits cannot establish an installation date. The rolling 21-day window updates whenever the dashboard loads.
Refresh sends no ServiceM8 updates. Overlapping refreshes are protected and repeated requests are rate-limited.
While this dashboard is visible, it checks once a minute and requests source refresh when the saved source time is over five minutes old.
No unattended scheduler has been enabled.
Refresh is paused while any product has unsaved edits. A save also waits to refresh the page while another product is being edited.
If editing begins during a source request, source data may finish saving but the displayed rows stay in place until edits are saved or reloaded.
Drafts also remain in **Unsaved product drafts** above the page if a product disappears during a refresh already in progress.
Expand that draft to copy its values, or return to All products to continue editing the same product. Drafts are held only in this signed-in tab; they do not survive a full browser reload or sign-out.

If a refresh fails, the previous saved records remain and the failure is shown. The displayed source time is the last successful reconciliation,
not the time of a staff readiness edit or proof of complete Diary history.
Assessment failures or work left pending are shown in the refresh result. Retry on the next refresh. Stale or failed suggestions do not drive automatic inclusion; saved staff fields still apply. Large evidence histories stay pending/reviewable rather than being silently truncated. AI must be configured by an administrator before suggestions are available.
An email such as “install on 1 December” can now supply a planning date when its own timestamp establishes a nearby year. Old emails keep their original year. If assessment fails, a banner above the tables shows how many products failed; open **All products → Edit product → Detected planning evidence** for safe retry details. An empty due view can therefore mean an assessment failed, rather than that no work is due.

## Legacy workbook values

The approved Master **Within 3 weeks?** snapshot is transferred through an exact job-match preview and recorded with its source cells. This is a one-time bridge; later Sheet changes need another explicit import. Normal ServiceM8 refresh preserves imported flags and product edits.
Other spreadsheet fields and backups need their own import review. Keep team copies until the reviewed cutover.
AI follow-up drafting and sending are outside this release.
