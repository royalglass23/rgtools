'use client'

import { Fragment, useState } from 'react'
import { PaginationBar } from '@/components/pagination/PaginationBar'

import { PageTimeModal } from './PageTimeModal'
import { formatDateTime, formatDuration, maskIp } from './presentation'
import type { DeviceSession, EmailGroup } from './viewer-analytics'

type Props =
  | { gated: false; devices: DeviceSession[] }
  | { gated: true; emails: EmailGroup[] }

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50]

export function ViewerAnalyticsTable(props: Props) {
  const [active, setActive] = useState<DeviceSession | null>(null)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0])
  const [page, setPage] = useState(1)

  const total = props.gated ? props.emails.length : props.devices.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * pageSize
  const end = start + pageSize

  return (
    <div className="space-y-3">
      {props.gated ? (
        <GatedEmailTable emails={props.emails.slice(start, end)} onOpen={setActive} />
      ) : (
        <DeviceTable devices={props.devices.slice(start, end)} onOpen={setActive} />
      )}

      {total > 0 && (
        <PaginationControls
          total={total}
          pageSize={pageSize}
          page={currentPage}
          pageCount={pageCount}
          itemLabel={props.gated ? 'email groups' : 'devices'}
          onPageSize={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
          onNext={() => setPage((prev) => Math.min(pageCount, prev + 1))}
        />
      )}

      {active && <PageTimeModal device={active} onClose={() => setActive(null)} />}
    </div>
  )
}

function PaginationControls({
  total,
  pageSize,
  page,
  pageCount,
  itemLabel,
  onPageSize,
  onPrev,
  onNext,
}: {
  total: number
  pageSize: number
  page: number
  pageCount: number
  itemLabel: string
  onPageSize: (size: number) => void
  onPrev: () => void
  onNext: () => void
}) {
  const [draftSize, setDraftSize] = useState(pageSize)
  return (
    <PaginationBar
      count={`${total} ${itemLabel}`}
      page={page}
      pageCount={pageCount}
      label="Viewer analytics pages"
      previous={<button type="button" onClick={onPrev} disabled={page <= 1}>Previous</button>}
      next={<button type="button" onClick={onNext} disabled={page >= pageCount}>Next</button>}
      pageSize={<form onSubmit={(event) => {
        event.preventDefault()
        onPageSize(draftSize)
      }}>
        <label htmlFor="viewer-page-size">Page size</label>
        <select id="viewer-page-size" value={draftSize} onChange={(event) => setDraftSize(Number(event.target.value))}>
          {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <button type="submit">Apply</button>
      </form>}
    />
  )
}

function DeviceTable({
  devices,
  onOpen,
}: {
  devices: DeviceSession[]
  onOpen: (device: DeviceSession) => void
}) {
  return (
    <div className="overflow-hidden rounded border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3">IP</th>
            <th className="px-4 py-3">Device</th>
            <th className="px-4 py-3">Times opened</th>
            <th className="px-4 py-3">Time spent</th>
            <th className="px-4 py-3">Pages seen</th>
            <th className="px-4 py-3">CTA</th>
            <th className="px-4 py-3">Last seen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {devices.map((device) => (
            <tr
              key={device.sessionId}
              role="button"
              aria-label={`View per-page breakdown for ${maskIp(device.ip)}`}
              tabIndex={0}
              onClick={() => onOpen(device)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpen(device)
                }
              }}
              className="cursor-pointer hover:bg-gray-50"
            >
              <td className="px-4 py-3 text-gray-700">{maskIp(device.ip)}</td>
              <td className="px-4 py-3 text-gray-700">{device.deviceType ?? '-'}</td>
              <td className="px-4 py-3 text-gray-700">{device.opens}</td>
              <td className="px-4 py-3 text-gray-700">{formatDuration(device.totalTimeMs)}</td>
              <td className="px-4 py-3 text-gray-700">{device.pagesSeen || '-'}</td>
              <td className="px-4 py-3 text-gray-700">{device.hasCta ? 'Yes' : 'No'}</td>
              <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDateTime(device.lastSeenAt)}</td>
            </tr>
          ))}
          {devices.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No viewer sessions yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function GatedEmailTable({
  emails,
  onOpen,
}: {
  emails: EmailGroup[]
  onOpen: (device: DeviceSession) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(email: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return next
    })
  }

  return (
    <div className="overflow-hidden rounded border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Devices</th>
            <th className="px-4 py-3">Times opened</th>
            <th className="px-4 py-3">Time spent</th>
            <th className="px-4 py-3">Pages seen</th>
            <th className="px-4 py-3">CTA</th>
            <th className="px-4 py-3">Last seen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {emails.map((group) => (
            <Fragment key={group.email}>
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700">
                  <button
                    type="button"
                    aria-label={`Expand ${group.email}`}
                    onClick={() => toggle(group.email)}
                    className="flex items-center gap-2 text-left"
                  >
                    <span aria-hidden>{expanded.has(group.email) ? '▾' : '▸'}</span>
                    <span>
                      <span className="font-medium text-gray-950">{group.email}</span>
                      {group.name && <span className="block text-xs text-gray-500">{group.name}</span>}
                    </span>
                  </button>
                  {group.forwardingSuspected && (
                    <span className="ml-6 mt-1 inline-flex rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                      Forwarding
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700">{group.devices.length}</td>
                <td className="px-4 py-3 text-gray-700">{group.opens}</td>
                <td className="px-4 py-3 text-gray-700">{formatDuration(group.totalTimeMs)}</td>
                <td className="px-4 py-3 text-gray-700">{group.pagesSeen || '-'}</td>
                <td className="px-4 py-3 text-gray-700">{group.hasCta ? 'Yes' : 'No'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDateTime(group.lastSeenAt)}</td>
              </tr>
              {expanded.has(group.email) &&
                group.devices.map((device) => (
                  <tr
                    key={device.sessionId}
                    role="button"
                    aria-label={`View per-page breakdown for ${maskIp(device.ip)}`}
                    tabIndex={0}
                    onClick={() => onOpen(device)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onOpen(device)
                      }
                    }}
                    className="cursor-pointer bg-gray-50/50 hover:bg-gray-100"
                  >
                    <td className="px-4 py-2 pl-12 text-gray-600">{maskIp(device.ip)}</td>
                    <td className="px-4 py-2 text-gray-600">{device.deviceType ?? '-'}</td>
                    <td className="px-4 py-2 text-gray-600">{device.opens}</td>
                    <td className="px-4 py-2 text-gray-600">{formatDuration(device.totalTimeMs)}</td>
                    <td className="px-4 py-2 text-gray-600">{device.pagesSeen || '-'}</td>
                    <td className="px-4 py-2 text-gray-600">{device.hasCta ? 'Yes' : 'No'}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-600">{formatDateTime(device.lastSeenAt)}</td>
                  </tr>
                ))}
            </Fragment>
          ))}
          {emails.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No gated viewers yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
