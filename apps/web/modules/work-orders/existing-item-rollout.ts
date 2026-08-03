export type ExistingItemRolloutState = 'running' | 'completed' | 'failed'

export type ExistingItemRolloutStatus = {
  id: string
  correlationId: string
  state: ExistingItemRolloutState
  total: number
  queued: number
  processing: number
  drafted: number
  needsReview: number
  unmapped: number
  failed: number
  retried: number
  skippedRemoved: number
  skippedConfirmed: number
  skippedCurrentKey: number
  startedAt: Date
  completedAt: Date | null
  durationMs: number
  safeFailureClass: string | null
}

type ExistingItemRolloutRun = {
  id: string
  correlationId: string
  startedAt: Date
}

type ExistingItemRolloutInitialCounts = Pick<
  ExistingItemRolloutStatus,
  'total' | 'queued' | 'failed' | 'skippedRemoved' | 'skippedConfirmed' | 'skippedCurrentKey'
>

export type ExistingItemRolloutStore = {
  acquireRun(input: {
    actorId: string | null
    correlationId: string
    startedAt: Date
  }): Promise<
    | { kind: 'created'; run: ExistingItemRolloutRun }
    | { kind: 'existing'; status: ExistingItemRolloutStatus }
  >
  queueEligibleItems(runId: string): Promise<ExistingItemRolloutInitialCounts>
  recordInitialCounts(runId: string, counts: ExistingItemRolloutInitialCounts): Promise<void>
}

export type ExistingItemRolloutStatusStore = {
  refreshStatus(runId: string, observedAt: Date): Promise<ExistingItemRolloutStatus>
}

export type ExistingItemRolloutResumeStore = ExistingItemRolloutStatusStore & {
  resumeFailedRun(runId: string, actorId: string | null, resumedAt: Date): Promise<void>
}

export type ExistingItemRolloutLatestStore = {
  getLatestStatus(observedAt: Date): Promise<ExistingItemRolloutStatus | null>
}

export async function startExistingItemRolloutBatch({
  store,
  actorId,
  correlationId,
  now = () => new Date(),
}: {
  store: ExistingItemRolloutStore
  actorId: string | null
  correlationId: string
  now?: () => Date
}): Promise<ExistingItemRolloutStatus> {
  const startedAt = now()
  const acquired = await store.acquireRun({ actorId, correlationId, startedAt })
  if (acquired.kind === 'existing') return acquired.status

  const counts = await store.queueEligibleItems(acquired.run.id)
  await store.recordInitialCounts(acquired.run.id, counts)

  return {
    ...acquired.run,
    state: 'running',
    ...counts,
    processing: 0,
    drafted: 0,
    needsReview: 0,
    unmapped: 0,
    failed: counts.failed,
    retried: 0,
    completedAt: null,
    durationMs: 0,
    safeFailureClass: null,
  }
}

export async function getExistingItemRolloutStatus({
  store,
  runId,
  now = () => new Date(),
}: {
  store: ExistingItemRolloutStatusStore
  runId: string
  now?: () => Date
}) {
  return store.refreshStatus(runId, now())
}

export async function resumeExistingItemRolloutBatch({
  store,
  runId,
  actorId,
  now = () => new Date(),
}: {
  store: ExistingItemRolloutResumeStore
  runId: string
  actorId: string | null
  now?: () => Date
}) {
  const resumedAt = now()
  await store.resumeFailedRun(runId, actorId, resumedAt)
  return store.refreshStatus(runId, resumedAt)
}

export async function getLatestExistingItemRolloutStatus({
  store,
  now = () => new Date(),
}: {
  store: ExistingItemRolloutLatestStore
  now?: () => Date
}) {
  return store.getLatestStatus(now())
}
