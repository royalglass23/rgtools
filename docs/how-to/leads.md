# Leads Dashboard

The leads dashboard is at `/leads`. It shows lead-intake records that still need sales follow-up, along with their tier, score, ServiceM8 link, and current ServiceM8 lifecycle status.

## The Leads List

Click any row to open the lead detail page.

### Columns

| Column | Description |
|--------|-------------|
| **Date** | When the lead was submitted or imported |
| **Client** | Client name and company, if set |
| **Job Number** | ServiceM8 job number, when linked |
| **Job Address** | The project address |
| **Project** | Project type |
| **Tier** | A, B, C, D, or E when scored; imported ServiceM8 leads may need scoring first |
| **Score** | Raw score out of 100 when scored |
| **SM8** | ServiceM8 link status |
| **Completeness** | Percentage of scored fields filled in |

### Views And Filters

Use **View** to choose the lifecycle set:

- **Current Quotes** is the default working list. It shows unlinked leads plus linked ServiceM8 jobs whose status is exactly `Quote`.
- **All statuses** shows every non-archived lead, including jobs that moved to Work Order or another ServiceM8 status.
- **Archived only** is admin-only and shows archived leads.

Other filters narrow the selected view:

- **Tier** shows only A, B, C, D, or E leads.
- **SM8** shows Linked, Pending, or Failed leads.
- **Date** limits by last 7 days, last 30 days, or all time.
- **Activity** can show stale unlinked leads.
- **Sort** changes the table order.

Filters apply immediately when you change a dropdown. Pagination resets to page 1 when filters change.

## Import From ServiceM8

Use **Import from ServiceM8** on the Leads page when the enquiry already exists as a ServiceM8 job.

1. Enter the ServiceM8 job number only, for example `Q260004`.
2. Click **Import**.
3. RG Tools fetches that exact job and accepts it only when the current ServiceM8 status is singular `Quote`.
4. If the job is already linked to a lead, RG Tools opens the existing lead instead of creating a duplicate.
5. If the job is a valid Quote and not already linked, RG Tools creates the lead immediately and opens the detail page.

Imported leads store the ServiceM8 job UUID, job number, status, job address, client/company context, and any available phone or email. They start as **Needs scoring**: no tier or score is invented from ServiceM8 data. Complete the scoring fields through Lead Intake while the job is still in Quote status.

If ServiceM8 has no phone or email on the job contact or linked company, RG Tools still creates the lead and adds an import flag to the notes so staff know manual contact follow-up is needed.

## Lead Detail Page

Click a lead in the list to open its full detail view at `/leads/[id]`.

The detail page shows:

- **Client**: job number, name, company, project type, job address, email, and phone.
- **Notes**: follow-up date, last update, and free-text notes.
- **Scored Fields**: each scoring category, the selected answer, and points earned.
- **Score Summary**: tier, total score, completeness, flag note, and score reason.
- **Suggested next step**: lead-intake AI suggestion when the lead is editable and AI is configured.
- **ServiceM8**: current link details, status, Leads Quality, Fetch from ServiceM8, and Wrong job? Re-link.

### Edit A Lead

Click **Edit** to open the intake form pre-filled with this lead's data. A reason for edit is required before saving. See [Lead Intake](lead-intake.md#editing-an-existing-lead).

Linked leads become read-only when ServiceM8 status is no longer `Quote`. The page stays viewable for history, but the Edit button and lead-intake AI action are disabled or absent. This prevents staff from continuing lead-intake work after ServiceM8 has moved the job into Work Order, completed, unsuccessful, or another lifecycle state.

The **Fetch from ServiceM8** button remains available on read-only leads. Use it as the status refresh path if ServiceM8 has changed the job back to `Quote`.

## Fetching From ServiceM8

When a lead is submitted through Lead Intake, RG Tools sends an email to the ServiceM8 inbox with an `RGTools Lead {id}` reference. ServiceM8 creates a job from that email. When the job-created webhook is configured, RG Tools automatically links the converted calculator job and writes the full internal job-card details before acknowledging the callback. Temporary ServiceM8 lookup or write failures are returned for retry.

Click **Fetch from ServiceM8** on the detail page. The button:

1. Searches ServiceM8 jobs for `RGTools Lead {leadId}` when the lead is not yet linked, or refreshes the known job UUID when the lead is already linked.
2. Stores the ServiceM8 job UUID, job number, and current status.
3. Writes the human-readable lead values into the ServiceM8 job card: Job Description, Client Type, Leads Quality, and Note.
4. On later fetches, refreshes status and retries the same job-card write so a temporary first-write failure can recover.

The button shows a status message after each fetch:

- `ServiceM8 job linked and Leads Quality set.`
- `ServiceM8 job details refreshed.`
- `No matching job found in ServiceM8 yet`

Use **Wrong job? Re-link** when a lead was linked to the wrong ServiceM8 job. Re-link accepts Quote jobs only. Non-Quote targets are rejected and the existing lead link is left unchanged.

## Archived Leads

Admins can select rows and click **Delete selected**. Deleted leads are soft-deleted and disappear from normal views.

Admins can switch **View** to **Archived only** to inspect archived lead records. Use **Restore** on an archived row to clear the archived state. Restored leads return to the correct list automatically:

- Unlinked restored leads appear in **Current Quotes**.
- Linked restored leads whose ServiceM8 status is `Quote` appear in **Current Quotes**.
- Linked restored leads whose ServiceM8 status is not `Quote` appear in **All statuses**, but not **Current Quotes**.
