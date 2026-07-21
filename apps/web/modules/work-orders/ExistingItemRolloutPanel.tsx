'use client'

import { useActionState, useCallback, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { FeedbackState, PrecisionButton } from '@/components/precision-ui/PrecisionUI'
import type { ExistingItemRolloutStatus } from './existing-item-rollout'
import styles from './ExistingItemRolloutPanel.module.css'

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
  const [pollError, setPollError] = useState<string | null>(null)
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
  const statusId = status?.id

  const refreshStatus = useCallback(async () => {
    if (!statusId) return
    try {
      const nextStatus = await statusAction(statusId)
      setStatus(nextStatus)
      setPollError(null)
    } catch {
      setPollError('Rollout status could not be refreshed.')
    }
  }, [statusId, statusAction])

  useEffect(() => {
    if (status?.state !== 'running' || pollError) return
    let cancelled = false
    let requestPending = false
    const timer = setInterval(async () => {
      if (requestPending) return
      requestPending = true
      try {
        const nextStatus = await statusAction(status.id)
        if (!cancelled) {
          setStatus(nextStatus)
          setPollError(null)
        }
      } catch {
        if (!cancelled) setPollError('Rollout status could not be refreshed.')
      } finally {
        requestPending = false
      }
    }, 2_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [pollError, status?.id, status?.state, statusAction])

  return (
    <section
      aria-labelledby="existing-item-rollout-heading"
      aria-readonly={canManage ? undefined : true}
      className={styles.panel}
    >
      <div className={styles.header}>
        <div>
          <h2 id="existing-item-rollout-heading" className={styles.heading}>
            Existing-item enrichment
          </h2>
          <p className={styles.description}>
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

      <div aria-live="polite" className={styles.status}>
        {status ? `Rollout ${status.state}.` : 'No rollout has been started.'}
      </div>

      {pollError && (
        <FeedbackState tone="error">
          <div className={styles.feedbackActions}>
            <p>{pollError}</p>
            <PrecisionButton type="button" tone="secondary" onClick={refreshStatus}>
              Retry status
            </PrecisionButton>
          </div>
        </FeedbackState>
      )}

      {status && (
        <dl className={styles.counts}>
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
    <PrecisionButton
      type="submit"
      disabled={pending}
    >
      {pending
        ? <span role="status">{pendingLabel}</span>
        : idleLabel}
    </PrecisionButton>
  )
}

function Count({ label, name, value }: { label: string; name: string; value: number }) {
  return (
    <div className={styles.count}>
      <dt className={styles.countLabel}>{label}</dt>
      <dd data-count={name} className={styles.countValue}>{value}</dd>
    </div>
  )
}
