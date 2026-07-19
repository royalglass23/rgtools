import {
  createServiceM8RequestFromEnv,
  type ServiceM8FetchRequest,
} from '@/lib/servicem8/client'

const ACTIVE_QUOTE_FILTER = "active eq 1 and status eq 'Quote'"
const ACTIVE_FILTER = 'active eq 1'
const SERVICEM8_MAX_PAGES = 25

type ServiceM8QuoteJob = {
  uuid?: string | null
  active?: number | string | boolean | null
  status?: string | null
  company_uuid?: string | null
  generated_job_id?: string | null
  job_address?: string | null
  edit_date?: string | null
}

type ServiceM8Company = {
  uuid?: string | null
  name?: string | null
}

type ServiceM8JobMaterial = {
  active?: number | string | boolean | null
  job_uuid?: string | null
  quantity?: number | string | null
  price?: number | string | null
}

export type QuoteMovementSnapshotInput = {
  servicem8JobUuid: string
  servicem8CompanyUuid: string | null
  servicem8Status: string
  jobNumber: string | null
  customerName: string
  jobAddress: string | null
  quoteValueExcludingGst: string | null
  sourceUpdatedAt: Date | null
  lastServiceM8SyncedAt: Date
}

export type QuoteMovementRefreshContext = {
  actorId: string | null
  refreshedAt: Date
}

export interface QuoteMovementSnapshotRepository {
  replaceActiveSnapshot(
    records: QuoteMovementSnapshotInput[],
    context: QuoteMovementRefreshContext,
  ): Promise<void>
  recordFailure(
    message: string,
    context: QuoteMovementRefreshContext,
  ): Promise<void>
}

export async function syncQuoteMovementFromServiceM8({
  request = createServiceM8RequestFromEnv(),
  repository,
  actorId = null,
  now = () => new Date(),
}: {
  request?: ServiceM8FetchRequest
  repository: QuoteMovementSnapshotRepository
  actorId?: string | null
  now?: () => Date
}) {
  const refreshedAt = now()

  try {
    const [jobs, companies, materials] = await Promise.all([
      readServiceM8Array<ServiceM8QuoteJob>(
        request,
        `/job.json${odataFilter(ACTIVE_QUOTE_FILTER)}`,
        'job',
      ),
      readServiceM8Array<ServiceM8Company>(request, '/company.json', 'company'),
      readServiceM8Array<ServiceM8JobMaterial>(
        request,
        `/jobmaterial.json${odataFilter(ACTIVE_FILTER)}`,
        'job material',
      ),
    ])
    const records = buildActiveQuoteSnapshot(jobs, companies, materials, refreshedAt)

    await repository.replaceActiveSnapshot(records, { actorId, refreshedAt })
    return { synced: records.length, refreshedAt }
  } catch (error) {
    const safeMessage = safeQuoteMovementRefreshError(error)
    try {
      await repository.recordFailure(safeMessage, { actorId, refreshedAt })
    } catch {
      // The original refresh failure is the useful operator signal.
    }
    throw new Error(safeMessage)
  }
}

export function safeQuoteMovementRefreshError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message.startsWith('ServiceM8 Quote Movement')) return message
  return 'Quote Movement could not refresh from ServiceM8. The previous cached list was kept.'
}

function buildActiveQuoteSnapshot(
  jobs: ServiceM8QuoteJob[],
  companies: ServiceM8Company[],
  materials: ServiceM8JobMaterial[],
  refreshedAt: Date,
): QuoteMovementSnapshotInput[] {
  const companiesByUuid = new Map(companies.flatMap((company) => {
    const uuid = clean(company.uuid)
    return uuid ? [[uuid, clean(company.name)] as const] : []
  }))
  const valuesByJobUuid = quoteValuesByJobUuid(materials)
  const recordsByJobUuid = new Map<string, QuoteMovementSnapshotInput>()

  jobs.forEach((job, index) => {
    if (!isActive(job.active) || normalizeStatus(job.status) !== 'quote') return

    const servicem8JobUuid = clean(job.uuid)
    if (!servicem8JobUuid) {
      throw new Error(`ServiceM8 Quote Movement job at row ${index + 1} is invalid: job UUID is required.`)
    }
    const servicem8CompanyUuid = clean(job.company_uuid)
    const jobNumber = clean(job.generated_job_id)

    recordsByJobUuid.set(servicem8JobUuid, {
      servicem8JobUuid,
      servicem8CompanyUuid,
      servicem8Status: 'Quote',
      jobNumber,
      customerName: (
        (servicem8CompanyUuid ? companiesByUuid.get(servicem8CompanyUuid) : null) ??
        jobNumber ??
        'Unknown customer'
      ),
      jobAddress: clean(job.job_address),
      quoteValueExcludingGst: valuesByJobUuid.get(servicem8JobUuid) ?? null,
      sourceUpdatedAt: parseDate(job.edit_date),
      lastServiceM8SyncedAt: refreshedAt,
    })
  })

  return Array.from(recordsByJobUuid.values())
}

function quoteValuesByJobUuid(materials: ServiceM8JobMaterial[]) {
  const totals = new Map<string, number>()
  const jobsWithActiveLines = new Set<string>()

  for (const material of materials) {
    if (!isActive(material.active)) continue
    const jobUuid = clean(material.job_uuid)
    if (!jobUuid) continue

    jobsWithActiveLines.add(jobUuid)
    const quantity = finiteNumber(material.quantity)
    const price = finiteNumber(material.price)
    totals.set(jobUuid, (totals.get(jobUuid) ?? 0) + quantity * price)
  }

  return new Map(Array.from(jobsWithActiveLines, (jobUuid) => [
    jobUuid,
    (totals.get(jobUuid) ?? 0).toFixed(2),
  ]))
}

async function readServiceM8Array<T>(
  request: ServiceM8FetchRequest,
  path: string,
  datasetName: string,
) {
  const rows: T[] = []
  const requestedCursors = new Set<string>()
  let cursor: string | null = '-1'

  while (cursor) {
    if (requestedCursors.size >= SERVICEM8_MAX_PAGES) {
      throw new Error(
        `ServiceM8 Quote Movement ${datasetName} pagination exceeded the ${SERVICEM8_MAX_PAGES}-page refresh limit.`,
      )
    }
    if (requestedCursors.has(cursor)) {
      throw new Error(`ServiceM8 Quote Movement ${datasetName} pagination repeated cursor ${cursor}.`)
    }
    requestedCursors.add(cursor)

    const response = await request(serviceM8CursorPath(path, cursor))
    if (!response.ok) {
      throw new Error(`ServiceM8 Quote Movement refresh failed with HTTP ${response.status}.`)
    }
    const pageRows = await response.json()
    if (!Array.isArray(pageRows)) {
      throw new Error(`ServiceM8 Quote Movement ${datasetName} response was invalid.`)
    }
    const invalidRow = pageRows.findIndex((row) => !row || typeof row !== 'object' || Array.isArray(row))
    if (invalidRow >= 0) {
      throw new Error(`ServiceM8 Quote Movement ${datasetName} response contained an invalid row.`)
    }

    rows.push(...pageRows as T[])
    cursor = response.headers?.get('x-next-cursor')?.trim() || null
  }

  return rows
}

function serviceM8CursorPath(path: string, cursor: string) {
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}cursor=${encodeURIComponent(cursor)}`
}

function odataFilter(expression: string) {
  return `?%24filter=${encodeURIComponent(expression)}`
}

function isActive(value: ServiceM8QuoteJob['active'] | ServiceM8JobMaterial['active']) {
  return value === true || value === 1 || value === '1'
}

function normalizeStatus(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, ' ').toLowerCase() ?? ''
}

function clean(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function finiteNumber(value: unknown) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function parseDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
