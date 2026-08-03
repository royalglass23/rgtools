"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { batchDeleteQuotesAction } from "./actions";
import { CopyLinkButton } from "./CopyLinkButton";
import { isExpired } from "./expiry";
import type { QuoteListFilters } from "./list-filters";
import { StatusBadge, formatCurrency, formatRelative } from "./presentation";
import type { StatusTag } from "./score";

type QuoteRow = {
  id: string;
  shortCode: string | null;
  clientName: string;
  companyName: string | null;
  jobDescription: string | null;
  jobAddress: string | null;
  quoteValue: string | null;
  statusTag: StatusTag | null;
  aiScore: number | null;
  totalOpens: number | null;
  lastOpenedAt: Date | null;
  forwardingSuspected: boolean | null;
  expiresAt: Date | null;
};

/** Param names this table owns; used for carry-over of other tables' params on shared URLs. */
const OWNED_PARAMS = [
  "search",
  "status",
  "linkStatus",
  "sort",
  "size",
  "page",
  "activity",
] as const;

export function QuoteTableControls({
  filters,
  rows,
  total,
  pageCount,
  basePath = "/quote-tracker",
  paramPrefix = "",
  isAdmin = false,
}: {
  filters: QuoteListFilters;
  rows: QuoteRow[];
  total: number;
  pageCount: number;
  /** Path the filter form + pagination links target. Defaults to the Quote Tracker page. */
  basePath?: string;
  /** Prefix applied to query param names so multiple tables can coexist on one URL. */
  paramPrefix?: string;
  isAdmin?: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected =
    rows.length > 0 && rows.every((quote) => selectedSet.has(quote.id));

  function toggleQuote(quoteId: string) {
    setSelectedIds((current) =>
      current.includes(quoteId)
        ? current.filter((id) => id !== quoteId)
        : [...current, quoteId],
    );
  }

  function toggleAllVisible() {
    setSelectedIds(allVisibleSelected ? [] : rows.map((quote) => quote.id));
  }

  return (
    <>
      <FilterBar
        filters={filters}
        basePath={basePath}
        paramPrefix={paramPrefix}
      />

      {isAdmin && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{selectedIds.length} selected</span>
          <button
            type="submit"
            form="batch-delete-quotes-form"
            disabled={selectedIds.length === 0}
            className="rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete selected
          </button>
        </div>
      )}

      {isAdmin && (
        <form
          id="batch-delete-quotes-form"
          action={batchDeleteQuotesAction}
          onSubmit={(event) => {
            if (selectedIds.length === 0) {
              event.preventDefault();
              return;
            }

            if (
              !window.confirm(
                `Delete ${selectedIds.length} selected quote${selectedIds.length === 1 ? "" : "s"}? This cannot be undone.`,
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          {selectedIds.map((quoteId) => (
            <input key={quoteId} type="hidden" name="quoteId" value={quoteId} />
          ))}
        </form>
      )}

      <div className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              {isAdmin && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Select all visible quotes"
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </th>
              )}
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Job address</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Interest</th>
              <th className="px-4 py-3">Opens</th>
              <th className="px-4 py-3">Last opened</th>
              <th className="px-4 py-3">Link status</th>
              <th className="px-4 py-3">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((quote) => {
              const expired = isExpired(quote.expiresAt);
              const quoteUrl =
                !expired && quote.shortCode
                  ? `https://quotes.royalglass.co.nz/q/${quote.shortCode}`
                  : "";

              return (
                <tr key={quote.id} className="hover:bg-gray-50">
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(quote.id)}
                        onChange={() => toggleQuote(quote.id)}
                        aria-label={`Select quote for ${quote.clientName}`}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <Link href={`/quote-tracker/${quote.id}`} className="block">
                      <span className="font-medium text-gray-950">
                        {quote.clientName}
                      </span>
                      {quote.companyName && (
                        <span className="block text-xs text-gray-500">
                          {quote.companyName}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-gray-700">
                    <Link
                      href={`/quote-tracker/${quote.id}`}
                      className="block truncate"
                    >
                      {quote.jobAddress ?? "-"}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                    <Link href={`/quote-tracker/${quote.id}`} className="block">
                      {formatCurrency(quote.quoteValue)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/quote-tracker/${quote.id}`} className="block">
                      <StatusBadge tag={quote.statusTag ?? "cold"} />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <Link href={`/quote-tracker/${quote.id}`} className="block">
                      {quote.aiScore ?? 0}/100
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <Link href={`/quote-tracker/${quote.id}`} className="block">
                      {quote.totalOpens ?? 0}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                    <Link href={`/quote-tracker/${quote.id}`} className="block">
                      {formatRelative(quote.lastOpenedAt)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/quote-tracker/${quote.id}`} className="block">
                      {expired ? (
                        <span className="inline-flex rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
                          Expired
                        </span>
                      ) : (
                        <span className="inline-flex rounded bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
                          Active
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {quoteUrl ? (
                      <CopyLinkButton value={quoteUrl} />
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={9 + (isAdmin ? 1 : 0)}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  No ServiceM8 quotes are being tracked yet. Use Track ServiceM8
                  quote to add one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-3 items-center gap-3 text-sm text-gray-600">
        <span>{total} tracked quotes</span>
        <div className="flex items-center justify-center gap-2">
          <PageLink
            filters={filters}
            page={Math.max(1, filters.page - 1)}
            disabled={filters.page <= 1}
            basePath={basePath}
            paramPrefix={paramPrefix}
          >
            Previous
          </PageLink>
          <span>
            Page {filters.page} of {pageCount}
          </span>
          <PageLink
            filters={filters}
            page={Math.min(pageCount, filters.page + 1)}
            disabled={filters.page >= pageCount}
            basePath={basePath}
            paramPrefix={paramPrefix}
          >
            Next
          </PageLink>
        </div>
        <div className="flex justify-end">
          <PageSizeSelect
            filters={filters}
            basePath={basePath}
            paramPrefix={paramPrefix}
          />
        </div>
      </div>
    </>
  );
}

function FilterBar({
  filters,
  basePath,
  paramPrefix,
}: {
  filters: QuoteListFilters;
  basePath: string;
  paramPrefix: string;
}) {
  const searchParams = useSearchParams();
  const owned = new Set(OWNED_PARAMS.map((name) => `${paramPrefix}${name}`));
  const carryOver = Array.from(searchParams.entries()).filter(
    ([key]) => !owned.has(key),
  );
  const resetParams = new URLSearchParams(carryOver);
  resetParams.set(`${paramPrefix}size`, String(filters.size));
  resetParams.set(`${paramPrefix}page`, "1");
  const resetHref = resetParams.toString()
    ? `${basePath}?${resetParams}`
    : basePath;

  const filterKey = [
    filters.search,
    filters.status,
    filters.linkStatus,
    filters.activity,
    filters.sort,
  ].join("|");

  return (
    <form
      key={filterKey}
      action={basePath}
      className="grid gap-3 rounded border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-7"
    >
      {carryOver.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <input
        type="hidden"
        name={`${paramPrefix}size`}
        value={String(filters.size)}
      />
      <input type="hidden" name={`${paramPrefix}page`} value="1" />

      <label className="block sm:col-span-2">
        <span className="text-xs font-medium text-gray-600">Search</span>
        <div className="mt-1 flex gap-2">
          <input
            name={`${paramPrefix}search`}
            defaultValue={filters.search}
            placeholder="Client, address, company, code"
            className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950"
          />
          <button
            type="submit"
            className="rounded bg-[#142B3A] px-3 py-2 text-sm font-medium text-white hover:bg-[#1d3d52]"
          >
            Apply
          </button>
        </div>
      </label>
      <Select
        name={`${paramPrefix}status`}
        label="Status"
        value={filters.status}
        options={[
          ["all", "All"],
          ["hot", "Hot"],
          ["warm", "Warm"],
          ["cold", "Cold"],
          ["dead", "Dead"],
        ]}
      />
      <Select
        name={`${paramPrefix}linkStatus`}
        label="Link status"
        value={filters.linkStatus}
        options={[
          ["active", "Active"],
          ["expired", "Expired"],
          ["all", "All"],
        ]}
      />
      <Select
        name={`${paramPrefix}activity`}
        label="Activity"
        value={filters.activity}
        options={[
          ["all", "All"],
          ["expiring", "Expiring soon (7d)"],
          ["never_opened", "Never opened"],
          ["forwarding", "Forwarding suspected"],
          ["gone_cold", "Gone cold (14d)"],
        ]}
      />
      <Select
        name={`${paramPrefix}sort`}
        label="Sort"
        value={filters.sort}
        options={[
          ["last_opened", "Latest opened"],
          ["client_asc", "Client A-Z"],
          ["client_desc", "Client Z-A"],
          ["value_asc", "Value low-high"],
          ["value_desc", "Value high-low"],
          ["interest_desc", "Interest high-low"],
          ["interest_asc", "Interest low-high"],
        ]}
      />
      <div className="flex items-end justify-end">
        <Link
          href={resetHref}
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Reset
        </Link>
      </div>
    </form>
  );
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <select
        aria-label={label}
        name={name}
        defaultValue={value}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950"
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

function PageLink({
  filters,
  page,
  disabled,
  basePath,
  paramPrefix,
  children,
}: {
  filters: QuoteListFilters;
  page: number;
  disabled: boolean;
  basePath: string;
  paramPrefix: string;
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  if (disabled)
    return (
      <span className="rounded border border-gray-200 px-3 py-1.5 text-gray-400">
        {children}
      </span>
    );

  const params = new URLSearchParams(searchParams.toString());
  if (filters.search) params.set(`${paramPrefix}search`, filters.search);
  else params.delete(`${paramPrefix}search`);
  params.set(`${paramPrefix}status`, filters.status);
  params.set(`${paramPrefix}linkStatus`, filters.linkStatus);
  params.set(`${paramPrefix}sort`, filters.sort);
  params.set(`${paramPrefix}size`, String(filters.size));
  params.set(`${paramPrefix}page`, String(page));
  if (filters.activity !== "all")
    params.set(`${paramPrefix}activity`, filters.activity);
  else params.delete(`${paramPrefix}activity`);

  return (
    <Link
      href={`${basePath}?${params}`}
      className="rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
    >
      {children}
    </Link>
  );
}

function PageSizeSelect({
  filters,
  basePath,
  paramPrefix,
}: {
  filters: QuoteListFilters;
  basePath: string;
  paramPrefix: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(size: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(`${paramPrefix}size`, size);
    params.set(`${paramPrefix}page`, "1");
    router.push(`${basePath}?${params}`);
  }

  return (
    <label className="flex items-center gap-2 text-sm text-gray-600">
      <span className="whitespace-nowrap">Page size</span>
      <select
        value={String(filters.size)}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-950"
      >
        {(["5", "10", "20", "50"] as const).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
