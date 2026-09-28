# Lead Intake Form

The lead intake form is at `/lead-intake`. Use it to record new enquiries from phone, email, WeChat, calculator, contact forms, or other channels.

## Opening the Form

Click **Lead Intake** in the navigation. If you do not see it, ask an admin to grant module access.

## Score Panel

The score panel updates live as you fill in the Decision Matrix fields. It shows:

- Tier A-E
- Current score and completeness
- Last update and follow-up date

The follow-up date is prefilled from the tier cadence until you type your own date.

## Required Fields

The minimum save is:

- Client Name / Business Name
- Phone
- Email
- Job Address

If a client with the same phone number or email already exists, their record is usually reused and updated. When the email and phone point to different client records, rgtools keeps the new enquiry on a separate client record and adds a contact-review note. Check both matches before linking or merging records.

## First-Call Fields

Use **Product** for the actual glass product, such as pool fence, balustrade, shower, handrail, or other.

Use **Job Description** for a short project summary from the call.

Use **Channel** for how the enquiry arrived, such as phone, email, WeChat, calculator, contact form, or other.

## Decision Matrix Fields

The score comes from the hardcoded Decision Matrix:

- Client Type
- Budget Band
- Resource Consent
- Building Consent
- Building Stage
- Project Type
- Price-sensitivity Read
- Decision-makers
- Distance
- Source
- Payment History
- Site Access
- Installation Height

Distance is computed from the job address. Do not guess answers for fields the customer has not provided.

## Saving a Lead

Click **Save and score**. The form validates the required fields, saves the client and lead, computes the score/tier/completeness, audit-logs the change, and attempts to sync the lead to ServiceM8.

## Editing a Lead

Open a lead from `/leads` and click **Edit**. A reason for edit is required before saving changes; this reason is recorded in the audit log.
