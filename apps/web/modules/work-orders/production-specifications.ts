export const PRODUCTION_SPECIFICATION_SCHEMA_VERSION = 1 as const

export const PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS = [
  { field: 'system', label: 'System' },
  { field: 'structureMaterial', label: 'Structure Material/Substrate' },
  { field: 'structureType', label: 'Structure Type' },
  { field: 'locationEnvironment', label: 'Location Environment' },
  { field: 'locationDetail', label: 'Location Detail/Area' },
  { field: 'structureBuilt', label: 'Structure Built' },
  { field: 'glassConstruction', label: 'Glass Construction' },
  { field: 'glassAppearance', label: 'Glass Appearance' },
  { field: 'thickness', label: 'Thickness' },
  { field: 'gateRequired', label: 'Gate Required' },
  { field: 'doorOpeningType', label: 'Door/Opening Type' },
  { field: 'fixingMethod', label: 'Fixing Method' },
  { field: 'hardwareFinish', label: 'Hardware/Fittings Finish' },
  { field: 'systemFinish', label: 'System/Channel Finish' },
  { field: 'interlinkingRail', label: 'Interlinking Rail' },
  { field: 'deliveryScope', label: 'Delivery Scope' },
] as const

export type ProductionSpecificationFieldName = typeof PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS[number]['field']
const SPECIFICATION_FIELD_NAMES: ProductionSpecificationFieldName[] = PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS
  .map(({ field }) => field)

export function isProductionSpecificationFieldName(value: string): value is ProductionSpecificationFieldName {
  return PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS.some((definition) => definition.field === value)
}

export function productionSpecificationFieldLabel(field: ProductionSpecificationFieldName) {
  return PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS.find((definition) => definition.field === field)?.label ?? field
}

export type ProductionSpecificationValue =
  | { state: 'selected'; catalogueId: string }
  | { state: 'tbc' }
  | { state: 'unmapped'; raw: string }

export type ProductionSpecificationMeasurement = {
  kind: 'quantity' | 'length' | 'width' | 'height' | 'diameter' | 'other'
  value: string
  unit: 'mm' | 'm' | 'each' | 'other'
  label?: string
}

export type ProductionSpecificationComponent = {
  name: string
  quantity?: string
  dimensions?: string
  material?: string
  finish?: string
  notes?: string
}

export type ProductionSpecificationRequirement = {
  kind: 'standard' | 'design_constraint' | 'inclusion' | 'exclusion' | 'template' | 'drawing' | 'other'
  detail: string
}

export type ProductionSpecification = {
  schemaVersion: typeof PRODUCTION_SPECIFICATION_SCHEMA_VERSION
  system: ProductionSpecificationValue
  structureMaterial: ProductionSpecificationValue
  structureType: ProductionSpecificationValue
  locationEnvironment: ProductionSpecificationValue
  locationDetail: ProductionSpecificationValue
  structureBuilt: ProductionSpecificationValue
  glassConstruction: ProductionSpecificationValue
  glassAppearance: ProductionSpecificationValue
  thickness: ProductionSpecificationValue
  gateRequired: ProductionSpecificationValue
  doorOpeningType: ProductionSpecificationValue
  fixingMethod: ProductionSpecificationValue
  hardwareFinish: ProductionSpecificationValue
  systemFinish: ProductionSpecificationValue
  interlinkingRail: ProductionSpecificationValue
  deliveryScope: ProductionSpecificationValue
  measurements: ProductionSpecificationMeasurement[]
  additionalComponents: ProductionSpecificationComponent[]
  specialRequirements: ProductionSpecificationRequirement[]
}

export type ProductionSpecificationCatalogueOption = {
  id: string
  field: ProductionSpecificationFieldName
  displayLabel: string
  productionLabel: string
  psCategorySlug?: string
  psOptionSlug?: string
  ps1Applicable?: boolean
  ps3Applicable?: boolean
  aliases?: readonly string[]
  isActive?: boolean
  sortOrder?: number
}

export const PRODUCTION_SPECIFICATION_CHANGE_REASONS = [
  { code: 'client_request', label: 'Client request' },
  { code: 'measurement_correction', label: 'Measurement correction' },
  { code: 'design_change', label: 'Design change' },
  { code: 'supplier_change', label: 'Supplier change' },
  { code: 'other', label: 'Other' },
] as const

export type ProductionSpecificationChangeReasonCode =
  typeof PRODUCTION_SPECIFICATION_CHANGE_REASONS[number]['code']

export type ProductionSpecificationChange = {
  kind: 'field' | 'measurements' | 'component' | 'requirement'
  identity: string
  previousValue: unknown
  newValue: unknown
}

export const INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE: readonly ProductionSpecificationCatalogueOption[] = [
  option('system.double-disc', 'system', 'Double Disc', 'Double Disc', 'system', 'double-disc'),
  option('system.frameless-spigot', 'system', 'Frameless Spigot', 'Frameless Spigot', 'system', 'frameless-spigot'),
  option('system.shower-glass', 'system', 'Shower Glass', 'Shower Glass'),
  option('system.shower-screen', 'system', 'Shower Screen', 'Shower Screen'),
  option('system.glass-pool-fence', 'system', 'Glass Pool Fence', 'Glass Pool Fence'),
  option('system.handrail', 'system', 'Handrail', 'Handrail'),
  option('system.round-ss-rail', 'system', 'Round Stainless Steel Rail', 'Round SS Rail', undefined, undefined, ['round stainless rail', 'round ss rail']),
  option('system.double-disc-balustrade', 'system', 'Double Disc Balustrade', 'Double Disc Balustrade', undefined, undefined, ['double disc balustrade']),
  option('system.edgetec-posiglaze-pool-fence', 'system', 'EdgeTec PosiGlaze Pool Fence', 'EdgeTec PosiGlaze Pool Fence', undefined, undefined, ['edgetec posiglaze', 'posiglaze pool fence']),
  option('system.handrail-brackets', 'system', 'Handrail Brackets', 'Handrail Brackets', undefined, undefined, ['hand rail brackets']),
  option('system.pool-fence-variation', 'system', 'Pool Fence Variation', 'Pool Fence Variation', undefined, undefined, ['pool fence design change']),
  option('system.shower-screens', 'system', 'Shower Screens', 'Shower Screens', undefined, undefined, ['multi screen shower']),
  option('structure_material.timber', 'structureMaterial', 'Timber', 'Timber', 'structure_material', 'timber'),
  option('structure_material.concrete', 'structureMaterial', 'Concrete', 'Concrete', 'structure_material', 'concrete'),
  option('structure_material.steel', 'structureMaterial', 'Steel', 'Steel', 'structure_material', 'steel'),
  option('structure_type.deck', 'structureType', 'Deck', 'Deck', 'structure_type', 'deck'),
  option('structure_type.balcony', 'structureType', 'Balcony', 'Balcony', 'structure_type', 'balcony'),
  option('structure_type.pool', 'structureType', 'Pool Area', 'Pool Area', 'structure_type', 'pool'),
  option('structure_type.stair', 'structureType', 'Stair Area', 'Stair Area', 'structure_type', 'stair'),
  option('structure_type.landing', 'structureType', 'Landing', 'Landing', 'structure_type', 'landing'),
  option('structure_type.stair-and-landing', 'structureType', 'Stair and Landing', 'Stair & Landing', 'structure_type', 'stair-and-landing'),
  option('structure_type.stair-and-balcony', 'structureType', 'Stair and Balcony Area', 'Stair & Balcony', 'structure_type', 'stair-and-balcony'),
  option('location.internal', 'locationEnvironment', 'Internal', 'Int', 'location', 'internal'),
  option('location.external', 'locationEnvironment', 'External', 'Ext', 'location', 'external'),
  option('location.both', 'locationEnvironment', 'Internal and External', 'Int/Ext', 'location', 'both'),
  option('location_detail.bathroom', 'locationDetail', 'Bathroom', 'Bathroom'),
  option('location_detail.balcony', 'locationDetail', 'Balcony', 'Balcony'),
  option('location_detail.pool-area', 'locationDetail', 'Pool Area', 'Pool Area'),
  option('location_detail.stair-area', 'locationDetail', 'Stair Area', 'Stair Area'),
  option('location_detail.landing', 'locationDetail', 'Landing', 'Landing'),
  option('location_detail.deck', 'locationDetail', 'Deck', 'Deck'),
  option('structure_built.new', 'structureBuilt', 'New', 'New', 'structure_built', 'new'),
  option('structure_built.existing', 'structureBuilt', 'Existing', 'Existing', 'structure_built', 'existing'),
  option('glass_construction.toughened', 'glassConstruction', 'Toughened', 'Toughened', 'glass_type', 'toughened'),
  option('glass_construction.laminated', 'glassConstruction', 'Laminated', 'Laminated', 'glass_type', 'laminated'),
  option('glass_appearance.clear', 'glassAppearance', 'Clear', 'Clear'),
  option('glass_appearance.tinted', 'glassAppearance', 'Tinted', 'Tinted'),
  option('glass_appearance.frosted', 'glassAppearance', 'Frosted', 'Frosted'),
  option('glass_appearance.ultra-clear', 'glassAppearance', 'Ultra-Clear', 'Ultra-Clear'),
  option('thickness.10mm', 'thickness', '10mm', '10 mm'),
  option('thickness.12mm', 'thickness', '12mm', '12 mm', 'thickness', '12mm'),
  option('thickness.15mm', 'thickness', '15mm', '15 mm', 'thickness', '15mm'),
  option('thickness.17-52mm', 'thickness', '17.52mm', '17.52 mm', 'thickness', '17-52mm'),
  option('gate_required.no', 'gateRequired', 'No', 'No Gate', 'gate_required', 'no'),
  option('gate_required.yes', 'gateRequired', 'Yes', 'Gate', 'gate_required', 'yes'),
  option('gate_required.one', 'gateRequired', 'One Gate', '1 Gate', undefined, undefined, ['one gate', '1 gate']),
  option('door_opening_type.hinged', 'doorOpeningType', 'Hinged', 'Hinged'),
  option('door_opening_type.sliding', 'doorOpeningType', 'Sliding', 'Sliding'),
  option('door_opening_type.fixed-panel', 'doorOpeningType', 'Fixed Panel', 'Fixed Panel'),
  option('door_opening_type.gate', 'doorOpeningType', 'Gate', 'Gate'),
  option('door_opening_type.none', 'doorOpeningType', 'No Door/Opening', 'No Door'),
  option('door_opening_type.hinged-fixed-panel', 'doorOpeningType', 'Hinged and Fixed Panel', 'Hinged + Fixed Panel', undefined, undefined, ['hinged plus fixed panel']),
  option('door_opening_type.multi-screen', 'doorOpeningType', 'Two Single, Corner and Diamond', '2 Single + Corner + Diamond', undefined, undefined, ['two single corner diamond']),
  option('fixing_method.double-disc', 'fixingMethod', 'Double Disc', 'Double Disc'),
  option('fixing_method.top-mounted-channel', 'fixingMethod', 'Top-Mounted Base Channel', 'Top-Mounted Channel', undefined, undefined, ['base channel', 'posiglaze']),
  option('fixing_method.timber-top-mount', 'fixingMethod', 'Timber Top-Mount', 'Timber Top-Mount', undefined, undefined, ['timber top mount']),
  option('fixing_method.custom-anti-toe-hold', 'fixingMethod', 'Custom Anti-Toe-Hold Design', 'Custom Anti-Toe-Hold Design', undefined, undefined, ['anti toe hold']),
  option('finish.chrome', 'hardwareFinish', 'Chrome', 'Chrome', undefined, undefined, ['polished chrome']),
  option('finish.matte-black', 'hardwareFinish', 'Matte Black', 'Matte Black'),
  option('finish.brushed-nickel', 'hardwareFinish', 'Brushed Nickel', 'Brushed Nickel', undefined, undefined, ['nickel']),
  option('finish.black', 'hardwareFinish', 'Black', 'Black', undefined, undefined, ['black hardware']),
  option('system_finish.ironsand', 'systemFinish', 'Ironsand', 'Ironsand', undefined, undefined, ['iron sand']),
  option('system_finish.316-ss', 'systemFinish', '316 Stainless Steel', '316 SS', undefined, undefined, ['316 stainless', '316 ss']),
  option('interlinking_rail.21x25mm', 'interlinkingRail', '21 x 25mm Interlinking Rail', 'IL Rail 21 x 25 mm', undefined, undefined, ['il rail', 'interlinking rail']),
  option('delivery_scope.supply-only', 'deliveryScope', 'Supply Only', 'Supply Only'),
  option('delivery_scope.supply-install', 'deliveryScope', 'Supply and Install', 'Supply & Install', undefined, undefined, ['supply & install']),
  option('delivery_scope.install-only', 'deliveryScope', 'Install Only', 'Install Only'),
  option('delivery_scope.install-included', 'deliveryScope', 'Installation Included', 'Install Included', undefined, undefined, ['installation included']),
]

export function resolveProductionSpecificationAlias(
  field: ProductionSpecificationFieldName,
  rawValue: string,
  catalogue: readonly ProductionSpecificationCatalogueOption[] = INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
): string | null {
  const normalizedValue = rawValue.trim().toLocaleLowerCase('en-NZ')
  const directMatch = catalogue.find((option) => (
    option.isActive !== false
    && option.field === field
    && [option.id, option.displayLabel, option.productionLabel, ...(option.aliases ?? [])]
      .some((value) => value.toLocaleLowerCase('en-NZ') === normalizedValue)
  ))
  return directMatch?.id ?? null
}

export function parseProductionSpecification(
  input: unknown,
  catalogue: readonly ProductionSpecificationCatalogueOption[] = INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
): ProductionSpecification {
  return parseProductionSpecificationDocument(input, catalogue, false)
}

export function parsePersistedProductionSpecification(
  input: unknown,
  catalogue: readonly ProductionSpecificationCatalogueOption[] = INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
): ProductionSpecification {
  return parseProductionSpecificationDocument(input, catalogue, true)
}

function parseProductionSpecificationDocument(
  input: unknown,
  catalogue: readonly ProductionSpecificationCatalogueOption[],
  allowInactiveCatalogueOptions: boolean,
): ProductionSpecification {
  const record = objectValue(input, 'Production specification')
  exactKeys(record, [
    'schemaVersion',
    ...SPECIFICATION_FIELD_NAMES,
    'measurements',
    'additionalComponents',
    'specialRequirements',
  ], 'Production specification')
  if (record.schemaVersion !== PRODUCTION_SPECIFICATION_SCHEMA_VERSION) {
    throw new Error(`Production specification schemaVersion must be ${PRODUCTION_SPECIFICATION_SCHEMA_VERSION}.`)
  }

  const specification = { schemaVersion: PRODUCTION_SPECIFICATION_SCHEMA_VERSION } as ProductionSpecification
  for (const field of SPECIFICATION_FIELD_NAMES) {
    specification[field] = parseSpecificationValue(
      record[field],
      field,
      catalogue,
      allowInactiveCatalogueOptions,
    )
  }
  specification.measurements = arrayValue(record.measurements, 'measurements').map(parseMeasurement)
  specification.additionalComponents = arrayValue(record.additionalComponents, 'additionalComponents').map(parseComponent)
  specification.specialRequirements = arrayValue(record.specialRequirements, 'specialRequirements').map(parseRequirement)
  return specification
}

export function createEmptyProductionSpecification(): ProductionSpecification {
  return {
    schemaVersion: PRODUCTION_SPECIFICATION_SCHEMA_VERSION,
    system: { state: 'tbc' },
    structureMaterial: { state: 'tbc' },
    structureType: { state: 'tbc' },
    locationEnvironment: { state: 'tbc' },
    locationDetail: { state: 'tbc' },
    structureBuilt: { state: 'tbc' },
    glassConstruction: { state: 'tbc' },
    glassAppearance: { state: 'tbc' },
    thickness: { state: 'tbc' },
    gateRequired: { state: 'tbc' },
    doorOpeningType: { state: 'tbc' },
    fixingMethod: { state: 'tbc' },
    hardwareFinish: { state: 'tbc' },
    systemFinish: { state: 'tbc' },
    interlinkingRail: { state: 'tbc' },
    deliveryScope: { state: 'tbc' },
    measurements: [],
    additionalComponents: [],
    specialRequirements: [],
  }
}

export function buildProductionLabel(
  specification: ProductionSpecification,
  catalogue: readonly ProductionSpecificationCatalogueOption[] = INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
): string {
  const labelFor = (value: ProductionSpecificationValue) => selectedLabel(value, catalogue)
  const system = labelFor(specification.system)
  const location = buildLocationLabel(specification, catalogue)
  const measurements = specification.measurements.map(formatMeasurement)
  const glass = [
    labelFor(specification.thickness),
    labelFor(specification.glassConstruction),
    labelFor(specification.glassAppearance),
  ].filter(Boolean).join(' ')
  const material = labelFor(specification.structureMaterial)
  const fixing = labelFor(specification.fixingMethod)
  const fixingAndMaterial = [material, fixing && fixing !== system ? fixing : ''].filter(Boolean).join(' / ')
  const doorOpening = labelFor(specification.doorOpeningType)
  const finishes = uniqueLabels([
    labelFor(specification.hardwareFinish),
    labelFor(specification.systemFinish),
  ]).join('/')
  const extras = [
    labelFor(specification.interlinkingRail),
    labelFor(specification.gateRequired) === 'No Gate' ? '' : labelFor(specification.gateRequired),
  ].filter(Boolean).join(' / ')
  const scope = labelFor(specification.deliveryScope)

  const identityLine = [system, location, ...measurements].filter(Boolean).join(' | ')
  const productionLine = [glass, doorOpening, fixingAndMaterial, finishes, extras, scope].filter(Boolean).join(' | ')
  return [identityLine, productionLine].filter(Boolean).join('\n')
}

export function productionSpecificationValueLabel(
  value: ProductionSpecificationValue,
  catalogue: readonly ProductionSpecificationCatalogueOption[] = INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
) {
  if (value.state === 'tbc') return 'TBC'
  if (value.state === 'unmapped') return `Unmapped - ${value.raw}`
  return catalogue.find((option) => (
    option.id === value.catalogueId
  ))?.displayLabel ?? 'Unmapped - Needs Review'
}

export function confirmProductionSpecificationDraft(input: {
  specificationId: string
  workOrderItemId: string
  draft: ProductionSpecification
  previousConfirmed: ProductionSpecification | null
  actorId: string | null
  confirmedAt: Date
  catalogue?: readonly ProductionSpecificationCatalogueOption[]
  changeReason?: {
    code: ProductionSpecificationChangeReasonCode
    note?: string
  }
}) {
  const catalogue = input.catalogue ?? INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE
  const confirmedData = parseProductionSpecification(input.draft, catalogue)
  const productionLabel = buildProductionLabel(confirmedData, catalogue)
  if (!productionLabel) throw new Error('Production specification cannot be confirmed without a production label.')
  const changeReason = input.previousConfirmed ? parseChangeReason(input.changeReason) : null
  const changes = input.previousConfirmed
    ? productionSpecificationChanges(input.previousConfirmed, confirmedData)
    : []
  if (input.previousConfirmed && changes.length === 0) {
    throw new Error('Change at least one confirmed value before confirming this revision.')
  }

  return {
    specification: {
      status: 'confirmed' as const,
      draftData: null,
      confirmedData,
      schemaVersion: PRODUCTION_SPECIFICATION_SCHEMA_VERSION,
      productionLabel,
      confirmedBy: input.actorId,
      confirmedAt: input.confirmedAt,
      updatedAt: input.confirmedAt,
    },
    revision: {
      specificationId: input.specificationId,
      workOrderItemId: input.workOrderItemId,
      actorId: input.actorId,
      revisionType: input.previousConfirmed ? 'draft_confirmed' : 'baseline_confirmed',
      previousSnapshot: input.previousConfirmed,
      newSnapshot: confirmedData,
      reasonCode: changeReason?.code ?? null,
      note: changeReason?.note ?? null,
      changes,
      createdAt: input.confirmedAt,
    },
  }
}

export function productionSpecificationChanges(
  previous: ProductionSpecification,
  next: ProductionSpecification,
): ProductionSpecificationChange[] {
  const fieldChanges = SPECIFICATION_FIELD_NAMES.flatMap<ProductionSpecificationChange>((field) => (
    JSON.stringify(previous[field]) === JSON.stringify(next[field])
      ? []
      : [{
          kind: 'field',
          identity: field,
          previousValue: previous[field],
          newValue: next[field],
        }]
  ))
  const repeatableChanges: ProductionSpecificationChange[] = [
    ['measurements', 'measurements', previous.measurements, next.measurements],
    ['component', 'additionalComponents', previous.additionalComponents, next.additionalComponents],
    ['requirement', 'specialRequirements', previous.specialRequirements, next.specialRequirements],
  ].flatMap(([kind, identity, previousValue, newValue]) => (
    JSON.stringify(previousValue) === JSON.stringify(newValue)
      ? []
      : [{
          kind: kind as ProductionSpecificationChange['kind'],
          identity: String(identity),
          previousValue,
          newValue,
        }]
  ))
  return [...fieldChanges, ...repeatableChanges]
}

export function summarizeProductionSpecificationChanges(
  previous: ProductionSpecification,
  next: ProductionSpecification,
  catalogue: readonly ProductionSpecificationCatalogueOption[] = INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
) {
  const changes = SPECIFICATION_FIELD_NAMES.flatMap((field) => {
    if (JSON.stringify(previous[field]) === JSON.stringify(next[field])) return []
    return [`${productionSpecificationFieldLabel(field)}: ${productionSpecificationValueLabel(previous[field], catalogue)} -> ${productionSpecificationValueLabel(next[field], catalogue)}`]
  })
  if (JSON.stringify(previous.measurements) !== JSON.stringify(next.measurements)) changes.push('Measurements updated')
  if (JSON.stringify(previous.additionalComponents) !== JSON.stringify(next.additionalComponents)) changes.push('Additional Components updated')
  if (JSON.stringify(previous.specialRequirements) !== JSON.stringify(next.specialRequirements)) changes.push('Special Requirements updated')
  return changes.length > 0 ? changes.join('; ') : 'Confirmed with no specification changes'
}

function parseChangeReason(input: {
  code: ProductionSpecificationChangeReasonCode
  note?: string
} | undefined) {
  if (!input || !PRODUCTION_SPECIFICATION_CHANGE_REASONS.some(({ code }) => code === input.code)) {
    throw new Error('Choose an approved change reason before confirming this revision.')
  }
  const note = input.note?.trim() || null
  if (input.code === 'other' && !note) {
    throw new Error('Explain the Other change reason before confirming this revision.')
  }
  if (note && note.length > 500) throw new Error('Change note must be 500 characters or fewer.')
  return { code: input.code, note }
}

function option(
  id: string,
  field: ProductionSpecificationFieldName,
  displayLabel: string,
  productionLabel: string,
  psCategorySlug?: string,
  psOptionSlug?: string,
  aliases?: readonly string[],
): ProductionSpecificationCatalogueOption {
  const psApplicable = Boolean(psCategorySlug && psOptionSlug)
  return {
    id,
    field,
    displayLabel,
    productionLabel,
    psCategorySlug,
    psOptionSlug,
    ps1Applicable: psApplicable,
    ps3Applicable: psApplicable,
    aliases,
    isActive: true,
    sortOrder: 0,
  }
}

function parseSpecificationValue(
  input: unknown,
  field: ProductionSpecificationFieldName,
  catalogue: readonly ProductionSpecificationCatalogueOption[],
  allowInactiveCatalogueOptions: boolean,
): ProductionSpecificationValue {
  const value = objectValue(input, field)
  if (value.state === 'tbc') {
    exactKeys(value, ['state'], field)
    return { state: 'tbc' }
  }
  if (value.state === 'unmapped') {
    exactKeys(value, ['state', 'raw'], field)
    return { state: 'unmapped', raw: requiredText(value.raw, `${field}.raw`, 240) }
  }
  if (value.state !== 'selected') throw new Error(`${field}.state is invalid.`)
  exactKeys(value, ['state', 'catalogueId'], field)

  const catalogueId = requiredText(value.catalogueId, `${field}.catalogueId`, 120)
  const catalogueOption = catalogue.find((option) => option.id === catalogueId)
  if (
    !catalogueOption
    || catalogueOption.field !== field
    || (!allowInactiveCatalogueOptions && catalogueOption.isActive === false)
  ) {
    throw new Error(`${catalogueId} is not an approved ${field} catalogue option.`)
  }
  return { state: 'selected', catalogueId }
}

function parseMeasurement(input: unknown): ProductionSpecificationMeasurement {
  const value = objectValue(input, 'measurement')
  exactKeys(value, ['kind', 'value', 'unit', 'label'], 'measurement')
  const kind = enumValue(value.kind, 'measurement.kind', ['quantity', 'length', 'width', 'height', 'diameter', 'other'] as const)
  const unit = enumValue(value.unit, 'measurement.unit', ['mm', 'm', 'each', 'other'] as const)
  return {
    kind,
    value: requiredText(value.value, 'measurement.value', 40),
    unit,
    ...(value.label === undefined ? {} : { label: requiredText(value.label, 'measurement.label', 80) }),
  }
}

function parseComponent(input: unknown): ProductionSpecificationComponent {
  const value = objectValue(input, 'component')
  exactKeys(value, ['name', 'quantity', 'dimensions', 'material', 'finish', 'notes'], 'component')
  return {
    name: requiredText(value.name, 'component.name', 160),
    ...optionalTextProperty(value, 'quantity', 40),
    ...optionalTextProperty(value, 'dimensions', 120),
    ...optionalTextProperty(value, 'material', 120),
    ...optionalTextProperty(value, 'finish', 120),
    ...optionalTextProperty(value, 'notes', 500),
  }
}

function parseRequirement(input: unknown): ProductionSpecificationRequirement {
  const value = objectValue(input, 'requirement')
  exactKeys(value, ['kind', 'detail'], 'requirement')
  return {
    kind: enumValue(value.kind, 'requirement.kind', [
      'standard', 'design_constraint', 'inclusion', 'exclusion', 'template', 'drawing', 'other',
    ] as const),
    detail: requiredText(value.detail, 'requirement.detail', 1_000),
  }
}

function buildLocationLabel(
  specification: ProductionSpecification,
  catalogue: readonly ProductionSpecificationCatalogueOption[],
) {
  if (specification.locationEnvironment.state !== 'selected') {
    const detail = selectedLabel(specification.locationDetail, catalogue)
    return detail ? `Location TBC - ${detail}` : 'Location TBC'
  }
  return [
    selectedLabel(specification.locationEnvironment, catalogue),
    selectedLabel(specification.structureType, catalogue),
    selectedLabel(specification.locationDetail, catalogue),
  ].filter(Boolean).join(' ')
}

function selectedLabel(
  value: ProductionSpecificationValue,
  catalogue: readonly ProductionSpecificationCatalogueOption[],
) {
  if (value.state !== 'selected') return ''
  return catalogue.find((option) => option.id === value.catalogueId)?.productionLabel ?? ''
}

function formatMeasurement(measurement: ProductionSpecificationMeasurement) {
  const value = `${measurement.value} ${measurement.unit === 'other' ? '' : measurement.unit}`.trim()
  return measurement.label ? `${measurement.label} ${value}` : value
}

function uniqueLabels(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function objectValue(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${label} must be an object.`)
  return input as Record<string, unknown>
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[], label: string) {
  const unsupported = Object.keys(record).find((key) => !allowed.includes(key))
  if (unsupported) throw new Error(`${label} contains unsupported field ${unsupported}.`)
}

function arrayValue(input: unknown, label: string): unknown[] {
  if (!Array.isArray(input)) throw new Error(`${label} must be an array.`)
  if (input.length > 100) throw new Error(`${label} has too many entries.`)
  return input
}

function requiredText(input: unknown, label: string, maxLength: number) {
  if (typeof input !== 'string' || !input.trim()) throw new Error(`${label} is required.`)
  const value = input.trim()
  if (value.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer.`)
  return value
}

function optionalTextProperty(
  record: Record<string, unknown>,
  key: keyof ProductionSpecificationComponent,
  maxLength: number,
) {
  if (record[key] === undefined || record[key] === null || record[key] === '') return {}
  return { [key]: requiredText(record[key], `component.${key}`, maxLength) }
}

function enumValue<const T extends readonly string[]>(input: unknown, label: string, allowed: T): T[number] {
  if (typeof input !== 'string' || !allowed.includes(input)) throw new Error(`${label} is invalid.`)
  return input as T[number]
}
