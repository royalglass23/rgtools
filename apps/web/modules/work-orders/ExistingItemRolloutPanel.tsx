'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'

import type { ExistingItemRolloutStatus } from './existing-item-rollout'

export function ExistingItemRolloutPanel({
  initialStatus,
  startAction,
  resumeAction,
  statusAction,
  canManage = true,
}: {
  initialStatus: ExistingItemRolloutStatus | null
  startAction: (
    previousStatus: ExistingItemRolloutStatus | null,
    formData: FormData,
  ) => Promise<ExistingItemRolloutStatus>
  resumeAction: (runId: string) => Promise<ExistingItemRolloutStatus>
  statusAction: (runId: string) => Promise<ExistingItemRolloutStatus>
  canManage?: boolean
}) {
  const [status, setStatus] = useState<ExistingItemRolloutStatus | null>(initialStatus)
  const [, startFormAction] = useActionState(
    async (previousStatus: ExistingItemRolloutStatus | null, formData: FormData) => {
      const nextStatus = await startAction(previousStatus, formData)
      setStatus(nextStatus)
      return nextStatus
    },
    initialStatus,
  )
  const [, resumeFormAction] = useActionState(
    async (_previousStatus: ExistingItemRolloutStatus | null, formData: FormData) => {
      const nextStatus = await resumeAction(String(formData.get('runId') ?? ''))
      setStatus(nextStatus)
      return nextStatus
    },
    null,
  )

  useEffect(() => {
    if (status?.state !== 'running') return
    let cancelled = false
    let requestPending = false
    const timer = setInterval(async () => {
      if (requestPending) return
      requestPending = true
      try {
        const nextStatus = await statusAction(status.id)
        if (!cancelled) setStatus(nextStatus)
      } finally {
        requestPending = false
      }
    }, 2_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [status?.id, status?.state, statusAction])

  return (
    <section
      aria-labelledby="existing-item-rollout-heading"
      aria-readonly={canManage ? undefined : true}
      className="rounded border border-gray-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="existing-item-rollout-heading" className="font-semibold text-gray-950">
            Existing-item enrichment
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Start the supervised one-time Production Specification draft rollout.
          </p>
        </div>
        {canManage && !status && (
          <form action={startFormAction}>
            <RolloutActionButton kind="start" />
          </form>
        )}
        {canManage && status?.state === 'failed' && (
          <form action={resumeFormAction}>
            <input type="hidden" name="runId" value={status.id} />
            <RolloutActionButton kind="resume" />
          </form>
        )}
      </div>

      <div aria-live="polite" className="mt-3 text-sm text-gray-700">
        {status ? `Rollout ${status.state}.` : 'No rollout has been started.'}
      </div>

      {status && (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Count label="Total" name="total" value={status.total} />
          <Count label="Queued" name="queued" value={status.queued} />
          <Count label="Processing" name="processing" value={status.processing} />
          <Count label="Drafted" name="drafted" value={status.drafted} />
          <Count label="Needs Review" name="needs-review" value={status.needsReview} />
          <Count label="Unmapped" name="unmapped" value={status.unmapped} />
          <Count label="Failed" name="failed" value={status.failed} />
          <Count label="Retried" name="retried" value={status.retried} />
        </dl>
      )}
    </section>
  )
}

function RolloutActionButton({ kind }: { kind: 'start' | 'resume' }) {
  const { pending } = useFormStatus()
  const pendingLabel = kind === 'start'
    ? 'Starting existing-item enrichment…'
    : 'Resuming failed enrichment…'
  const idleLabel = kind === 'start'
    ? 'Start existing-item enrichment'
    : 'Resume failed enrichment'
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending
        ? <span role="status">{pendingLabel}</span>
        : idleLabel}
    </button>
  )
}

function Count({ label, name, value }: { label: string; name: string; value: number }) {
  return (
    <div className="rounded bg-gray-50 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-600">{label}</dt>
      <dd data-count={name} className="mt-1 text-lg font-semibold text-gray-950">{value}</dd>
    </div>
  )
}
