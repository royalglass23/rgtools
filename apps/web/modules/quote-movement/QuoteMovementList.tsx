"use client";

import Link from "next/link";
import type {
  QuoteMovementImportantDetailsSummary,
  QuoteMovementProjectComplexity,
} from "@rgtools/db/schema-quote-movement";
import {
  formatQuoteMovementCurrency,
  formatQuoteMovementDate,
} from "./presentation";

const PROJECT_COMPLEXITY_OPTIONS: Array<
  readonly [QuoteMovementProjectComplexity, string]
> = [
  ["unassessed", "Unassessed"],
  ["easy", "Easy"],
  ["normal", "Normal"],
  ["tight", "Tight"],
  ["very_difficult", "Very Difficult"],
];

export type QuoteMovementListRecord = {
  id: string;
  jobNumber: string | null;
  customerName: string;
  jobAddress: string | null;
  quoteValueExcludingGst: string | null;
  projectComplexity: QuoteMovementProjectComplexity;
  latestActivityAt: Date | null;
  convertedAt: Date | null;
  workOrderId: string | null;
  importantDetailsSummary?: QuoteMovementImportantDetailsSummary | null;
  sourceCoverage?: string;
  sourceUnreadCount?: number;
  summaryLastError?: string | null;
};

export type QuoteMovementSelectedControls = {
  search: string;
  projectComplexity: QuoteMovementProjectComplexity | "all";
  lifecycle: "active" | "converted";
  sort: "latest_activity" | "quote_value" | "customer";
};

export function QuoteMovementList({
  records,
  selectedControls,
  updateComplexityAction,
}: {
  records: QuoteMovementListRecord[];
  selectedControls: QuoteMovementSelectedControls;
  updateComplexityAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <form
        action="/quote-movement"
        aria-label="Quote Movement controls"
        className="grid gap-3 md:grid-cols-4"
        method="get"
      >
        <label className="grid gap-1 text-sm font-medium text-text-secondary">
          Search
          <input
            className="rounded-md border border-border bg-surface px-3 py-2 text-text-primary"
            defaultValue={selectedControls.search}
            name="search"
            type="search"
          />
        </label>
        <FilterSelect
          label="Complexity"
          name="projectComplexity"
          value={selectedControls.projectComplexity}
          options={[["all", "All complexities"], ...PROJECT_COMPLEXITY_OPTIONS]}
        />
        <FilterSelect
          label="Active/Converted"
          name="lifecycle"
          value={selectedControls.lifecycle}
          options={[
            ["active", "Active"],
            ["converted", "Converted"],
          ]}
        />
        <FilterSelect
          label="Sort"
          name="sort"
          value={selectedControls.sort}
          options={[
            ["latest_activity", "Latest Activity"],
            ["quote_value", "Quote Value"],
            ["customer", "Customer"],
          ]}
        />
      </form>

      {records.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-subtle p-6 text-sm text-text-muted">
          {selectedControls.lifecycle === "active"
            ? "No active ServiceM8 Quote jobs."
            : "No converted cached Quote jobs."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-subtle text-left text-xs font-semibold text-text-muted">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3 text-right">
                  Quote Value excluding GST
                </th>
                <th className="px-4 py-3">Project Complexity</th>
                <th className="px-4 py-3">Latest Activity</th>
                <th className="px-4 py-3">Important Now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map((record) => {
                const jobLabel = record.jobNumber ?? "Open quote";
                return (
                  <tr key={record.id} className="text-text-secondary">
                    <td className="px-4 py-3">
                      <Link
                        className="font-semibold text-brand underline-offset-2 hover:underline"
                        href={`/quote-movement/${record.id}`}
                      >
                        {jobLabel}
                      </Link>
                      <div className="mt-1 text-text-primary">
                        {record.customerName}
                      </div>
                      <div className="text-xs text-text-muted">
                        {record.jobAddress ?? "Address unavailable"}
                      </div>
                      {record.convertedAt ? (
                        record.workOrderId ? (
                          <Link
                            className="mt-1 inline-block text-xs text-brand underline-offset-2 hover:underline"
                            href={`/work-orders/${record.workOrderId}`}
                          >
                            Open Work Order
                          </Link>
                        ) : (
                          <div className="mt-1 text-xs text-text-muted">
                            Work Order record not yet available
                          </div>
                        )
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {formatQuoteMovementCurrency(
                        record.quoteValueExcludingGst,
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <form action={updateComplexityAction}>
                        <input
                          name="recordId"
                          type="hidden"
                          value={record.id}
                        />
                        <select
                          aria-label={`Project Complexity for ${jobLabel}`}
                          className="rounded-md border border-border bg-surface px-2 py-1.5 text-text-primary"
                          defaultValue={record.projectComplexity}
                          name="projectComplexity"
                          onChange={(event) =>
                            event.currentTarget.form?.requestSubmit()
                          }
                        >
                          {PROJECT_COMPLEXITY_OPTIONS.map(
                            ([optionValue, optionLabel]) => (
                              <option key={optionValue} value={optionValue}>
                                {optionLabel}
                              </option>
                            ),
                          )}
                        </select>
                      </form>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-muted">
                      {formatQuoteMovementDate(record.latestActivityAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-text-primary">
                        {record.importantDetailsSummary?.currentPosition.text ??
                          "Not yet summarised"}
                      </p>
                      {record.summaryLastError ? (
                        <p className="mt-1 text-xs text-warning-text">
                          {record.summaryLastError}
                        </p>
                      ) : null}
                      {record.sourceCoverage ? (
                        <p className="mt-1 text-xs text-text-muted">
                          {record.sourceCoverage === "complete"
                            ? "Complete Source Coverage"
                            : `Incomplete Source Coverage · ${record.sourceUnreadCount ?? 0} unread ${(record.sourceUnreadCount ?? 0) === 1 ? "source" : "sources"}`}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string;
  options: Array<readonly [string, string]>;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-text-secondary">
      {label}
      <select
        className="rounded-md border border-border bg-surface px-3 py-2 text-text-primary"
        defaultValue={value}
        name={name}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
