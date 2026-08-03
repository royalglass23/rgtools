import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/guard";
import {
  addWorkOrderTimelineNoteAction,
  generateWorkOrderAiSuggestionAction,
} from "@/modules/work-orders/actions";
import { WORK_ORDER_AI_SUGGESTION_COOLDOWN_MS } from "@/modules/work-orders/domain";
import { getCurrentWorkOrderPermissions } from "@/modules/work-orders/permissions";
import { getWorkOrderDetail } from "@/modules/work-orders/queries";
import { DismissibleNotice } from "@/modules/ui/DismissibleNotice";
import {
  DataPanel,
  PageHeader,
  PrecisionButton,
  StatusBadge,
  precisionControlClassName,
} from "@/components/precision-ui/PrecisionUI";

export default async function WorkOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("work-orders");
  const { id } = await params;
  const notices = await searchParams;
  const [detail, permissions] = await Promise.all([
    getWorkOrderDetail(id),
    getCurrentWorkOrderPermissions(),
  ]);

  if (!detail) notFound();
  const aiCooldownUntil = detail.aiSuggestionAt
    ? new Date(
        detail.aiSuggestionAt.getTime() + WORK_ORDER_AI_SUGGESTION_COOLDOWN_MS,
      )
    : null;
  const aiCooldownActive = Boolean(
    aiCooldownUntil && aiCooldownUntil > new Date(),
  );
  const redirectedCooldownUntil =
    typeof notices.aiRefreshCooldownUntil === "string"
      ? formatDateTime(new Date(notices.aiRefreshCooldownUntil))
      : null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Work Order detail"
        title={detail.clientName}
        description={
          <>
            <Link
              href="/work-orders"
              className="font-medium text-brand hover:underline"
            >
              Back to Work Orders
            </Link>
            {detail.companyName && (
              <span className="ml-3 text-text-muted">{detail.companyName}</span>
            )}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={detail.isCurrent ? "positive" : "muted"}>
              {detail.isCurrent ? "Current" : "Non-current"}
            </StatusBadge>
            <StatusBadge tone={detail.servicem8Active ? "info" : "muted"}>
              {detail.servicem8Active
                ? "ServiceM8 active"
                : "ServiceM8 inactive"}
            </StatusBadge>
          </div>
        }
      />

      <Section title="Job Summary">
        <dl className="grid gap-4 sm:grid-cols-4">
          <Field label="Job number" value={detail.jobNumber} />
          <Field label="Address" value={detail.jobAddress} />
          <Field label="Status" value={detail.servicem8Status} />
          <Field
            label="Lead score"
            value={detail.leadScore?.toString() ?? null}
          />
          <Field
            label="Description"
            value={detail.jobDescription}
            className="sm:col-span-2"
          />
        </dl>
      </Section>

      <Section title="Work Order Items">
        <div className="space-y-3">
          {detail.items.map((workOrderItem) => {
            const effectiveLabel =
              workOrderItem.manualLabelOverride ??
              workOrderItem.generatedLabel ??
              workOrderItem.originalDescription;
            return (
              <article
                key={workOrderItem.id}
                className="rounded border border-gray-200 bg-gray-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium text-gray-950">
                      {effectiveLabel}
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">
                      Qty {workOrderItem.quantity} ·{" "}
                      {workOrderItem.itemCode ?? "No item code"}
                    </p>
                  </div>
                  <span
                    className={`rounded px-2 py-1 text-xs font-semibold ${workOrderItem.isActive ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}
                  >
                    {workOrderItem.isActive ? "Active" : "Removed"}
                  </span>
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field
                    label="Installer"
                    value={workOrderItem.installerName}
                  />
                  <Field label="Stage" value={workOrderItem.stageName} />
                  <Field
                    label="Hardware"
                    value={workOrderItem.hardwareStatusName}
                  />
                  <Field
                    label="Maintenance Program"
                    value={workOrderItem.maintenanceProgram ? "Yes" : "No"}
                  />
                  <Field
                    label="Install date"
                    value={workOrderItem.installDate}
                  />
                  <Field
                    label="Date completed"
                    value={workOrderItem.dateCompleted}
                  />
                  <Field
                    label="Risk"
                    value={
                      workOrderItem.riskLevel
                        ? titleCase(workOrderItem.riskLevel)
                        : null
                    }
                  />
                  <Field
                    label="Importance"
                    value={
                      workOrderItem.importance
                        ? titleCase(workOrderItem.importance)
                        : null
                    }
                  />
                  <Field
                    label="Original ServiceM8 description"
                    value={workOrderItem.originalDescription}
                    className="sm:col-span-2"
                  />
                  <Field
                    label="Line total excluding GST"
                    value={formatMoney(workOrderItem.lineTotalExcludingGst)}
                  />
                </dl>
              </article>
            );
          })}
          {detail.items.length === 0 && (
            <p className="text-sm text-gray-500">
              No Work Order Items have been synced yet.
            </p>
          )}
        </div>
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <DataPanel
          title="Client Context"
          eyebrow="Relationship"
          actions={
            permissions.canManage && (
              <form
                action={generateWorkOrderAiSuggestionAction.bind(
                  null,
                  detail.id,
                )}
              >
                <PrecisionButton
                  type="submit"
                  disabled={aiCooldownActive}
                  tone="secondary"
                >
                  {aiCooldownActive
                    ? `Available ${formatRelativeCooldown(aiCooldownUntil)}`
                    : "Refresh AI Suggestion"}
                </PrecisionButton>
              </form>
            )
          }
        >
          {redirectedCooldownUntil && (
            <div className="mt-3">
              <DismissibleNotice
                tone="warning"
                noticeKey={redirectedCooldownUntil}
              >
                AI suggestion was refreshed recently. Try again after{" "}
                {redirectedCooldownUntil}.
              </DismissibleNotice>
            </div>
          )}
          <dl className="mt-4 space-y-3">
            <Field label="Client notes" value={detail.clientNotes} />
            <Field
              label="Client Context Summary"
              value={detail.clientContextSummary}
            />
            <Field label="AI Suggestion" value={detail.aiSuggestion} />
          </dl>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Contacts
          </h3>
          <ul className="mt-2 divide-y divide-border">
            {detail.contacts.map((contact) => (
              <li key={contact.id} className="py-2 text-sm">
                <span className="font-medium text-text-primary">
                  {contact.name ?? "Unnamed contact"}
                </span>
                {contact.isJobContact && (
                  <span className="ml-2">
                    <StatusBadge tone="info">Job contact</StatusBadge>
                  </span>
                )}
                <span className="block text-text-secondary">
                  {contact.phone ?? "No phone"} · {contact.email ?? "No email"}
                </span>
              </li>
            ))}
            {detail.contacts.length === 0 && (
              <li className="py-3 text-sm text-text-muted">
                No linked client contacts yet.
              </li>
            )}
          </ul>
        </DataPanel>

        <DataPanel title="Project Timeline" eyebrow="Activity">
          {permissions.canManage && (
            <form
              action={addWorkOrderTimelineNoteAction.bind(null, detail.id)}
              className="mt-4 flex gap-2"
            >
              <input
                name="note"
                className={`${precisionControlClassName} min-w-0 flex-1`}
                placeholder="Add timeline note"
              />
              <PrecisionButton type="submit">Add note</PrecisionButton>
            </form>
          )}
          <ul className="mt-4 divide-y divide-border">
            {detail.timeline.map((event) => (
              <li key={event.id} className="py-3 text-sm">
                <span className="font-medium text-text-primary">
                  {eventLabel(event.fieldName)}
                </span>
                <span className="ml-2 text-xs text-text-muted">
                  {formatDateTime(event.createdAt)}
                </span>
                {event.actorUsername && (
                  <span className="ml-2 text-xs text-text-muted">
                    by {event.actorUsername}
                  </span>
                )}
                {event.itemLabel && (
                  <span className="block text-xs font-medium text-[var(--state-info)]">
                    Affected item:{" "}
                    {event.itemCode ? `${event.itemCode} - ` : ""}
                    {event.itemLabel}
                  </span>
                )}
                <span className="block text-text-secondary">
                  {String(event.note ?? event.newValue ?? "-")}
                </span>
                {event.isClientVisibleCandidate && event.portalTitle && (
                  <span className="mt-1 block text-xs font-medium text-[var(--state-positive)]">
                    Portal candidate: {event.portalTitle}
                  </span>
                )}
              </li>
            ))}
            {detail.timeline.length === 0 && (
              <li className="py-3 text-sm text-text-muted">
                No timeline entries yet.
              </li>
            )}
          </ul>
        </DataPanel>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return <DataPanel title={title}>{children}</DataPanel>;
}

function Field({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-text-primary">
        {value || "-"}
      </dd>
    </div>
  );
}

function eventLabel(value: string) {
  return value.split("_").map(titleCase).join(" ");
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-NZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRelativeCooldown(value: Date | null) {
  if (!value) return "soon";
  const minutes = Math.max(
    1,
    Math.ceil((value.getTime() - Date.now()) / 60_000),
  );
  return `in ${minutes} min`;
}

function formatMoney(value: string | null) {
  if (!value) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : value;
}
