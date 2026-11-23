# Work Orders dashboard

After signing in, open **Dashboard → Work Orders**. The page shows the last complete snapshot received directly from Kanban bot. Published blanks, question marks, row membership and material descriptions are preserved. There are no editing controls or separate AI assessments.

Table B groups eligible billing lines into one row per work order. Each material stays separate inside the Materials cell, using the existing Kanban abbreviations (such as Bal, Shwr, HR, Mir and SB) with its own full-description preview. Duplicate billing items remain separate entries. The eleven columns remain unchanged; other cells retain the published work-order values. This display update is pending deployment.

Older snapshots containing lists such as `Bal 12m; SB; HR` also show each abbreviation separately, preserving its original spelling and quantities such as `Shwr 9u`. Hover expands known names (Balustrade, Splashback, Handrail, Shower — 9 units); a generic `item` shows “Item — description not supplied”. Detailed billing-item descriptions are shown in full when supplied. Search also matches the expanded item names.

- **Table A:** WO, Customer, Short address, Approx install date, Within 3 weeks?.
- **Table B:** WO / client / address, Materials (per product), Client waiting for, Site ready, Glass ready, Hardware ready, Design Y/N/?, PS1 / PS3, Bottle strut, BC?, Minor var?.

Search all supplied cells by job, customer, site, material or other text, including the displayed abbreviations. A material match keeps the whole job and all its materials visible. Each table has its own Previous/Next pages and 5/10/20/50 page-size selector; Table B paginates complete jobs. Hover over, focus or tap an individual material for its full description; Close or Escape dismisses it. Job numbers stay plain text when no verified job link is supplied.

Select **Request update** to dispatch the configured Kanban webhook. The button is disabled during dispatch and then reports **Update requested** when accepted. This acknowledgement does not mean the bot has finished. Existing rows, search and pagination stay usable. Uncertain acceptance is never automatically retried; check the bot before requesting again.

While the tab is visible, the page checks for a new stored publication about every30seconds and reloads when one arrives. Daily and manual bot publications use the same connection. Reopening or normally reloading the page reads the latest snapshot without starting a bot run. Bot failures leave the last good data in place and are handled through the bot's existing notifications.

**Publication history** shows initial snapshots, rows added/removed, field changes, no-change publications and rejected older/conflicting snapshots. Select a received timestamp to view Before/After values, with pages for longer change lists. Counts refer to table rows, not newly created ServiceM8 jobs. Delivery retries do not duplicate history. Source and received times are shown in UTC.

Before the first publication, both table headers remain visible with an empty-state message. Connection setup is an administrator task: see [direct publisher setup](../dev/kanban-published-output.md). Existing operational Work Orders, assessments and staff history remain stored separately.
