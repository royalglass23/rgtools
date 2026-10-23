import { createServiceM8RequestFromEnv, type ServiceM8FetchRequest } from '@/lib/servicem8/client'

const MAX_PAGES = 100
const CACHE_MS = 5 * 60 * 1000

type JobRecord = {
  uuid?: string | null
  active?: number | string | null
  generated_job_id?: string | null
  status?: string | null
  company_uuid?: string | null
  job_address?: string | null
  job_description?: string | null
  total_invoice_amount?: string | null
  edit_date?: string | null
}

type CompanyRecord = { uuid?: string | null; name?: string | null }
type StaffRecord = { uuid?: string | null; first?: string | null; last?: string | null }
type MaterialRecord = { job_uuid?: string | null; active?: number | string | null; price?: string | number | null; quantity?: string | number | null }
type ActivityRecord = {
  uuid?: string | null
  job_uuid?: string | null
  staff_uuid?: string | null
  start_date?: string | null
  edit_date?: string | null
  active?: number | string | null
  activity_was_scheduled?: string | number | boolean | null
  activity_was_recorded?: string | number | boolean | null
}

export type JobProgressRow = {
  uuid: string
  jobNumber: string | null
  duplicateNumber: boolean
  active: boolean
  status: string
  customer: string | null
  address: string | null
  recordedAmount: number | null
  amountSource: 'line items' | 'invoice' | null
  lastUpdate: string | null
  description: string | null
  nextBooking: { start: string; staff: string | null } | null
  reviewCandidate: boolean
}

export type JobProgressSnapshot = {
  rows: JobProgressRow[]
  asOf: string
  unnumberedJobs: number
  duplicateNumberJobs: number
  missingCustomer: number
  missingAddress: number
  missingValue: number
}

let cached: { until: number; value: JobProgressSnapshot } | null = null
let pending: Promise<JobProgressSnapshot> | null = null

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function validLocalStamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
}

function isTrue(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function isActive(value: unknown): boolean {
  return value === 1 || value === '1'
}

function nzLocalStamp(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

export async function readAllServiceM8Rows<T>(
  path: string,
  request: ServiceM8FetchRequest,
): Promise<T[]> {
  const rows: T[] = []
  const seenCursors = new Set<string>()
  let cursor: string | null = '-1'
  while (cursor) {
    if (seenCursors.size >= MAX_PAGES || seenCursors.has(cursor)) {
      throw new Error(`ServiceM8 ${path} pagination did not complete`)
    }
    seenCursors.add(cursor)
    const separator = path.includes('?') ? '&' : '?'
    const response = await request(`${path}${separator}cursor=${encodeURIComponent(cursor)}`)
    if (!response.ok) throw new Error(`ServiceM8 ${path} returned HTTP ${response.status}`)
    const page = await response.json()
    if (!Array.isArray(page) || page.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error(`ServiceM8 ${path} returned invalid data`)
    }
    rows.push(...page as T[])
    cursor = response.headers?.get('x-next-cursor')?.trim() || null
  }
  return rows
}

function amount(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export async function buildJobProgressSnapshot(
  request: ServiceM8FetchRequest,
  now = new Date(),
): Promise<JobProgressSnapshot> {
  const localNow = nzLocalStamp(now)
  const activityFilter = `start_date gt '${localNow.slice(0, 10)} 00:00:00' and active eq 1`
  // Exhaust the filtered schedule before a row can say "No Upcoming Booking".
  const [jobs, companies, activities, staff, materials] = await Promise.all([
    readAllServiceM8Rows<JobRecord>('/job.json', request),
    readAllServiceM8Rows<CompanyRecord>('/company.json', request),
    readAllServiceM8Rows<ActivityRecord>(`/jobactivity.json?$filter=${encodeURIComponent(activityFilter)}`, request),
    readAllServiceM8Rows<StaffRecord>('/staff.json', request),
    readAllServiceM8Rows<MaterialRecord>(`/jobmaterial.json?$filter=${encodeURIComponent('active eq 1')}`, request),
  ])

  const companyById = new Map(companies.map((row) => [clean(row.uuid), clean(row.name)]))
  const staffById = new Map(staff.map((row) => [clean(row.uuid), [clean(row.first), clean(row.last)].filter(Boolean).join(' ') || null]))
  const bookingByJob = new Map<string, { start: string; staff: string | null }>()
  const materialTotals = new Map<string, number>()
  for (const material of materials) {
    const id = clean(material.job_uuid)
    const price = Number(material.price)
    const quantity = Number(material.quantity)
    if (!id || !isActive(material.active) || !Number.isFinite(price) || !Number.isFinite(quantity)) continue
    materialTotals.set(id, (materialTotals.get(id) ?? 0) + price * quantity)
  }

  for (const activity of activities) {
    const jobUuid = clean(activity.job_uuid)
    const start = activity.start_date
    if (!jobUuid || !validLocalStamp(start) || start <= localNow || !isActive(activity.active) ||
      !isTrue(activity.activity_was_scheduled) || isTrue(activity.activity_was_recorded)) continue
    const previous = bookingByJob.get(jobUuid)
    if (!previous || start < previous.start) {
      bookingByJob.set(jobUuid, { start, staff: staffById.get(clean(activity.staff_uuid)) ?? null })
    }
  }

  const seenIds = new Set<string>()
  const rows: JobProgressRow[] = jobs.map((job) => {
    const uuid = clean(job.uuid)
    if (!uuid || seenIds.has(uuid)) throw new Error('ServiceM8 jobs have a missing or duplicate UUID')
    seenIds.add(uuid)
    const jobNumber = clean(job.generated_job_id)
    const status = clean(job.status) ?? 'Status unavailable'
    const nextBooking = bookingByJob.get(uuid) ?? null
    const active = isActive(job.active)
    const lineItemSubtotal = materialTotals.get(uuid) ?? 0
    const invoiceAmount = amount(job.total_invoice_amount)
    return {
      uuid,
      jobNumber,
      duplicateNumber: false,
      active,
      status,
      customer: companyById.get(clean(job.company_uuid)) ?? null,
      address: clean(job.job_address),
      recordedAmount: lineItemSubtotal > 0 ? Math.round(lineItemSubtotal * 1.15 * 100) / 100 : invoiceAmount,
      amountSource: lineItemSubtotal > 0 ? 'line items' : invoiceAmount === null ? null : 'invoice',
      lastUpdate: validLocalStamp(job.edit_date) ? job.edit_date : null,
      description: clean(job.job_description),
      nextBooking,
      reviewCandidate: active && (status === 'Quote' || status === 'Work Order') && !nextBooking,
    }
  })
  const numberCounts = new Map<string, number>()
  for (const row of rows) if (row.jobNumber) numberCounts.set(row.jobNumber, (numberCounts.get(row.jobNumber) ?? 0) + 1)
  for (const row of rows) row.duplicateNumber = Boolean(row.jobNumber && (numberCounts.get(row.jobNumber) ?? 0) > 1)
  rows.sort((a, b) => (b.jobNumber ?? '').localeCompare(a.jobNumber ?? '', 'en', { numeric: true }))
  return {
    rows,
    asOf: now.toISOString(),
    unnumberedJobs: rows.filter((row) => !row.jobNumber).length,
    duplicateNumberJobs: rows.filter((row) => row.duplicateNumber).length,
    missingCustomer: rows.filter((row) => !row.customer).length,
    missingAddress: rows.filter((row) => !row.address).length,
    missingValue: rows.filter((row) => row.recordedAmount === null).length,
  }
}

export async function getJobProgressSnapshot(): Promise<JobProgressSnapshot> {
  if (cached && cached.until > Date.now()) return cached.value
  if (!pending) {
    pending = buildJobProgressSnapshot(createServiceM8RequestFromEnv())
      .then((value) => { cached = { until: Date.now() + CACHE_MS, value }; return value })
      .finally(() => { pending = null })
  }
  return pending
}
