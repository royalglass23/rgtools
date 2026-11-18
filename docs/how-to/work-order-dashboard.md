# Work Orders dashboard

After signing in, open **Dashboard → Work Orders**.

The current page starts with the requested two table layouts:

- **Table A - Every work order:** WO, Customer, Short address, Approx install date, Within 3 weeks?.
- **Table B - Due within 3 weeks:** WO / client / address, Materials (per product), Client waiting for, Site ready, Glass ready, Hardware ready, Design Y/N/?, PS1 / PS3, Bottle strut, BC?, Minor var?.

Both tables are temporarily empty while the columns are set up. No job or product records are fetched for this screen, and no stored data is cleared.

Search by job, customer, site or product. Each table has independent Previous/Next pages and a 5/10/20/50 page-size selector. Changing one table preserves the other table and the search; changing its size returns it to page one.

The materials-preview component is retained for when rows return. It supports hover, keyboard focus and tap to open the full description, with Close and Escape to dismiss it.

This page currently has no refresh, assessment, evidence or editing controls. Previously stored assessments and staff values, including deliberate clears, remain intact. No ServiceM8 or database records are removed by this UI reset.
