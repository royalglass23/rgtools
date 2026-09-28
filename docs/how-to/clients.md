# Client Records

The Clients area shows the canonical RG Tools client records that connect lead intake, quote tracking, and ServiceM8 job context.

## Who can use it

- Staff need access to the `clients` module.
- Admins can also use client merge review under **Clients -> Merge Review**.

## Client list

Open **Clients** from the navigation bar. The list is for finding the customer record before jumping into related work.

Use it to check:

- Client or company name.
- Aliases or alternate names from imports and merges.
- Phone and email details.
- Linked leads.
- Linked tracked quotes.
- ServiceM8 job context where available.

Use **Search** to find a client by canonical name or alias. Use **Cleanup filter** to narrow the list to imported clients, clients that need review, reviewed clients, possible duplicates, clients with no contact details, clients with no client type, or ServiceM8-linked clients.

Client matching is based on normalised phone and email values. When a new lead or tracked quote arrives, rgtools tries to connect it to the existing client record rather than creating a duplicate.

If the submitted email and phone match different client records, rgtools creates a separate client record marked for review. The lead's review note explains why the details need checking and links to the matching client records. Open both matches and verify ownership before merging or editing existing clients. Calculator enquiries still continue through customer email and ServiceM8 handling.

## Client detail

Open a client row to see the detail page at `/clients/[id]`.

The detail page is the best place to answer:

- Which leads came from this client?
- Which quote links have been sent to this client?
- What job or ServiceM8 context is already connected?
- Are there duplicate records that an admin should review?

Use the linked lead and quote rows to move into the workflow that needs action.

Admins can use **Client cleanup** on the detail page to edit the canonical client name, type/classification, primary contact, manual aliases, review status, review note, and shared client notes. Source aliases from imports and merges are preserved separately so cleanup does not overwrite the raw ServiceM8 context.

## Duplicate clients

Duplicate client records can happen when contact details are missing, typed differently, or imported from older jobs.

Admins review suspected duplicates from **Clients -> Merge Review**. Merge cleanup is intentionally admin-controlled because client records connect multiple workflows.

Strong ServiceM8 identity matches can be planned for safe auto-merge. Ambiguous matches stay in the review queue, where admins can either choose the survivor client or dismiss a false match. Merged duplicates are hidden from normal client lists but kept as merged references so old imports and links can still resolve to the survivor.

## Admin operation notes

When reviewing imported records, check **Cleanup filter -> Needs Review**, **No Contact Details**, **No Client Type**, and **Possible Duplicates**. Keep cleanup in small batches and use the client detail page for canonical edits. Dashboard edits, duplicate merges, and duplicate dismissals are admin-only and write audit or error-log entries.

If a merge was wrong, v1 has no one-click undo. Correct it manually by creating or editing the correct survivor client, moving affected leads/quotes/work orders/contacts back to the right client in the database, and leaving an audit note explaining the correction. Use the hidden merged reference and aliases to identify what was absorbed.

## Developer reference

| Thing | Location |
|-------|----------|
| Client list route | `apps/web/app/(dashboard)/clients/page.tsx` |
| Client detail route | `apps/web/app/(dashboard)/clients/[id]/page.tsx` |
| Client queries | `apps/web/modules/clients/queries.ts` |
| Client resolver | `apps/web/modules/clients/client-resolver.ts` |
| Merge planner | `apps/web/modules/clients/merge-planner.ts` |
| Merge cleanup | `apps/web/modules/clients/merge-cleanup.ts` |
| Admin merge review | `apps/web/app/(dashboard)/admin/client-merge-review/page.tsx` |
