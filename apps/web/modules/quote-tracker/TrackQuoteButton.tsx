'use client'

import { useRef, useState } from 'react'
import { DismissibleNotice } from '@/modules/ui/DismissibleNotice'

import { CopyLinkButton } from './CopyLinkButton'
import { formatRelative } from './presentation'
import type { TrackQuoteActionResult } from './actions'

type SuccessResult = Extract<TrackQuoteActionResult, { ok: true }>

export function TrackQuoteButton({
  action,
}: {
  action: (jobNumber: string) => Promise<TrackQuoteActionResult>
}) {
  const [open, setOpen] = useState(false)
  const [jobNumber, setJobNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ message: string; link?: string; expiresAt?: Date } | null>(null)
  const [result, setResult] = useState<SuccessResult | null>(null)
  const requestIdRef = useRef(0)

  function reset() {
    requestIdRef.current++
    setJobNumber('')
    setLoading(false)
    setError(null)
    setResult(null)
  }

  function close() {
    setOpen(false)
    reset()
  }

  async function submit() {
    if (loading) return
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await action(jobNumber)
      if (requestId !== requestIdRef.current) return
      if (res.ok) {
        setResult(res)
      } else {
        setError({ message: res.message, link: res.link, expiresAt: res.expiresAt })
      }
    } catch {
      if (requestId !== requestIdRef.current) return
      setError({ message: 'Something went wrong. Please try again.' })
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-[#142B3A] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1d3d52]"
      >
        Track Quote
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Track a quote"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close()
          }}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            {result ? (
              <div className="space-y-3">
                <p className="text-lg font-semibold text-green-700">Quote found</p>
                <p className="font-medium text-gray-950">{result.clientName}</p>
                {result.jobAddress && <p className="text-sm text-gray-600">{result.jobAddress}</p>}
                <LinkBlock link={result.link} expiresAt={result.expiresAt} />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded bg-[#142B3A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d3d52]"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void submit()
                }}
                className="space-y-3"
              >
                <h2 className="text-lg font-semibold text-gray-950">Track a quote</h2>
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Job ID</span>
                  <input
                    autoFocus
                    name="jobNumber"
                    value={jobNumber}
                    onChange={(event) => setJobNumber(event.target.value)}
                    disabled={loading}
                    placeholder="e.g. R260210"
                    className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950"
                  />
                </label>
                <p className="text-xs text-gray-500">Make sure the quote PDF is generated in ServiceM8 first.</p>
                {error && (
                  <DismissibleNotice tone="error" noticeKey={error.message}>
                    <div className="space-y-2">
                      <p className="font-medium">{error.message}</p>
                    {error.link && <LinkBlock link={error.link} expiresAt={error.expiresAt} />}
                    </div>
                  </DismissibleNotice>
                )}
                {loading && <p className="text-sm text-gray-600">Fetching quote from ServiceM8…</p>}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={loading}
                    className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded bg-[#142B3A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d3d52] disabled:opacity-60"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function LinkBlock({ link, expiresAt }: { link: string; expiresAt?: Date }) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-3">
      <p className="break-all text-sm text-gray-800">{link}</p>
      <div className="mt-2 flex items-center justify-between">
        {expiresAt ? (
          <span className="text-xs text-gray-500">Expires {formatRelative(expiresAt)}</span>
        ) : (
          <span />
        )}
        <CopyLinkButton value={link} />
      </div>
    </div>
  )
}
