import { DECISION_MATRIX, type MatrixFieldKey } from '@/modules/lead-intake/scoring/score-lead'

export type ServiceM8LeadTier = 'A' | 'B' | 'C' | 'D' | 'E'

export type ServiceM8LeadSyncRecord = {
  leadId: string
  servicem8JobUuid: string | null
  clientName: string
  companyName: string | null
  phone: string | null
  email: string | null
  channel: string
  source: string | null
  projectType: string | null
  location: string | null
  suburb: string | null
  clientProfileKey: string | null
  budgetBand: string | null
  consentStatus: string | null
  complexity: string | null
  priceSensitivityRead: string | null
  decisionMakers: string | null
  distanceBand: string | null
  paymentHistory: string | null
  siteAccess: string | null
  installationHeight: string | null
  freeText: string | null
  seedScore: number | null
  tier: ServiceM8LeadTier | null
  scoreReason: string | null
  strikeFlag: string | null
  completeness: number | null
  updatedAt: Date
}

export type ServiceM8LeadPayload = {
  to: string[]
  subject: string
  body: string
  noteSignature: string
}

export type ServiceM8LeadJobCardFields = {
  jobDescription: string | null
  diaryNote: string | null
  summaryNote: string | null
  clientType: string | null
  leadsQuality: ServiceM8LeadTier | null
}

type ReadableProjectDetails = {
  project: string | null
  estimatedPrice: string | null
  subtotal: string | null
  installationLines: string[]
}

const LEGACY_OPTION_LABELS: Record<string, string> = {
  within_30km: 'Within 30 km',
  '30km_to_80km': '30-80 km',
  over_80km: 'Over 80 km',
  new_business: 'New Business',
  existing_business: 'Existing Business',
  homeowner: 'Homeowner',
  builder: 'Builder',
  developer: 'Developer',
  architect: 'Architect',
  pool_builder: 'Pool Builder',
  '2k_to_10k': '$2k to $10k',
  '10k_to_50k': '$10k to $50k',
  standard_non_custom: 'Standard Non Custom',
  pool_fence: 'Pool Fence',
  stair: 'Stair Balustrade',
  balcony_balustrade: 'Balcony Balustrade',
  ground_level: 'Ground Level Balustrade',
  stair_balustrade: 'Stair Balustrade',
  calculator: 'Calculator',
  anytime: 'Anytime',
  spigot_round: 'Round Spigots',
  standoff_posts: 'Stand-off Posts',
  jh_clamps: 'JH Clamps',
  tile: 'Tile',
  concrete: 'Concrete',
  timber: 'Timber',
  steel: 'Steel',
  matte_black: 'Matte Black',
  standard_chrome: 'Standard Chrome',
  brushed_chrome: 'Brushed Chrome',
  powder_coated: 'Powder Coated',
  toughened_12mm: '12mm Toughened',
  toughened_12mm_clear: '12mm Toughened / Clear',
  laminated: 'Laminated Glass',
  clear: 'Clear',
  low_iron: 'Low Iron / Ultra-Clear',
  tinted: 'Tinted',
  frosted: 'Frosted',
}

const LEGACY_OPTION_PATTERN = new RegExp(
  `\\b(${Object.keys(LEGACY_OPTION_LABELS)
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|')})\\b`,
  'g',
)

export function buildServiceM8InboxEmail(
  record: ServiceM8LeadSyncRecord,
  recipients: string[],
): ServiceM8LeadPayload {
  const tier = record.tier ?? 'D'
  const score = record.seedScore ?? 0
  const completeness = record.completeness ?? 0
  const projectDetails = buildReadableProjectDetails(record.freeText)
  const subject = [
    'RGTools Lead',
    `Leads Quality ${tier}`,
    record.clientName,
    humanizeValue(record.projectType),
  ].filter(Boolean).join(' - ')

  return {
    to: recipients,
    subject,
    body: buildCompleteLeadDetails(record, projectDetails),
    noteSignature: [
      tier,
      score,
      completeness,
      record.scoreReason ?? '',
      record.strikeFlag ?? '',
    ].join('|'),
  }
}

export function buildServiceM8LeadJobCardFields(
  record: ServiceM8LeadSyncRecord,
): ServiceM8LeadJobCardFields {
  const leadQuality = record.tier ?? null
  const projectDetails = buildReadableProjectDetails(record.freeText)
  const completeDetails = buildCompleteLeadDetails(record, projectDetails)
  const summaryNote = buildContactAndProjectSummary(record, projectDetails)

  return {
    jobDescription: buildShortJobDescription(record, projectDetails),
    diaryNote: `RGTools calculator submission\n\n${completeDetails}`,
    summaryNote,
    clientType: optionLabel('clientType', record.clientProfileKey),
    leadsQuality: leadQuality,
  }
}

function buildCompleteLeadDetails(
  record: ServiceM8LeadSyncRecord,
  projectDetails: ReadableProjectDetails,
): string {
  const leadScoreLines = [
    record.tier ? `Quality: ${record.tier}` : null,
    record.seedScore === null || record.seedScore === undefined ? null : `Score: ${record.seedScore}`,
    record.completeness === null || record.completeness === undefined
      ? null
      : `Completeness: ${record.completeness}%`,
    record.strikeFlag ? `Flag: ${record.strikeFlag}` : null,
    record.scoreReason ? `Reason: ${formatScoreReason(record.scoreReason)}` : null,
  ].filter((line): line is string => Boolean(line))
  const leadDetails = [
    readableLine('Client type', optionLabel('clientType', record.clientProfileKey)),
    readableLine('Consent status', humanizeValue(record.consentStatus)),
    readableLine('Complexity', optionLabel('projectType', record.complexity)),
    readableLine('Price-sensitivity read', optionLabel('priceSensitivity', record.priceSensitivityRead)),
    readableLine('Decision-makers', optionLabel('decisionMakers', record.decisionMakers)),
    readableLine('Source', optionLabel('source', record.source)),
    readableLine('Payment history', optionLabel('paymentHistory', record.paymentHistory)),
    readableLine('Site access', optionLabel('siteAccess', record.siteAccess)),
    readableLine('Installation height', optionLabel('installationHeight', record.installationHeight)),
    readableLine('Channel', humanizeValue(record.channel)),
    readableLine('Suburb', record.suburb),
  ].filter((line): line is string => Boolean(line))
  return [
    ...buildContactLines(record),
    ...(leadScoreLines.length > 0 ? ['', '--- Lead Score ---', ...leadScoreLines] : []),
    '',
    ...buildProjectSummaryLines(record, projectDetails),
    ...(leadDetails.length > 0 ? ['', '--- Lead Details ---', ...leadDetails] : []),
    ...(projectDetails.installationLines.length > 0
      ? ['', '--- Installation Details ---', ...projectDetails.installationLines]
      : []),
    '',
    '--- Reference ---',
    `RGTools Lead: ${record.leadId}`,
  ].join('\n')
}

function buildContactAndProjectSummary(
  record: ServiceM8LeadSyncRecord,
  projectDetails: ReadableProjectDetails,
): string {
  return [
    ...buildContactLines(record),
    '',
    ...buildProjectSummaryLines(record, projectDetails),
    `Reference: RGTools Lead ${record.leadId}`,
  ].join('\n')
}

function buildShortJobDescription(
  record: ServiceM8LeadSyncRecord,
  projectDetails: ReadableProjectDetails,
): string {
  const project = projectDetails.project ?? humanizeValue(record.projectType) ?? 'Glass project'
  const detailByLabel = new Map(projectDetails.installationLines.map((line): [string, string] => {
    const separator = line.indexOf(':')
    return separator === -1
      ? [line, '']
      : [line.slice(0, separator), line.slice(separator + 1).trim()]
  }))
  const corners = detailByLabel.get('Corners')
  const gates = detailByLabel.get('Gates')
  const fixing = detailByLabel.get('Fixing')
  const substrate = detailByLabel.get('Substrate')
  const details = [
    detailByLabel.get('Length')?.replace(/\s+m$/, 'm'),
    corners && corners !== '0' ? formatCount(corners, 'corner') : null,
    gates && gates !== '0' ? formatCount(gates, 'gate') : null,
    fixing && substrate ? `${fixing} on ${substrate}` : fixing ?? substrate,
  ].filter((value): value is string => Boolean(value))

  const fallbackLocation = record.suburb ?? record.location
  const suffix = details.length > 0 ? details.join(', ') : fallbackLocation
  return `RGTools Lead - ${project} quote${suffix ? ` - ${suffix}` : ''}`
}

function formatCount(value: string, label: string): string {
  return `${value} ${label}${value === '1' ? '' : 's'}`
}

function optionLabel(fieldKey: MatrixFieldKey, value: string | null | undefined): string | null {
  if (!value) return null
  return DECISION_MATRIX.fields
    .find((field) => field.key === fieldKey)
    ?.options.find((option) => option.key === value)
    ?.label ?? humanizeValue(value)
}

function readableLine(label: string, value: string | null): string | null {
  return value ? `${label}: ${value}` : null
}

function buildContactLines(record: ServiceM8LeadSyncRecord): string[] {
  return [
    '--- Contact ---',
    `Name: ${record.clientName}`,
    record.companyName ? `Company: ${record.companyName}` : null,
    record.phone ? `Mobile: ${record.phone}` : null,
    record.email ? `Email: ${record.email}` : null,
    record.location ? `Address: ${record.location}` : null,
  ].filter((line): line is string => line !== null)
}

function buildProjectSummaryLines(
  record: ServiceM8LeadSyncRecord,
  projectDetails: ReadableProjectDetails,
): string[] {
  return [
    '--- Project Summary ---',
    readableLine('Product', humanizeValue(record.projectType)),
    readableLine('Project', projectDetails.project),
    readableLine('Budget', optionLabel('budgetBand', record.budgetBand)),
    readableLine('Estimated price', projectDetails.estimatedPrice),
    readableLine('Subtotal', projectDetails.subtotal),
    readableLine('Driving distance', optionLabel('distanceBand', record.distanceBand)),
    readableLine('Last updated', formatLeadCardDate(record.updatedAt)),
  ].filter((line): line is string => line !== null)
}

function formatLeadCardDate(value: Date): string | null {
  if (Number.isNaN(value.getTime())) return null
  return new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Pacific/Auckland',
  }).format(value)
}

function buildReadableProjectDetails(value: string | null | undefined): ReadableProjectDetails {
  const details: ReadableProjectDetails = {
    project: null,
    estimatedPrice: null,
    subtotal: null,
    installationLines: [],
  }

  for (const rawLine of value?.split(/\r?\n/) ?? []) {
    const line = rawLine.trim()
    if (!line || /^\[Calculator\]\s+submitted\s+/i.test(line)) continue

    const estimate = line.match(/^Estimate:\s*\$?([\d,.]+)\s*-\s*\$?([\d,.]+)(?:\s+\(subtotal\s+\$?([\d,.]+)\))?$/i)
    if (estimate) {
      details.estimatedPrice = `${formatMoney(estimate[1])}-${formatMoney(estimate[2])}`
      details.subtotal = estimate[3] ? formatMoney(estimate[3]) : null
      continue
    }

    const project = line.match(
      /^Project:\s*(.+?),\s*([\d.]+)m,\s*(\d+)\s+corner\(s\),\s*(\d+)\s+gate\(s\)(?:,\s*landing\s*([\d.]+)m)?$/i,
    )
    if (project) {
      details.project = humanizeStoredText(project[1])
      details.installationLines.push(`Length: ${project[2]} m`, `Corners: ${project[3]}`, `Gates: ${project[4]}`)
      if (project[5]) details.installationLines.push(`Landing: ${project[5]} m`)
      continue
    }

    if (/^(?:Fixing|Customer type):/i.test(line)) {
      details.installationLines.push(
        ...line
          .split(/\s+\|\s+/)
          .map((part) => humanizeStoredText(part))
          .filter((part): part is string => Boolean(part)),
      )
      continue
    }

    if (/^(?:Consultation needed|Contact consent):/i.test(line)) {
      details.installationLines.push(formatYesNoLine(line))
      continue
    }

    const readable = humanizeStoredText(line)
    if (readable) details.installationLines.push(readable.includes(':') ? readable : `Details: ${readable}`)
  }

  return details
}

function formatMoney(value: string): string {
  const amount = Number(value.replaceAll(',', ''))
  if (!Number.isFinite(amount)) return `$${value}`
  return `$${new Intl.NumberFormat('en-NZ', { maximumFractionDigits: 2 }).format(amount)}`
}

function formatYesNoLine(value: string): string {
  return value.replace(
    /:\s*(yes|no)\b/i,
    (_match, answer: string) => `: ${answer.charAt(0).toUpperCase()}${answer.slice(1).toLowerCase()}`,
  )
}

function formatScoreReason(value: string): string | null {
  return (
    humanizeStoredText(value)
      ?.replace(/^Tier [A-E] \(\d+\):\s*/i, '')
      .replace(/(\d+)\/(\d+) matrix fields answered/i, '$1 of $2 scoring fields answered') ?? null
  )
}

function cleanOneLine(value: string | null | undefined): string | null {
  const cleaned = value?.replace(/\s+/g, ' ').trim()
  return cleaned || null
}

function humanizeValue(value: string | null | undefined): string | null {
  const cleaned = cleanOneLine(value)
  if (!cleaned) return null
  if (LEGACY_OPTION_LABELS[cleaned]) return LEGACY_OPTION_LABELS[cleaned]
  return cleaned
    .split('_')
    .filter(Boolean)
    .map((part) => {
      if (/^lt$/i.test(part)) return '<'
      if (/^gt$/i.test(part)) return '>'
      if (/^km$/i.test(part)) return 'km'
      if (/^\d+k$/i.test(part)) return `$${part.toLowerCase()}`
      if (/^\d+$/.test(part)) return part
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
    .replace(/< (\d+)/g, '<$1')
    .replace(/> (\d+)/g, '>$1')
    .replace(/\bTo\b/g, 'to')
    .replace(/\bKm\b/g, 'km')
}

function humanizeStoredText(value: string | null | undefined): string | null {
  const cleaned = cleanOneLine(value)
  if (!cleaned) return null

  return cleaned
    .replace(LEGACY_OPTION_PATTERN, (match) => LEGACY_OPTION_LABELS[match] ?? match)
    .replace(/\b[a-z0-9]+(?:_[a-z0-9]+)+\b/g, (match) => humanizeValue(match) ?? match)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
