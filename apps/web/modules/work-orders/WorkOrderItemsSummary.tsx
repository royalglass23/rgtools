'use client'

import { useState } from 'react'
import {
  regenerateWorkOrderItemLabelAction,
  updateWorkOrderItemLabelAction,
  updateWorkOrderItemOperationalFieldAction,
} from './actions'
import { operationalFieldLabel, type WorkOrderItemOperationalField } from './item-operational-fields'
import {
  retryWorkOrderItemProductionSpecificationEnrichmentAction,
  saveWorkOrderItemProductionSpecificationDraftAction,
} from './production-specification-actions'
import { ProductionSpecificationDetails, safeProductionSpecification } from './ProductionSpecificationSection'
import {
  buildProductionLabel,
  createEmptyProductionSpecification,
  INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
  type ProductionSpecification,
  type ProductionSpecificationCatalogueOption,
} from './production-specifications'
import type {
  WorkOrderItemProductionSpecificationSummary,
  WorkOrderItemSummaryRow,
} from './work-order-items'
import type { WorkOrderSummaryFieldConfig, WorkOrderSummaryFieldId } from './summary-config'

type FilterOption = { id: string; label: string }
type WorkOrderItemOptions = {
  installers: FilterOption[]
  stages: FilterOption[]
  hardwareStatuses: FilterOption[]
}

const EMPTY_OPTIONS: WorkOrderItemOptions = { installers: [], stages: [], hardwareStatuses: [] }
const OPERATIONAL_FIELD_BY_SUMMARY_ID: Partial<Record<WorkOrderSummaryFieldId, WorkOrderItemOperationalField>> = {
  installer: 'installer',
  stage: 'stage',
  hardware: 'hardware',
  maintenanceProgram: 'maintenanceProgram',
  installDate: 'installDate',
  dateCompleted: 'dateCompleted',
  risk: 'risk',
  importance: 'importance',
}
const DEFAULT_ITEM_FIELDS = [
  'item',
  'installer',
  'stage',
  'hardware',
  'maintenanceProgram',
  'installDate',
  'dateCompleted',
  'risk',
  'importance',
].map((id, index) => ({ id: id as WorkOrderSummaryFieldId, visible: true, editable: true, order: index + 1 }))

type ItemFieldConfig = Pick<WorkOrderSummaryFieldConfig, 'id' | 'visible' | 'editable' | 'order'>

export function WorkOrderItemsSummary({
  items,
  showCount = true,
  canManage = false,
  options = EMPTY_OPTIONS,
  catalogue = INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
  fields,
  tone = 'white',
  productionSpecificationsEnabled = process.env.NEXT_PUBLIC_WORK_ORDER_PRODUCTION_SPECIFICATIONS_ENABLED !== 'false',
}: {
  items: WorkOrderItemSummaryRow[]
  showCount?: boolean
  canManage?: boolean
  options?: WorkOrderItemOptions
  catalogue?: readonly ProductionSpecificationCatalogueOption[]
  fields?: ItemFieldConfig[]
  tone?: 'white' | 'tint'
  productionSpecificationsEnabled?: boolean
}) {
  if (items.length === 0) {
    return (
      <section aria-label="Work Order items" className="space-y-2 px-4 py-3">
        {showCount && <ItemCount count={0} />}
        <p className="rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-sm text-gray-600">
          No items synced from ServiceM8 yet
        </p>
      </section>
    )
  }

  const activeItemCount = items.filter((item) => item.isActive).length
  const visibleFields = configuredItemFields(fields)
  const itemField = visibleFields.find((field) => field.id === 'item')
  const operationalFields = visibleFields.flatMap((field) => {
    const operationalField = OPERATIONAL_FIELD_BY_SUMMARY_ID[field.id]
    return operationalField ? [{ config: field, field: operationalField }] : []
  })
  const activeTone = tone === 'tint'
    ? 'border-border bg-surface-subtle'
    : 'border-border bg-surface'

  return (
    <section aria-label="Work Order items" className="space-y-2 px-4 py-3">
      {showCount && <ItemCount count={activeItemCount} />}
      <div role="table" aria-label="Work Order item details" className="grid gap-2">
        {items.map((item) => {
          const lineTotal = item.lineTotalExcludingGst
            ? `$${item.lineTotalExcludingGst}`
            : 'Not available'
          const hoverDetail = `${item.originalDescription}\nLine total excluding GST: ${lineTotal}`

          return (
            <div
              key={item.id}
              title={hoverDetail}
              role="row"
              className={`space-y-3 rounded border px-3 py-2 text-sm ${item.isActive
                ? activeTone
                : 'border-amber-200 bg-amber-50'}`}
            >
              {itemField && (
                <ItemCompositeField
                  key={productionSpecificationStateKey(item, productionSpecificationsEnabled)}
                  item={item}
                  hoverDetail={hoverDetail}
                  canEdit={canManage && itemField.editable && item.isActive}
                  canManageSpecification={productionSpecificationsEnabled && canManage && item.isActive}
                  productionSpecificationsEnabled={productionSpecificationsEnabled}
                  catalogue={catalogue}
                />
              )}
              {operationalFields.length > 0 && (
                <div role="cell" aria-label="Work Order item controls">
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                    {operationalFields.map(({ config, field }) => (
                      <ItemOperationalField
                        key={config.id}
                        item={item}
                        options={options}
                        field={field}
                        canEdit={canManage && config.editable && item.isActive}
                      />
                    ))}
                  </dl>
                </div>
              )}
              {!item.isActive && !visibleFields.some((field) => field.id === 'item') && (
                <span role="cell" className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Removed</span>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ItemCompositeField({
  item,
  hoverDetail,
  canEdit,
  canManageSpecification,
  productionSpecificationsEnabled,
  catalogue,
}: {
  item: WorkOrderItemSummaryRow
  hoverDetail: string
  canEdit: boolean
  canManageSpecification: boolean
  productionSpecificationsEnabled: boolean
  catalogue: readonly ProductionSpecificationCatalogueOption[]
}) {
  const [productionSpecification, setProductionSpecification] = useState<WorkOrderItemProductionSpecificationSummary | null>(
    productionSpecificationsEnabled ? item.productionSpecification ?? null : null,
  )
  const [localSpecificationDocument, setLocalSpecificationDocument] = useState<ProductionSpecification | null>(() => (
    productionSpecificationsEnabled
      ? safeProductionSpecification(item.productionSpecification?.confirmedData ?? item.productionSpecification?.draftData, catalogue)
      : null
  ))
  const [createStatus, setCreateStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [createError, setCreateError] = useState<string | null>(null)
  const structuredDocument = localSpecificationDocument ?? safeProductionSpecification(
    productionSpecification?.confirmedData ?? productionSpecification?.draftData,
    catalogue,
  )
  const draftSpecificationDocument = safeProductionSpecification(productionSpecification?.draftData, catalogue)
  const draftProductionLabel = structuredDocument ? buildProductionLabel(structuredDocument, catalogue) : ''
  const hasConfirmedSpecification = productionSpecification?.status === 'confirmed'
  const specificationLabel = productionSpecification?.productionLabel
    ?? (draftProductionLabel && draftProductionLabel !== 'Location TBC' ? draftProductionLabel : null)
  const effectiveLabel = (hasConfirmedSpecification ? specificationLabel : item.manualLabelOverride ?? specificationLabel)
    ?? item.generatedLabel
    ?? truncateDescription(item.originalDescription)
  const isLabelPending = !hasConfirmedSpecification
    && !item.manualLabelOverride
    && !item.generatedLabel
    && (item.labelStatus === 'pending' || item.labelStatus === 'failed')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [retryLabel, setRetryLabel] = useState<string | null>(null)
  const [enrichmentStatus, setEnrichmentStatus] = useState(item.enrichmentStatus ?? null)
  const [enrichmentRetryState, setEnrichmentRetryState] = useState<'idle' | 'retrying' | 'error'>('idle')
  const [sourceChanged, setSourceChanged] = useState(Boolean(productionSpecification?.sourceChanged))

  async function retryEnrichment() {
    setEnrichmentRetryState('retrying')
    try {
      await retryWorkOrderItemProductionSpecificationEnrichmentAction(item.id)
      setEnrichmentStatus({ status: 'queued', lastSafeError: null })
      setEnrichmentRetryState('idle')
    } catch {
      setEnrichmentRetryState('error')
    }
  }

  async function saveLabel(label: string) {
    setSaveStatus('saving')
    setSaveError(null)

    const formData = new FormData()
    formData.set('label', label)

    try {
      await updateWorkOrderItemLabelAction(item.id, formData)
      setRetryLabel(null)
      setSaveStatus('saved')
    } catch (error) {
      setRetryLabel(label)
      setSaveError(error instanceof Error ? error.message : 'Label could not be saved.')
      setSaveStatus('error')
    }
  }

  async function createSpecificationDraft() {
    const emptyDraft = createEmptyProductionSpecification()
    setCreateStatus('saving')
    setCreateError(null)
    setProductionSpecification({
      id: `draft-${item.id}`,
      status: 'needs_review',
      draftData: emptyDraft,
      confirmedData: null,
      productionLabel: null,
      confirmedAt: null,
      history: [],
    })
    setLocalSpecificationDocument(emptyDraft)
    try {
      const saved = await saveWorkOrderItemProductionSpecificationDraftAction(item.id, emptyDraft, {
        expectedConfirmedRevision: productionSpecification?.confirmedRevision ?? 0,
        expectedDraftRevision: productionSpecification?.draftRevision ?? 0,
      })
      setProductionSpecification((current) => current ? { ...current, ...saved } : current)
      setCreateStatus('idle')
    } catch (error) {
      setProductionSpecification(null)
      setLocalSpecificationDocument(null)
      setCreateStatus('error')
      setCreateError(error instanceof Error ? error.message : 'Production Specification draft could not be created.')
    }
  }

  async function startSpecificationCorrection() {
    const confirmedDocument = safeProductionSpecification(productionSpecification?.confirmedData, catalogue)
    if (!productionSpecification || !confirmedDocument) return
    setCreateStatus('saving')
    setCreateError(null)
    try {
      const saved = await saveWorkOrderItemProductionSpecificationDraftAction(item.id, confirmedDocument, {
        expectedConfirmedRevision: productionSpecification.confirmedRevision ?? 0,
        expectedDraftRevision: productionSpecification.draftRevision ?? 0,
      })
      setProductionSpecification((current) => current ? {
        ...current,
        ...saved,
        draftData: confirmedDocument,
      } : current)
      setLocalSpecificationDocument(confirmedDocument)
      setCreateStatus('idle')
    } catch (error) {
      setCreateStatus('error')
      setCreateError(error instanceof Error ? error.message : 'Production Specification could not be opened for correction.')
    }
  }

  return (
    <div className="space-y-1" role="cell">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-gray-700">Qty {formatQuantity(item.quantity)}</span>
        {item.itemCode ? (
          <span className="inline-flex items-center rounded bg-[#142B3A] px-2 py-0.5 font-mono text-sm font-semibold tracking-wide text-white shadow-sm">
            {item.itemCode}
          </span>
        ) : (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">No item code</span>
        )}
      </div>
      <div title={hoverDetail} className="flex flex-wrap items-center gap-2 text-gray-950">
        {canEdit && !hasConfirmedSpecification ? (
          <>
            <form
              className="flex min-w-[260px] flex-1 gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                const formData = new FormData(event.currentTarget)
                void saveLabel(String(formData.get('label') ?? ''))
              }}
            >
              <input
                key={effectiveLabel}
                aria-label={`Short label for ${item.itemCode ?? 'item'}`}
                name="label"
                defaultValue={effectiveLabel}
                required
                maxLength={160}
                className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-950"
              />
              <button
                type="submit"
                disabled={saveStatus === 'saving'}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-wait disabled:opacity-60"
              >
                Save label
              </button>
            </form>
            <form
              action={regenerateWorkOrderItemLabelAction.bind(null, item.id)}
              onSubmit={(event) => {
                if (!window.confirm('Regenerate this label with AI? This will replace the current label.')) {
                  event.preventDefault()
                }
              }}
            >
              <button type="submit" className="rounded border border-[var(--brand-strong)] bg-surface px-2 py-1 text-xs font-medium text-[var(--brand-strong)] hover:bg-surface-subtle">
                Regenerate with AI
              </button>
            </form>
            <SaveStatus
              status={saveStatus}
              errorMessage={saveError}
              onRetry={retryLabel === null ? null : () => void saveLabel(retryLabel)}
            />
          </>
        ) : (
          <span className="line-clamp-2 whitespace-pre-line">{effectiveLabel}</span>
        )}
        {isLabelPending && (
          <span className="rounded bg-[var(--state-info-soft)] px-2 py-0.5 text-xs font-medium text-text-primary">Label pending</span>
        )}
        {item.labelStatus === 'source_changed' && (
          <span className="rounded bg-[var(--state-warning-soft)] px-2 py-0.5 text-xs font-medium text-[var(--state-warning)]">Source description changed</span>
        )}
        {sourceChanged && (
          <span className="rounded bg-[var(--state-warning-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--state-warning)]">Source Changed</span>
        )}
        {!item.isActive && (
          <span className="rounded bg-[var(--state-warning-soft)] px-2 py-0.5 text-xs font-medium text-[var(--state-warning)]">Removed</span>
        )}
      </div>
      {productionSpecificationsEnabled && enrichmentStatus?.status === 'queued' && (
        <div className="mt-2 rounded border border-[var(--state-info)] bg-[var(--state-info-soft)] px-2 py-1 text-xs text-text-primary" role="status">
          Enrichment queued
        </div>
      )}
      {productionSpecificationsEnabled && enrichmentStatus?.status === 'processing' && (
        <div className="mt-2 rounded border border-[var(--state-info)] bg-[var(--state-info-soft)] px-2 py-1 text-xs text-text-primary" role="status">
          Enrichment processing
        </div>
      )}
      {productionSpecificationsEnabled && enrichmentStatus?.status === 'failed' && (
        <div className="mt-2 space-y-1 rounded border border-[var(--state-critical)] bg-[var(--state-critical-soft)] px-2 py-1 text-xs text-[var(--state-critical)]" role="status">
          {canManageSpecification ? (
            <button
              type="button"
              disabled={enrichmentRetryState === 'retrying'}
              onClick={() => void retryEnrichment()}
              className="font-semibold underline disabled:cursor-wait disabled:opacity-60"
            >
              Enrichment failed - Retry
            </button>
          ) : (
            <span>Enrichment failed</span>
          )}
          {enrichmentRetryState === 'error' && <p role="alert">Enrichment retry could not be queued.</p>}
        </div>
      )}
      {canManageSpecification && !productionSpecification && !enrichmentStatus && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={createStatus === 'saving'}
            onClick={() => void createSpecificationDraft()}
            className="rounded border border-[var(--brand-strong)] bg-surface px-2 py-1 text-xs font-semibold text-[var(--brand-strong)] disabled:cursor-wait disabled:opacity-60"
          >
            Create specification draft
          </button>
          {createStatus === 'saving' && <span role="status" className="text-xs text-[var(--state-info)]">Creating draft</span>}
          {createStatus === 'error' && <span role="alert" className="text-xs text-[var(--state-critical)]">{createError}</span>}
        </div>
      )}
      {productionSpecification && structuredDocument && (
        <ProductionSpecificationDetails
          item={item}
          persisted={productionSpecification}
          specification={structuredDocument}
          draftSpecification={draftSpecificationDocument}
          canManage={canManageSpecification}
          correctionStatus={createStatus}
          correctionError={createError}
          onStartCorrection={() => void startSpecificationCorrection()}
          sourceChanged={sourceChanged}
          onSourceIgnored={() => setSourceChanged(false)}
          onSourceDraftCreated={(saved) => {
            setProductionSpecification((current) => current ? { ...current, ...saved } : current)
          }}
          catalogue={catalogue}
        />
      )}
    </div>
  )
}

function ItemOperationalField({
  item,
  options,
  field,
  canEdit,
}: {
  item: WorkOrderItemSummaryRow
  options: WorkOrderItemOptions
  field: WorkOrderItemOperationalField
  canEdit: boolean
}) {
  const definition = operationalFieldDefinition(item, options, field)
  if (!canEdit) {
    return (
      <div role="cell">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{operationalFieldLabel(field)}</p>
        <p className="mt-1 text-xs text-gray-900">{readOnlyOperationalValue(item, field)}</p>
      </div>
    )
  }

  return (
    <EditableOperationalField
      itemId={item.id}
      itemLabel={item.itemCode ?? 'item'}
      field={field}
      initialValue={definition.value}
      options={definition.options}
      type={definition.type}
    />
  )
}

function operationalFieldDefinition(
  item: WorkOrderItemSummaryRow,
  options: WorkOrderItemOptions,
  field: WorkOrderItemOperationalField,
) {
  if (field === 'installer') return { value: item.installerId ?? '', options: options.installers }
  if (field === 'stage') return { value: item.stageOptionId ?? '', options: options.stages }
  if (field === 'hardware') return { value: item.hardwareStatusOptionId ?? '', options: options.hardwareStatuses }
  if (field === 'maintenanceProgram') return { value: item.maintenanceProgram ? 'yes' : 'no', options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] }
  if (field === 'installDate') return { value: item.installDate ?? '', type: 'date' as const }
  if (field === 'dateCompleted') return { value: item.dateCompleted ?? '', type: 'date' as const }
  if (field === 'risk') return { value: item.riskLevel ?? '', options: levelOptions() }
  return { value: item.importance ?? '', options: levelOptions() }
}

function configuredItemFields(fields: ItemFieldConfig[] | undefined) {
  return (fields ?? DEFAULT_ITEM_FIELDS)
    .filter((field) => field.visible && (field.id === 'item' || OPERATIONAL_FIELD_BY_SUMMARY_ID[field.id]))
    .sort((a, b) => a.order - b.order)
}

function EditableOperationalField({
  itemId,
  itemLabel,
  field,
  initialValue,
  options,
  type,
}: {
  itemId: string
  itemLabel: string
  field: WorkOrderItemOperationalField
  initialValue: string
  options?: FilterOption[]
  type?: 'date'
}) {
  const [value, setValue] = useState(initialValue)
  const [persistedValue, setPersistedValue] = useState(initialValue)
  const [retryValue, setRetryValue] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const label = operationalFieldLabel(field)

  async function save(nextValue: string) {
    setValue(nextValue)
    setStatus('saving')
    setErrorMessage(null)

    try {
      await updateWorkOrderItemOperationalFieldAction(itemId, field, nextValue)
      setPersistedValue(nextValue)
      setRetryValue(null)
      setStatus('saved')
    } catch (error) {
      setValue(persistedValue)
      setRetryValue(nextValue)
      setErrorMessage(error instanceof Error ? error.message : `${label} could not be saved.`)
      setStatus('error')
    }
  }

  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-600">{label}</dt>
      <dd className="mt-1">
        {type === 'date' ? (
          <input
            aria-label={`${label} for ${itemLabel}`}
            type="date"
            value={value}
            onChange={(event) => void save(event.target.value)}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-950"
          />
        ) : (
          <select
            aria-label={`${label} for ${itemLabel}`}
            value={value}
            onChange={(event) => void save(event.target.value)}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-950"
          >
            {field !== 'maintenanceProgram' && <option value="">None</option>}
            {options?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        )}
        <SaveStatus
          status={status}
          errorMessage={errorMessage}
          onRetry={retryValue === null ? null : () => void save(retryValue)}
        />
      </dd>
    </div>
  )
}

function SaveStatus({
  status,
  errorMessage,
  onRetry,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error'
  errorMessage: string | null
  onRetry: (() => void) | null
}) {
  if (status === 'idle') return null
  if (status === 'saving') return <span className="mt-1 block text-[11px] text-sky-700">Saving</span>
  if (status === 'saved') return <span className="mt-1 block text-[11px] text-green-700">Saved</span>
  return (
    <span className="mt-1 block text-[11px] text-red-700" role="alert">
      {errorMessage ?? 'Save failed.'}{' '}
      {onRetry && <button type="button" onClick={onRetry} className="font-semibold underline">Retry</button>}
    </span>
  )
}

function readOnlyOperationalValue(item: WorkOrderItemSummaryRow, field: WorkOrderItemOperationalField) {
  if (field === 'installer') return item.installerName ?? '-'
  if (field === 'stage') return item.stageName ?? '-'
  if (field === 'hardware') return item.hardwareStatusName ?? '-'
  if (field === 'maintenanceProgram') return item.maintenanceProgram ? 'Yes' : 'No'
  if (field === 'installDate') return item.installDate ?? '-'
  if (field === 'dateCompleted') return item.dateCompleted ?? '-'
  if (field === 'risk') return item.riskLevel ? titleCase(item.riskLevel) : '-'
  return item.importance ? titleCase(item.importance) : '-'
}

function levelOptions(): FilterOption[] {
  return [
    { id: 'high', label: 'High' },
    { id: 'medium', label: 'Medium' },
    { id: 'low', label: 'Low' },
  ]
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function ItemCount({ count }: { count: number }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
      {count} active {count === 1 ? 'item' : 'items'}
    </p>
  )
}

function formatQuantity(quantity: string) {
  const parsed = Number(quantity)
  return Number.isFinite(parsed) ? String(parsed) : quantity
}

function productionSpecificationStateKey(item: WorkOrderItemSummaryRow, enabled: boolean) {
  const specification = item.productionSpecification
  return [
    enabled ? 'enabled' : 'disabled',
    specification?.id ?? 'none',
    specification?.confirmedRevision ?? 0,
    specification?.draftRevision ?? 0,
    specification?.currentSourceDescriptionFingerprint ?? 'no-source',
    specification?.sourceChanged ? 'changed' : 'unchanged',
  ].join(':')
}

function truncateDescription(description: string) {
  return description.length > 80 ? `${description.slice(0, 77)}...` : description
}
