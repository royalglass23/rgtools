import type { ServiceM8FetchRequest } from '@/lib/servicem8/client'
import { quoteMovementSnapshotRepository } from './repository'
import {
  syncQuoteMovementFromServiceM8,
  type QuoteMovementSnapshotRepository,
} from './sync'

type QuoteMovementRefreshResult = Awaited<ReturnType<typeof syncQuoteMovementFromServiceM8>>

let inFlightRefresh: Promise<QuoteMovementRefreshResult> | null = null

export async function refreshQuoteMovementFromServiceM8({
  actorId,
  request,
  repository = quoteMovementSnapshotRepository,
}: {
  actorId: string | null
  request?: ServiceM8FetchRequest
  repository?: QuoteMovementSnapshotRepository
}) {
  if (inFlightRefresh) return inFlightRefresh

  const refresh = syncQuoteMovementFromServiceM8({
    actorId,
    request,
    repository,
  })
  inFlightRefresh = refresh

  try {
    return await refresh
  } finally {
    if (inFlightRefresh === refresh) inFlightRefresh = null
  }
}
