import type { WorkOrderLevel } from './domain'

export type WorkOrderOptionFilter = string
export type WorkOrderSortDirection = 'asc' | 'desc'
export type WorkOrderSortKey =
  | 'client'
  | 'job_number'
  | 'job_address'
  | 'lead_score'
  | 'importance'
  | 'risk'
  | 'installer'
  | 'stage'
  | 'hardware'
  | 'maintenance_program'
  | 'install_date'
  | 'date_completed'
  | 'servicem8_status'
  | 'job_description'
export type WorkOrderSort = `${WorkOrderSortKey}_${WorkOrderSortDirection}`
export type WorkOrderPageSize = 5 | 10 | 20 | 50
export type WorkOrderCurrentFilter = 'current' | 'non_current' | 'all'
export type WorkOrderMaintenanceProgramFilter = 'yes' | 'no' | 'all'

export type WorkOrderListFilters = {
  q: string
  current: WorkOrderCurrentFilter
  risk: WorkOrderLevel | 'all'
  importance: WorkOrderLevel | 'all'
  stage: WorkOrderOptionFilter
  hardware: WorkOrderOptionFilter
  maintenanceProgram: WorkOrderMaintenanceProgramFilter
  showRemovedItems: boolean
  sort: WorkOrderSort
  page: number
  size: WorkOrderPageSize
}

export type ParseWorkOrderListFiltersOptions = {
  /** Prefix applied to every param name when embedded on the shared dashboard URL. */
  prefix?: string
  /** Admin-set default values used when a param is absent from the URL. */
  defaults?: Partial<Record<'current' | 'risk' | 'importance' | 'sort' | 'size', string>>
}

const DEFAULT_FILTERS: WorkOrderListFilters = {
  q: '',
  current: 'current',
  risk: 'all',
  importance: 'all',
  stage: 'all',
  hardware: 'all',
  maintenanceProgram: 'all',
  showRemovedItems: false,
  sort: 'lead_score_desc',
  page: 1,
  size: 5,
}

const LEVELS = new Set(['low', 'medium', 'high'])
const SORT_KEYS: WorkOrderSortKey[] = [
  'client',
  'job_number',
  'job_address',
  'lead_score',
  'importance',
  'risk',
  'installer',
  'stage',
  'hardware',
  'maintenance_program',
  'install_date',
  'date_completed',
  'servicem8_status',
  'job_description',
]
const SORTS = new Set<WorkOrderSort>(SORT_KEYS.flatMap((key) => [`${key}_asc`, `${key}_desc`] as WorkOrderSort[]))
const LEGACY_SORTS: Record<string, WorkOrderSort> = {
  lead_score: 'lead_score_desc',
  importance: 'importance_desc',
  risk: 'risk_desc',
  install_date: 'install_date_asc',
  job_number: 'job_number_asc',
}
const SIZES = new Set<WorkOrderPageSize>([5, 10, 20, 50])

export function parseWorkOrderListFilters(
  searchParams: Record<string, string | string[] | undefined>,
  options: ParseWorkOrderListFiltersOptions = {},
): WorkOrderListFilters {
  const { prefix = '', defaults = {} } = options
  const pick = (name: 'current' | 'risk' | 'importance' | 'sort' | 'size') =>
    stringValue(searchParams[`${prefix}${name}`]) ?? defaults[name]

  const q = stringValue(searchParams[`${prefix}q`])?.trim() ?? DEFAULT_FILTERS.q
  const current = currentValue(pick('current'))
  const risk = levelValue(pick('risk'))
  const importance = levelValue(pick('importance'))
  const stage = optionValue(searchParams[`${prefix}stage`])
  const hardware = optionValue(searchParams[`${prefix}hardware`])
  const maintenanceProgram = maintenanceProgramValue(searchParams[`${prefix}maintenanceProgram`])
  const showRemovedItems = stringValue(searchParams[`${prefix}showRemovedItems`]) === '1'
  const sortCandidate = pick('sort')
  const page = Number(stringValue(searchParams[`${prefix}page`]) ?? DEFAULT_FILTERS.page)
  const size = Number(pick('size') ?? DEFAULT_FILTERS.size)

  return {
    q,
    current,
    risk,
    importance,
    stage,
    hardware,
    maintenanceProgram,
    showRemovedItems,
    sort: sortValue(sortCandidate),
    page: Number.isInteger(page) && page > 0 ? page : DEFAULT_FILTERS.page,
    size: SIZES.has(size as WorkOrderPageSize) ? size as WorkOrderPageSize : DEFAULT_FILTERS.size,
  }
}

function currentValue(value: string | string[] | undefined): WorkOrderCurrentFilter {
  const candidate = stringValue(value)
  return candidate === 'non_current' || candidate === 'all' ? candidate : 'current'
}

function levelValue(value: string | string[] | undefined): WorkOrderLevel | 'all' {
  const candidate = stringValue(value)
  return candidate && LEVELS.has(candidate) ? candidate as WorkOrderLevel : 'all'
}

function optionValue(value: string | string[] | undefined): string {
  const candidate = stringValue(value)?.trim()
  return candidate || 'all'
}

function maintenanceProgramValue(value: string | string[] | undefined): WorkOrderMaintenanceProgramFilter {
  const candidate = stringValue(value)
  return candidate === 'yes' || candidate === 'no' ? candidate : 'all'
}

function sortValue(value: string | string[] | undefined): WorkOrderSort {
  const candidate = stringValue(value)
  if (!candidate) return DEFAULT_FILTERS.sort
  if (candidate in LEGACY_SORTS) return LEGACY_SORTS[candidate]
  return SORTS.has(candidate as WorkOrderSort) ? candidate as WorkOrderSort : DEFAULT_FILTERS.sort
}

function stringValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
