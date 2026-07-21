export type ServiceM8WorkOrderJob = {
  uuid?: string | null
  active?: number | string | boolean | null
  status?: string | null
  company_uuid?: string | null
  generated_job_id?: string | null
  job_address?: string | null
  job_description?: string | null
  approximate_description?: string | null
  system_name?: string | null
  length?: string | null
  color?: string | null
  items_services?: string | null
  glass_status?: string | null
  design_status?: string | null
  site_condition?: string | null
  remarks?: string | null
  [key: string]: unknown
}

export type ServiceM8JobMaterial = {
  uuid?: string | null
  active?: number | string | boolean | null
  job_uuid?: string | null
  material_uuid?: string | null
  name?: string | null
  quantity?: number | string | null
  price?: number | string | null
  sort_order?: number | string | null
  [key: string]: unknown
}

export type ServiceM8Material = {
  uuid?: string | null
  item_number?: string | null
}

export type WorkOrderItemSyncInput = {
  servicem8ItemUuid: string
  servicem8JobUuid: string
  itemCode: string | null
  quantity: string
  originalDescription: string
  lineTotalExcludingGst: string | null
  sortOrder: number
}

export type WorkOrderItemNormalizationResult = {
  inputs: WorkOrderItemSyncInput[]
  excludedLineCount: number
}

export type WorkOrderSyncInput = {
  servicem8JobUuid: string
  servicem8CompanyUuid: string | null
  servicem8Status: string
  servicem8Active: boolean
  jobNumber: string | null
  jobAddress: string | null
  jobDescription: string | null
  identityKind: 'servicem8_uuid'
  identityValue: string
  approximateDescription: string | null
  systemName: string | null
  length: string | null
  color: string | null
  itemsServices: string | null
  glassStatus: string | null
  designStatus: string | null
  siteCondition: string | null
  remarks: string | null
  rawServiceM8Snapshot: ServiceM8WorkOrderJob
}

export function mapServiceM8JobsToWorkOrderInputs(jobs: ServiceM8WorkOrderJob[]): WorkOrderSyncInput[] {
  return jobs.flatMap((job, index) => {
    if (!isActive(job.active) || normalizeStatus(job.status) !== 'work order') return []

    const input = toWorkOrderSyncInput(job)
    if (!input) {
      throw new Error(`ServiceM8 Work Order at row ${index + 1} is invalid: job UUID is required.`)
    }
    return [input]
  })
}

export function mapServiceM8JobMaterialsToWorkOrderItemInputs(
  jobMaterials: ServiceM8JobMaterial[],
  materials: ServiceM8Material[],
): WorkOrderItemSyncInput[] {
  return normalizeServiceM8JobMaterials(jobMaterials, materials, []).inputs
}

export function normalizeServiceM8JobMaterials(
  jobMaterials: ServiceM8JobMaterial[],
  materials: ServiceM8Material[],
  billingExclusionTerms: string[],
): WorkOrderItemNormalizationResult {
  validateServiceM8JobMaterials(jobMaterials)

  const itemCodesByMaterialUuid = new Map(
    materials.flatMap((material) => {
      const materialUuid = clean(material.uuid)
      if (!materialUuid) return []
      return [[materialUuid, clean(material.item_number)] as const]
    }),
  )

  let excludedLineCount = 0
  const normalizedExclusions = billingExclusionTerms
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean)

  const inputs = jobMaterials.flatMap((jobMaterial, index) => {
    if (!isActive(jobMaterial.active)) return []
    if (isNegativeQuantity(jobMaterial.quantity)) {
      excludedLineCount += 1
      return []
    }

    const servicem8ItemUuid = clean(jobMaterial.uuid)
    const servicem8JobUuid = clean(jobMaterial.job_uuid)
    const quantity = decimalValue(jobMaterial.quantity)
    if (!servicem8ItemUuid) {
      throw new Error(`ServiceM8 item at row ${index + 1} is invalid: item UUID is required.`)
    }
    if (!servicem8JobUuid) {
      throw new Error(`ServiceM8 item ${servicem8ItemUuid} is invalid: job UUID is required.`)
    }
    if (quantity === null) {
      throw new Error(`ServiceM8 item ${servicem8ItemUuid} is invalid: quantity must be a non-negative number.`)
    }

    const materialUuid = clean(jobMaterial.material_uuid)
    const itemCode = materialUuid ? itemCodesByMaterialUuid.get(materialUuid) ?? null : null
    const originalDescription = clean(jobMaterial.name) ?? ''
    const searchableLine = `${itemCode ?? ''} ${originalDescription}`.toLowerCase()
    if (normalizedExclusions.some((term) => searchableLine.includes(term))) {
      excludedLineCount += 1
      return []
    }

    const unitPrice = decimalValue(jobMaterial.price)

    return [{
      servicem8ItemUuid,
      servicem8JobUuid,
      itemCode,
      quantity,
      originalDescription,
      lineTotalExcludingGst: unitPrice === null
        ? null
        : (Number(unitPrice) * Number(quantity)).toFixed(2),
      sortOrder: integerValue(jobMaterial.sort_order),
    }]
  })

  return {
    inputs: Array.from(new Map(inputs.map((input) => [input.servicem8ItemUuid, input])).values()),
    excludedLineCount,
  }
}

export function validateServiceM8JobMaterials(jobMaterials: ServiceM8JobMaterial[]): void {
  jobMaterials.forEach((jobMaterial, index) => {
    if (!isActive(jobMaterial.active)) return
    if (isNegativeQuantity(jobMaterial.quantity)) return

    const servicem8ItemUuid = clean(jobMaterial.uuid)
    if (!servicem8ItemUuid) {
      throw new Error(`ServiceM8 item at row ${index + 1} is invalid: item UUID is required.`)
    }
    if (!clean(jobMaterial.job_uuid)) {
      throw new Error(`ServiceM8 item ${servicem8ItemUuid} is invalid: job UUID is required.`)
    }
    if (decimalValue(jobMaterial.quantity) === null) {
      throw new Error(`ServiceM8 item ${servicem8ItemUuid} is invalid: quantity must be a non-negative number.`)
    }
  })
}

function isActive(value: ServiceM8WorkOrderJob['active'] | ServiceM8JobMaterial['active']): boolean {
  return value === true || value === 1 || value === '1'
}

function clean(value: string | number | null | undefined): string | null {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

function decimalValue(value: string | number | null | undefined): string | null {
  const parsed = Number(clean(value))
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return String(parsed)
}

function isNegativeQuantity(value: string | number | null | undefined): boolean {
  const quantity = Number(clean(value))
  return Number.isFinite(quantity) && quantity < 0
}

function integerValue(value: string | number | null | undefined): number {
  const parsed = Number.parseInt(clean(value) ?? '', 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeStatus(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, ' ').toLowerCase() ?? ''
}

function toWorkOrderSyncInput(job: ServiceM8WorkOrderJob): WorkOrderSyncInput | null {
  const servicem8JobUuid = clean(job.uuid)
  if (!servicem8JobUuid) return null
  const jobNumber = clean(job.generated_job_id)
  const jobAddress = clean(job.job_address)

  return {
    servicem8JobUuid,
    servicem8CompanyUuid: clean(job.company_uuid),
    servicem8Status: clean(job.status) ?? 'Work Order',
    servicem8Active: true,
    jobNumber,
    jobAddress,
    jobDescription: clean(job.job_description),
    identityKind: 'servicem8_uuid',
    identityValue: servicem8JobUuid,
    approximateDescription: clean(job.approximate_description),
    systemName: clean(job.system_name),
    length: clean(job.length),
    color: clean(job.color),
    itemsServices: clean(job.items_services),
    glassStatus: clean(job.glass_status),
    designStatus: clean(job.design_status),
    siteCondition: clean(job.site_condition),
    remarks: clean(job.remarks),
    rawServiceM8Snapshot: job,
  }
}
