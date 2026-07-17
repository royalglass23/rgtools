'use client'

import { useState } from 'react'
import {
  regenerateWorkOrderItemLabelAction,
  updateWorkOrderItemLabelAction,
  updateWorkOrderItemOperationalFieldAction,
} from './actions'
import { operationalFieldLabel, type WorkOrderItemOperationalField } from './item-operational-fields'
import {
  confirmWorkOrderItemProductionSpecificationAction,
  retryWorkOrderItemProductionSpecificationEnrichmentAction,
  saveWorkOrderItemProductionSpecificationDraftAction,
} from './production-specification-actions'
import {
  buildProductionLabel,
  createEmptyProductionSpecification,
  INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
  parsePersistedProductionSpecification,
  productionSpecificationValueLabel,
  type ProductionSpecification,
  type ProductionSpecificationCatalogueOption,
  type ProductionSpecificationComponent,
  type ProductionSpecificationFieldName,
  type ProductionSpecificationMeasurement,
  type ProductionSpecificationRequirement,
  type ProductionSpecificationValue,
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
    ? 'border-[#142B3A]/25 bg-[#E8EEF1]'
    : 'border-[#142B3A]/20 bg-white'

  return (
    <section aria-label="Work Order items" className="space-y-2 px-4 py-3">
      {showCount && <ItemCount count={activeItemCount} />}
      <div className="grid gap-2">
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
                  item={item}
                  hoverDetail={hoverDetail}
                  canEdit={canManage && itemField.editable && item.isActive}
                  canManageSpecification={productionSpecificationsEnabled && canManage && item.isActive}
                  productionSpecificationsEnabled={productionSpecificationsEnabled}
                  catalogue={catalogue}
                />
              )}
              {operationalFields.length > 0 && (
                <div
                  role="group"
                  aria-label="Work Order item controls"
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"
                >
                  {operationalFields.map(({ config, field }) => (
                    <ItemOperationalField
                      key={config.id}
                      item={item}
                      options={options}
                      field={field}
                      canEdit={canManage && config.editable && item.isActive}
                    />
                  ))}
                </div>
              )}
              {!item.isActive && !visibleFields.some((field) => field.id === 'item') && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Removed</span>
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
  const draftProductionLabel = structuredDocument ? buildProductionLabel(structuredDocument, catalogue) : ''
  const effectiveLabel = item.manualLabelOverride
    ?? productionSpecification?.productionLabel
    ?? (draftProductionLabel && draftProductionLabel !== 'Location TBC' ? draftProductionLabel : null)
    ?? item.generatedLabel
    ?? truncateDescription(item.originalDescription)
  const isLabelPending = !item.manualLabelOverride
    && !item.generatedLabel
    && (item.labelStatus === 'pending' || item.labelStatus === 'failed')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [retryLabel, setRetryLabel] = useState<string | null>(null)
  const [enrichmentStatus, setEnrichmentStatus] = useState(item.enrichmentStatus ?? null)
  const [enrichmentRetryState, setEnrichmentRetryState] = useState<'idle' | 'retrying' | 'error'>('idle')

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
      const saved = await saveWorkOrderItemProductionSpecificationDraftAction(item.id, emptyDraft)
      setProductionSpecification((current) => current ? { ...current, id: saved.id } : current)
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
      const saved = await saveWorkOrderItemProductionSpecificationDraftAction(item.id, confirmedDocument)
      setProductionSpecification((current) => current ? {
        ...current,
        id: saved.id,
        status: 'needs_review',
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
        {canEdit ? (
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
              <button type="submit" className="rounded border border-sky-300 bg-white px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-50">
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
          <span className="line-clamp-2">{effectiveLabel}</span>
        )}
        {isLabelPending && (
          <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">Label pending</span>
        )}
        {item.labelStatus === 'source_changed' && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Source description changed</span>
        )}
        {!item.isActive && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Removed</span>
        )}
      </div>
      {productionSpecificationsEnabled && enrichmentStatus?.status === 'queued' && (
        <div className="mt-2 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-900" role="status">
          Enrichment queued
        </div>
      )}
      {productionSpecificationsEnabled && enrichmentStatus?.status === 'processing' && (
        <div className="mt-2 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-900" role="status">
          Enrichment processing
        </div>
      )}
      {productionSpecificationsEnabled && enrichmentStatus?.status === 'failed' && (
        <div className="mt-2 space-y-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-900" role="status">
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
      {productionSpecificationsEnabled && enrichmentStatus && (
        <p className="text-xs text-gray-600">{item.originalDescription}</p>
      )}
      {canManageSpecification && !productionSpecification && !enrichmentStatus && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={createStatus === 'saving'}
            onClick={() => void createSpecificationDraft()}
            className="rounded border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-900 disabled:cursor-wait disabled:opacity-60"
          >
            Create specification draft
          </button>
          {createStatus === 'saving' && <span role="status" className="text-xs text-sky-700">Creating draft</span>}
          {createStatus === 'error' && <span role="alert" className="text-xs text-red-700">{createError}</span>}
        </div>
      )}
      {productionSpecification && structuredDocument && (
        <ProductionSpecificationDetails
          item={item}
          persisted={productionSpecification}
          specification={structuredDocument}
          canManage={canManageSpecification}
          correctionStatus={createStatus}
          correctionError={createError}
          onStartCorrection={() => void startSpecificationCorrection()}
          catalogue={catalogue}
        />
      )}
    </div>
  )
}

function ProductionSpecificationDetails({
  item,
  persisted,
  specification,
  canManage,
  correctionStatus,
  correctionError,
  onStartCorrection,
  catalogue,
}: {
  item: WorkOrderItemSummaryRow
  persisted: WorkOrderItemProductionSpecificationSummary
  specification: ProductionSpecification
  canManage: boolean
  correctionStatus: 'idle' | 'saving' | 'error'
  correctionError: string | null
  onStartCorrection: () => void
  catalogue: readonly ProductionSpecificationCatalogueOption[]
}) {
  return (
    <details className="mt-2 rounded border border-sky-200 bg-sky-50/60 px-3 py-2">
      <summary className="cursor-pointer rounded text-xs font-semibold text-sky-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600">
        View specification
      </summary>
      <div className="mt-3 space-y-4 text-xs text-gray-800">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 font-semibold ${persisted.status === 'confirmed'
            ? 'bg-green-100 text-green-800'
            : 'bg-amber-100 text-amber-800'}`}
          >
            {persisted.status === 'confirmed' ? 'Confirmed' : 'Needs Review'}
          </span>
          {persisted.confirmedAt && (
            <span>Confirmed {formatDateTime(persisted.confirmedAt)}</span>
          )}
        </div>

        <section aria-label="Original ServiceM8 description">
          <h4 className="font-semibold text-gray-950">Original ServiceM8 description</h4>
          <p className="mt-1 whitespace-pre-wrap">{item.originalDescription}</p>
        </section>

        {(persisted.evidenceData?.length ?? 0) > 0 && (
          <section aria-label="Source evidence">
            <h4 className="font-semibold text-gray-950">Source evidence</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {persisted.evidenceData?.map((entry, index) => (
                <li key={`${String(entry.field ?? 'evidence')}-${index}`}>
                  {String(entry.field ?? 'Field')}: {String(entry.sourceText ?? '')}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(persisted.ambiguityFlags?.length ?? 0) > 0 && (
          <section aria-label="Review flags">
            <h4 className="font-semibold text-gray-950">Review flags</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {persisted.ambiguityFlags?.map((flag) => <li key={flag}>{flag}</li>)}
            </ul>
          </section>
        )}

        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          {SPECIFICATION_FIELDS.map(({ field, label }) => (
            <div key={field}>
              <dt className="font-medium text-gray-600">{label}</dt>
              <dd className="mt-0.5 text-gray-950">{productionSpecificationValueLabel(specification[field], catalogue)}</dd>
            </div>
          ))}
        </dl>

        {specification.measurements.length > 0 && (
          <section aria-label="Measurements">
            <h4 className="font-semibold text-gray-950">Measurements</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {specification.measurements.map((measurement, index) => (
                <li key={`${measurement.kind}-${index}`}>
                  {measurement.label ? `${measurement.label}: ` : ''}{measurement.value} {measurement.unit}
                </li>
              ))}
            </ul>
          </section>
        )}

        {specification.additionalComponents.length > 0 && (
          <section aria-label="Additional Components">
            <h4 className="font-semibold text-gray-950">Additional Components</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {specification.additionalComponents.map((component, index) => (
                <li key={`${component.name}-${index}`}>
                  {component.name}{component.quantity ? ` - Qty ${component.quantity}` : ''}
                  {component.dimensions ? ` - ${component.dimensions}` : ''}
                  {component.material ? ` - ${component.material}` : ''}
                  {component.finish ? ` - ${component.finish}` : ''}
                  {component.notes ? ` - ${component.notes}` : ''}
                </li>
              ))}
            </ul>
          </section>
        )}

        {specification.specialRequirements.length > 0 && (
          <section aria-label="Special Requirements">
            <h4 className="font-semibold text-gray-950">Special Requirements</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {specification.specialRequirements.map((requirement, index) => (
                <li key={`${requirement.kind}-${index}`}>{requirement.detail}</li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Production Specification history">
          <h4 className="font-semibold text-gray-950">History</h4>
          {persisted.history.length === 0 ? (
            <p className="mt-1 text-gray-600">No confirmed changes yet.</p>
          ) : (
            <ol className="mt-1 space-y-2">
              {persisted.history.map((revision) => (
                <li key={revision.id} className="rounded border border-gray-200 bg-white px-2 py-1.5">
                  <span className="font-medium">
                    {revision.revisionType === 'baseline_confirmed' ? 'Baseline confirmed' : 'Specification updated'}
                    {' by '}{revision.actorUsername ?? 'Unknown user'}
                  </span>
                  {' - '}{formatDateTime(revision.createdAt)}
                  {revision.reasonCode ? ` - ${revision.reasonCode}` : ''}
                  {revision.note ? `: ${revision.note}` : ''}
                </li>
              ))}
            </ol>
          )}
        </section>

        {canManage && persisted.status === 'confirmed' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={correctionStatus === 'saving'}
              onClick={onStartCorrection}
              className="rounded border border-sky-700 bg-white px-3 py-1.5 font-semibold text-sky-800 disabled:cursor-wait disabled:opacity-60"
            >
              Change specification
            </button>
            {correctionStatus === 'saving' && <span role="status">Opening correction draft</span>}
            {correctionStatus === 'error' && <span role="alert" className="text-red-700">{correctionError}</span>}
          </div>
        )}

        {canManage && persisted.status === 'needs_review' && (
          <ProductionSpecificationEditor
            itemId={item.id}
            itemCode={item.itemCode ?? 'item'}
            initialSpecification={specification}
            catalogue={catalogue}
          />
        )}
      </div>
    </details>
  )
}

function ProductionSpecificationEditor({
  itemId,
  itemCode,
  initialSpecification,
  catalogue,
}: {
  itemId: string
  itemCode: string
  initialSpecification: ProductionSpecification
  catalogue: readonly ProductionSpecificationCatalogueOption[]
}) {
  const [draft, setDraft] = useState(initialSpecification ?? createEmptyProductionSpecification())
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'confirming' | 'confirmed' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function updateField(field: ProductionSpecificationFieldName, value: ProductionSpecificationValue) {
    setDraft((current) => ({ ...current, [field]: value }))
    setDirty(true)
    setStatus('idle')
    setErrorMessage(null)
  }

  async function saveDraft() {
    setStatus('saving')
    setErrorMessage(null)
    try {
      await saveWorkOrderItemProductionSpecificationDraftAction(itemId, draft)
      setDirty(false)
      setStatus('saved')
      return true
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Production Specification draft could not be saved.')
      return false
    }
  }

  async function confirmDraft() {
    if (dirty && !(await saveDraft())) return
    setStatus('confirming')
    setErrorMessage(null)
    try {
      await confirmWorkOrderItemProductionSpecificationAction(itemId)
      setStatus('confirmed')
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Production Specification could not be confirmed.')
    }
  }

  const actionPending = status === 'saving' || status === 'confirming'

  return (
    <section aria-label="Edit Production Specification" className="rounded border border-gray-300 bg-white p-3">
      <h4 className="font-semibold text-gray-950">Review and correct draft</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SPECIFICATION_FIELDS.map(({ field, label }) => (
          <SpecificationChoiceEditor
            key={field}
            field={field}
            label={label}
            itemCode={itemCode}
            value={draft[field]}
            catalogue={catalogue}
            onChange={(value) => updateField(field, value)}
          />
        ))}
      </div>
      <RepeatableSpecificationEditor
        measurements={draft.measurements}
        components={draft.additionalComponents}
        requirements={draft.specialRequirements}
        onMeasurementsChange={(measurements) => {
          setDraft((current) => ({ ...current, measurements }))
          setDirty(true)
          setStatus('idle')
        }}
        onComponentsChange={(additionalComponents) => {
          setDraft((current) => ({ ...current, additionalComponents }))
          setDirty(true)
          setStatus('idle')
        }}
        onRequirementsChange={(specialRequirements) => {
          setDraft((current) => ({ ...current, specialRequirements }))
          setDirty(true)
          setStatus('idle')
        }}
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={actionPending}
          onClick={() => void saveDraft()}
          className="rounded border border-sky-700 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 disabled:cursor-wait disabled:opacity-60"
        >
          Save draft
        </button>
        <button
          type="button"
          disabled={actionPending}
          onClick={() => void confirmDraft()}
          className="rounded bg-[#142B3A] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"
        >
          Confirm specification
        </button>
        {status === 'saving' && <span role="status">Saving draft</span>}
        {status === 'saved' && <span role="status" className="text-green-700">Draft saved</span>}
        {status === 'confirming' && <span role="status">Confirming specification</span>}
        {status === 'confirmed' && <span role="status" className="text-green-700">Specification confirmed</span>}
        {status === 'error' && <span role="alert" className="text-red-700">{errorMessage}</span>}
      </div>
    </section>
  )
}

function RepeatableSpecificationEditor({
  measurements,
  components,
  requirements,
  onMeasurementsChange,
  onComponentsChange,
  onRequirementsChange,
}: {
  measurements: ProductionSpecificationMeasurement[]
  components: ProductionSpecificationComponent[]
  requirements: ProductionSpecificationRequirement[]
  onMeasurementsChange: (value: ProductionSpecificationMeasurement[]) => void
  onComponentsChange: (value: ProductionSpecificationComponent[]) => void
  onRequirementsChange: (value: ProductionSpecificationRequirement[]) => void
}) {
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <fieldset className="rounded border border-gray-200 p-3">
        <legend className="px-1 font-semibold text-gray-950">Measurements</legend>
        <div className="space-y-3">
          {measurements.map((measurement, index) => (
            <div key={index} className="grid grid-cols-2 gap-2 rounded bg-gray-50 p-2">
              <label>Kind
                <select
                  aria-label={`Measurement kind ${index + 1}`}
                  value={measurement.kind}
                  onChange={(event) => onMeasurementsChange(replaceAt(measurements, index, {
                    ...measurement,
                    kind: event.target.value as ProductionSpecificationMeasurement['kind'],
                  }))}
                  className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1"
                >
                  {MEASUREMENT_KINDS.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
                </select>
              </label>
              <label>Label
                <input
                  aria-label={`Measurement label ${index + 1}`}
                  value={measurement.label ?? ''}
                  maxLength={80}
                  onChange={(event) => onMeasurementsChange(replaceAt(measurements, index, {
                    ...measurement,
                    ...(event.target.value ? { label: event.target.value } : { label: undefined }),
                  }))}
                  className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1"
                />
              </label>
              <label>Value
                <input
                  aria-label={`Measurement value ${index + 1}`}
                  value={measurement.value}
                  required
                  maxLength={40}
                  onChange={(event) => onMeasurementsChange(replaceAt(measurements, index, { ...measurement, value: event.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1"
                />
              </label>
              <label>Unit
                <select
                  aria-label={`Measurement unit ${index + 1}`}
                  value={measurement.unit}
                  onChange={(event) => onMeasurementsChange(replaceAt(measurements, index, {
                    ...measurement,
                    unit: event.target.value as ProductionSpecificationMeasurement['unit'],
                  }))}
                  className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1"
                >
                  {MEASUREMENT_UNITS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => onMeasurementsChange(removeAt(measurements, index))} className="col-span-2 justify-self-start text-red-700">
                Remove measurement {index + 1}
              </button>
            </div>
          ))}
          <button type="button" onClick={() => onMeasurementsChange([...measurements, { kind: 'other', value: '', unit: 'mm' }])} className="rounded border border-gray-300 bg-white px-2 py-1 font-medium">
            Add measurement
          </button>
        </div>
      </fieldset>

      <fieldset className="rounded border border-gray-200 p-3">
        <legend className="px-1 font-semibold text-gray-950">Additional Components</legend>
        <div className="space-y-3">
          {components.map((component, index) => (
            <div key={index} className="grid grid-cols-2 gap-2 rounded bg-gray-50 p-2">
              {COMPONENT_FIELDS.map(({ key, label, maxLength }) => (
                <label key={key} className={key === 'notes' ? 'col-span-2' : ''}>{label}
                  <input
                    aria-label={`Component ${label.toLowerCase()} ${index + 1}`}
                    value={component[key] ?? ''}
                    required={key === 'name'}
                    maxLength={maxLength}
                    onChange={(event) => onComponentsChange(replaceAt(components, index, {
                      ...component,
                      [key]: event.target.value || undefined,
                    }))}
                    className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1"
                  />
                </label>
              ))}
              <button type="button" onClick={() => onComponentsChange(removeAt(components, index))} className="col-span-2 justify-self-start text-red-700">
                Remove component {index + 1}
              </button>
            </div>
          ))}
          <button type="button" onClick={() => onComponentsChange([...components, { name: '' }])} className="rounded border border-gray-300 bg-white px-2 py-1 font-medium">
            Add component
          </button>
        </div>
      </fieldset>

      <fieldset className="rounded border border-gray-200 p-3">
        <legend className="px-1 font-semibold text-gray-950">Special Requirements</legend>
        <div className="space-y-3">
          {requirements.map((requirement, index) => (
            <div key={index} className="space-y-2 rounded bg-gray-50 p-2">
              <label>Kind
                <select
                  aria-label={`Special requirement kind ${index + 1}`}
                  value={requirement.kind}
                  onChange={(event) => onRequirementsChange(replaceAt(requirements, index, {
                    ...requirement,
                    kind: event.target.value as ProductionSpecificationRequirement['kind'],
                  }))}
                  className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1"
                >
                  {REQUIREMENT_KINDS.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
                </select>
              </label>
              <label>Detail
                <textarea
                  aria-label={`Special requirement detail ${index + 1}`}
                  value={requirement.detail}
                  required
                  maxLength={1_000}
                  onChange={(event) => onRequirementsChange(replaceAt(requirements, index, { ...requirement, detail: event.target.value }))}
                  className="mt-1 min-h-16 w-full rounded border border-gray-300 bg-white px-2 py-1"
                />
              </label>
              <button type="button" onClick={() => onRequirementsChange(removeAt(requirements, index))} className="text-red-700">
                Remove special requirement {index + 1}
              </button>
            </div>
          ))}
          <button type="button" onClick={() => onRequirementsChange([...requirements, { kind: 'other', detail: '' }])} className="rounded border border-gray-300 bg-white px-2 py-1 font-medium">
            Add special requirement
          </button>
        </div>
      </fieldset>
    </div>
  )
}

const MEASUREMENT_KINDS: ProductionSpecificationMeasurement['kind'][] = ['quantity', 'length', 'width', 'height', 'diameter', 'other']
const MEASUREMENT_UNITS: ProductionSpecificationMeasurement['unit'][] = ['mm', 'm', 'each', 'other']
const REQUIREMENT_KINDS: ProductionSpecificationRequirement['kind'][] = ['standard', 'design_constraint', 'inclusion', 'exclusion', 'template', 'drawing', 'other']
const COMPONENT_FIELDS: Array<{ key: keyof ProductionSpecificationComponent; label: string; maxLength: number }> = [
  { key: 'name', label: 'Name', maxLength: 160 },
  { key: 'quantity', label: 'Quantity', maxLength: 40 },
  { key: 'dimensions', label: 'Dimensions', maxLength: 120 },
  { key: 'material', label: 'Material', maxLength: 120 },
  { key: 'finish', label: 'Finish', maxLength: 120 },
  { key: 'notes', label: 'Notes', maxLength: 500 },
]

function replaceAt<T>(values: T[], index: number, replacement: T) {
  return values.map((value, currentIndex) => currentIndex === index ? replacement : value)
}

function removeAt<T>(values: T[], index: number) {
  return values.filter((_, currentIndex) => currentIndex !== index)
}

function SpecificationChoiceEditor({
  field,
  label,
  itemCode,
  value,
  catalogue,
  onChange,
}: {
  field: ProductionSpecificationFieldName
  label: string
  itemCode: string
  value: ProductionSpecificationValue
  catalogue: readonly ProductionSpecificationCatalogueOption[]
  onChange: (value: ProductionSpecificationValue) => void
}) {
  const options = catalogue.filter((option) => option.field === field && option.isActive !== false)
  const selectedValue = value.state === 'selected'
    ? value.catalogueId
    : value.state === 'unmapped' ? '__unmapped' : '__tbc'

  return (
    <div>
      <label className="block font-medium text-gray-700">
        {label}
        <select
          aria-label={`${label} for ${itemCode}`}
          value={selectedValue}
          onChange={(event) => {
            const next = event.target.value
            if (next === '__tbc') return onChange({ state: 'tbc' })
            if (next === '__unmapped') return onChange({ state: 'unmapped', raw: value.state === 'unmapped' ? value.raw : 'Needs review' })
            onChange({ state: 'selected', catalogueId: next })
          }}
          className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-950"
        >
          <option value="__tbc">TBC</option>
          {options.map((option) => <option key={option.id} value={option.id}>{option.displayLabel}</option>)}
          <option value="__unmapped">Unmapped - Needs Review</option>
        </select>
      </label>
      {value.state === 'unmapped' && (
        <label className="mt-2 block font-medium text-gray-700">
          {label} unmapped value
          <input
            aria-label={`${label} unmapped value for ${itemCode}`}
            value={value.raw}
            required
            maxLength={240}
            onChange={(event) => onChange({ state: 'unmapped', raw: event.target.value })}
            className="mt-1 w-full rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-gray-950"
          />
        </label>
      )}
    </div>
  )
}

const SPECIFICATION_FIELDS: Array<{
  field: keyof Pick<ProductionSpecification,
    'system' | 'structureMaterial' | 'structureType' | 'locationEnvironment' | 'locationDetail'
    | 'structureBuilt' | 'glassConstruction' | 'glassAppearance' | 'thickness' | 'gateRequired'
    | 'doorOpeningType' | 'fixingMethod' | 'hardwareFinish' | 'systemFinish' | 'interlinkingRail'
    | 'deliveryScope'>
  label: string
}> = [
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
]

function safeProductionSpecification(
  value: unknown,
  catalogue: readonly ProductionSpecificationCatalogueOption[],
) {
  if (!value) return null
  try {
    return parsePersistedProductionSpecification(value, catalogue)
  } catch {
    return null
  }
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Pacific/Auckland',
  }).format(new Date(value))
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
      <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</dt>
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

function truncateDescription(description: string) {
  return description.length > 80 ? `${description.slice(0, 77)}...` : description
}
