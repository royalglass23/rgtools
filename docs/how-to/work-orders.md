# Work Orders

Use **Work Orders** for active jobs after the ServiceM8 job has moved to `Work Order` status.
ServiceM8 remains the source of truth for the job status and source details; RG Tools stores the
internal operational context used by the team.

## Refresh and find a job

1. Open **Work Orders** from the navigation.
2. Select **Refresh from ServiceM8** when the list needs to be reconciled.
3. Search or filter for the job.
4. Expand a job to review its ServiceM8 items and current production labels.
5. Open the job to see the full Work Order detail and linked client context.

Refresh is protected against overlapping requests. If a refresh fails, the previous saved dashboard
snapshot remains in place and the failure is shown to staff; a failed refresh must not be treated as
proof that a job has disappeared.

## Manage operational details

Users with Work Orders manage access can update RG-owned fields such as installer, stage, hardware
status, install date, completion date, risk, importance, and internal notes. Changes are audited in
the Work Order timeline.

ServiceM8 quantity, item code, and the full source description remain read-only. The short
production label can be corrected in RG Tools. A **Label pending** state means the source
description is being used until generation succeeds or a manager corrects it.

## Production Specifications

Where enabled, a Work Order item can have an AI-generated Production Specification draft. Review the
draft, correct any fields that need changing, and confirm it before relying on it operationally.
The published PS Generator configuration supplies the controlled catalogue values; it does not
make the AI result automatically authoritative.

## Permissions

| Permission | Capability |
| --- | --- |
| Work Orders view | Read the current Work Orders list and details |
| Work Orders manage | Edit operational fields and allowed item labels |
| Work Order configuration | Configure option lists, summary fields, and production-spec filters |

Ask an administrator for the missing grant when a control is unavailable. Do not bypass the module
permission boundary by editing ServiceM8 or the database directly.
