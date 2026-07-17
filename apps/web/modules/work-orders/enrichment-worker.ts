import {
  generateWorkOrderProductionSpecificationDraft,
  parseProductionSpecificationEnrichmentOutput,
  type ProductionSpecificationEnrichmentOutput,
} from './production-specification-enrichment'
import {
  loadActiveProductionSpecificationCatalogue,
  type ProductionSpecificationCatalogueLoader,
} from './production-specification-catalogue'
import { INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE } from './production-specifications'
import {
  PRODUCTION_SPECIFICATION_SCHEMA_VERSION,
  type ProductionSpecificationCatalogueOption,
} from './production-specifications'
import { WORK_ORDER_ENRICHMENT_PROMPT_VERSION } from './enrichment-jobs'

export const WORK_ORDER_ENRICHMENT_SAFE_FAILURE = 'Enrichment failed. Retry is available.'
export const WORK_ORDER_ENRICHMENT_SAFE_RETRY = 'Enrichment delayed. Retrying automatically.'
export const WORK_ORDER_ENRICHMENT_VERSION_MISMATCH = 'Enrichment rules changed. Retry to use the current version.'

export type ClaimedWorkOrderEnrichmentJob = {
  id: string
  workOrderItemId: string
  sourceDescription: string
  attemptCount: number
  extractionSchemaVersion: number
  promptVersion: string
}

export type WorkOrderEnrichmentRuntimeStore = {
  claim(limit: number, leaseMs: number): Promise<ClaimedWorkOrderEnrichmentJob[]>
  saveDraft(
    job: ClaimedWorkOrderEnrichmentJob,
    output: ProductionSpecificationEnrichmentOutput,
    modelIdentifier: string,
    catalogue?: readonly ProductionSpecificationCatalogueOption[],
  ): Promise<'saved' | 'skipped_confirmed' | 'skipped_inactive' | 'skipped_staff_edited'>
  markRetry(jobId: string, availableAt: Date, safeError: string): Promise<void>
  markFailed(jobId: string, safeError: string): Promise<void>
}

export type WorkOrderEnrichmentProvider = (
  sourceDescription: string,
) => Promise<ProductionSpecificationEnrichmentOutput>

export async function processWorkOrderEnrichmentBatch({
  store,
  provider,
  loadCatalogue,
  concurrency = 3,
  timeoutMs = 30_000,
  leaseMs = 60_000,
  maxAttempts = 3,
  now = () => new Date(),
}: {
  store: WorkOrderEnrichmentRuntimeStore
  provider?: WorkOrderEnrichmentProvider
  loadCatalogue?: ProductionSpecificationCatalogueLoader
  concurrency?: number
  timeoutMs?: number
  leaseMs?: number
  maxAttempts?: number
  now?: () => Date
}) {
  const boundedConcurrency = integerBetween(concurrency, 1, 10, 'concurrency')
  const boundedMaxAttempts = integerBetween(maxAttempts, 1, 10, 'maxAttempts')
  assertValidTimeoutMs(timeoutMs)
  const jobs = await store.claim(boundedConcurrency, leaseMs)
  const catalogue = jobs.length === 0
    ? INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE
    : await (loadCatalogue
      ?? (provider ? async () => [...INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE] : loadActiveProductionSpecificationCatalogue))()
  const generateDraft = provider ?? ((sourceDescription: string) => (
    generateWorkOrderProductionSpecificationDraft(
      sourceDescription,
      fetch,
      async () => [...catalogue],
    )
  ))
  const result = {
    claimed: jobs.length,
    drafted: 0,
    retried: 0,
    failed: 0,
    skippedConfirmed: 0,
    skippedInactive: 0,
    skippedStaffEdited: 0,
  }

  await Promise.all(jobs.map(async (job) => {
    if (
      job.extractionSchemaVersion !== PRODUCTION_SPECIFICATION_SCHEMA_VERSION
      || job.promptVersion !== WORK_ORDER_ENRICHMENT_PROMPT_VERSION
    ) {
      await store.markFailed(job.id, WORK_ORDER_ENRICHMENT_VERSION_MISMATCH)
      result.failed += 1
      return
    }
    try {
      const providerOutput = await withTimeout(
        generateDraft(job.sourceDescription),
        timeoutMs,
        'Work Order enrichment timed out.',
      )
      const output = parseProductionSpecificationEnrichmentOutput(
        providerOutput,
        job.sourceDescription,
        catalogue,
      )
      const saved = await store.saveDraft(
        job,
        output,
        process.env.OPENAI_MODEL ?? 'gpt-5.4-mini',
        catalogue,
      )
      if (saved === 'skipped_confirmed') result.skippedConfirmed += 1
      else if (saved === 'skipped_inactive') result.skippedInactive += 1
      else if (saved === 'skipped_staff_edited') result.skippedStaffEdited += 1
      else result.drafted += 1
    } catch {
      if (job.attemptCount >= boundedMaxAttempts) {
        await store.markFailed(job.id, WORK_ORDER_ENRICHMENT_SAFE_FAILURE)
        result.failed += 1
        return
      }
      const availableAt = new Date(now().getTime() + retryDelayMs(job.attemptCount))
      await store.markRetry(job.id, availableAt, WORK_ORDER_ENRICHMENT_SAFE_RETRY)
      result.retried += 1
    }
  }))

  return result
}

function integerBetween(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}.`)
  }
  return value
}

function retryDelayMs(attemptCount: number) {
  return Math.min(60_000 * (2 ** Math.max(0, attemptCount - 1)), 15 * 60_000)
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  assertValidTimeoutMs(timeoutMs)
  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function assertValidTimeoutMs(timeoutMs: number) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new Error('timeoutMs must be between 1 and 120000.')
  }
}
