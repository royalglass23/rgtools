# Work Orders dashboard

After signing in, open **Dashboard → Work Orders**.

The dashboard displays the Kanban bot's generated Work Orders board, including its existing findings. It does not independently assess jobs or edit the bot's values. A blank or question mark in that board stays blank or a question mark here.

- **Table A - Every work order:** WO, Customer, Short address, Approx install date, Within 3 weeks?.
- **Table B - Due within 3 weeks:** WO / client / address, Materials (per product), Client waiting for, Site ready, Glass ready, Hardware ready, Design Y/N/?, PS1 / PS3, Bottle strut, BC?, Minor var?.

The source determines which rows are in Table B. rgtools does not recalculate its three-week membership or expand combined material rows into new products. There are no editing controls.

Search across the published rows by job, customer, site, materials or other displayed text. Each table has independent Previous/Next pages and a 5/10/20/50 page-size selector. Changing one table preserves the other table and the search; changing its size returns it to page one.

Hover over, focus or tap Materials to see the full published description. Select Close, press Escape or move away to dismiss it. Job numbers are plain text where the published source does not supply a genuine ServiceM8 job link/UUID; the dashboard does not invent links from job numbers.

Select **Refresh** to ask Kanban bot to update its output. Existing rows remain visible while it works. The button is disabled only while this request is being checked; a rate-limit feature is not included. Search, pagination and normal page reload do not start the bot.

The dashboard waits for a receipt matching this request, then reloads the bot's published rows. It distinguishes completion with new output from completion with no changes. A trigger acknowledgement alone is not treated as completion. If the bot fails or completion cannot be confirmed within five minutes, existing rows stay visible and a message explains the state. Check the bot before trying again when acceptance/completion is uncertain; the app does not automatically repeat the trigger. The bot can continue in the cloud after the tab closes; reopening this page reads its latest published output.

If a completion check cannot be read, the bot's result is still unconfirmed. The dashboard shows a warning and keeps checking the same request within the five-minute window, with Refresh disabled. This does not start another bot run. Sheet access or range warnings help an administrator check the connection; only a matching failure receipt reports that the bot itself failed.

If output or Refresh is not configured, an administrator must complete the [connection setup](../dev/kanban-published-output.md). The Google connection uses keyless Vercel workload identity, not a service-account JSON key. Workload trust, a routine webhook and receipt publishing are separate setup steps; the application code alone does not establish a live connection.

Existing stored Work Orders, old assessments and staff history are retained. This dashboard reads the published bot tables rather than merging those old assessments into the display.
