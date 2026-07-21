import type { ExistingItemRolloutStatus } from './existing-item-rollout'

type ExistingItemRolloutMetric = {
  action: 'work_order.existing_item_rollout_status'
  rolloutRunId: string
  correlationId: string
  state: ExistingItemRolloutStatus['state']
  counts: Pick<
    ExistingItemRolloutStatus,
    'total' | 'queued' | 'processing' | 'drafted' | 'needsReview' | 'unmapped' | 'failed' | 'retried'
  >
  durationMs: number
  safeFailureClass: string | null
}

export function emitExistingItemRolloutMetric(
  status: ExistingItemRolloutStatus,
  log: (metric: ExistingItemRolloutMetric) => void = (metric) => console.info(JSON.stringify(metric)),
) {
  log({
    action: 'work_order.existing_item_rollout_status',
    rolloutRunId: status.id,
    correlationId: status.correlationId,
    state: status.state,
    counts: {
      total: status.total,
      queued: status.queued,
      processing: status.processing,
      drafted: status.drafted,
      needsReview: status.needsReview,
      unmapped: status.unmapped,
      failed: status.failed,
      retried: status.retried,
    },
    durationMs: status.durationMs,
    safeFailureClass: status.safeFailureClass,
  })
}
