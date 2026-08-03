'use client'

import { useRef, useState } from 'react'
import {
  confirmWorkOrderItemProductionSpecificationAction,
  createWorkOrderItemProductionSpecificationDraftFromSourceChangeAction,
  ignoreWorkOrderItemProductionSpecificationSourceChangeAction,
  saveWorkOrderItemProductionSpecificationDraftAction,
} from './production-specification-actions'
import {
  createEmptyProductionSpecification,
  parsePersistedProductionSpecification,
  PRODUCTION_SPECIFICATION_CHANGE_REASONS,
  productionSpecificationValueLabel,
  type ProductionSpecification,
  type ProductionSpecificationCatalogueOption,
  type ProductionSpecificationChangeReasonCode,
  type ProductionSpecificationFieldName,
  type ProductionSpecificationValue,
} from './production-specifications'
import type {
  WorkOrderItemProductionSpecificationSummary,
  WorkOrderItemSummaryRow,
} from './work-order-items'
export function ProductionSpecificationDetails({
  item,
  persisted,
  specification,
  draftSpecification,
  canManage,
  correctionStatus,
  correctionError,
  onStartCorrection,
  sourceChanged,
  onSourceIgnored,
  onSourceDraftCreated,
  catalogue,
}: {
  item: WorkOrderItemSummaryRow
  persisted: WorkOrderItemProductionSpecificationSummary
  specification: ProductionSpecification
  draftSpecification: ProductionSpecification | null
  canManage: boolean
  correctionStatus: 'idle' | 'saving' | 'error'
  correctionError: string | null
  onStartCorrection: () => void
  sourceChanged: boolean
  onSourceIgnored: () => void
  onSourceDraftCreated: (saved: Partial<WorkOrderItemProductionSpecificationSummary>) => void
  catalogue: readonly ProductionSpecificationCatalogueOption[]
}) {
  const disclosureRef = useRef<HTMLElement>(null)

  function restoreDisclosureFocus() {
    onSourceIgnored()
    window.setTimeout(() => disclosureRef.current?.focus(), 0)
  }

  return (
    <details className="mt-2 rounded border border-border bg-surface-subtle px-3 py-2">
      <summary ref={disclosureRef} className="cursor-pointer rounded text-xs font-semibold text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
        View specification
      </summary>
      <div className="mt-3 space-y-4 text-xs text-text-secondary">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 font-semibold ${persisted.status === 'confirmed'
            ? 'bg-[var(--state-positive-soft)] text-[var(--state-positive)]'
            : 'bg-[var(--state-warning-soft)] text-[var(--state-warning)]'}`}
          >
            {persisted.status === 'confirmed' ? 'Confirmed' : 'Needs Review'}
          </span>
          {persisted.confirmedAt && (
            <span>Confirmed {formatDateTime(persisted.confirmedAt)}</span>
          )}
        </div>

        {sourceChanged && (
          <SourceChangeComparison
            item={item}
            persisted={persisted}
            canManage={canManage}
            onIgnored={restoreDisclosureFocus}
            onDraftCreated={onSourceDraftCreated}
          />
        )}

        {persisted.status === 'confirmed' && !draftSpecification && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SPECIFICATION_FIELDS.map(({ field, label }) => {
              const displayValue = productionSpecificationValueLabel(specification[field], catalogue)
              return (
                <label key={field} className="block font-medium text-text-secondary">
                  {label}
                  <select
                    aria-label={`${label} for ${item.itemCode ?? 'item'}`}
                    value={displayValue}
                    disabled
                    className="mt-1 w-full rounded border border-border bg-surface-subtle px-2 py-1.5 text-xs text-text-primary disabled:opacity-100"
                  >
                    <option value={displayValue}>{displayValue}</option>
                  </select>
                </label>
              )
            })}
          </div>
        )}

        {canManage && persisted.status === 'confirmed' && !draftSpecification && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={correctionStatus === 'saving'}
              onClick={onStartCorrection}
              className="rounded border border-[var(--brand-strong)] bg-surface px-3 py-1.5 font-semibold text-[var(--brand-strong)] disabled:cursor-wait disabled:opacity-60"
            >
              Change specification
            </button>
            {correctionStatus === 'saving' && <span role="status">Opening correction draft</span>}
            {correctionStatus === 'error' && <span role="alert" className="text-[var(--state-critical)]">{correctionError}</span>}
          </div>
        )}

        {canManage && draftSpecification && (
          <ProductionSpecificationEditor
            itemId={item.id}
            itemCode={item.itemCode ?? 'item'}
            initialSpecification={draftSpecification}
            hasConfirmedSpecification={Boolean(persisted.confirmedData)}
            confirmedRevision={persisted.confirmedRevision ?? 0}
            draftRevision={persisted.draftRevision ?? 0}
            catalogue={catalogue}
          />
        )}
      </div>
    </details>
  )
}

function SourceChangeComparison({
  item,
  persisted,
  canManage,
  onIgnored,
  onDraftCreated,
}: {
  item: WorkOrderItemSummaryRow
  persisted: WorkOrderItemProductionSpecificationSummary
  canManage: boolean
  onIgnored: () => void
  onDraftCreated: (saved: Partial<WorkOrderItemProductionSpecificationSummary>) => void
}) {
  const [status, setStatus] = useState<'idle' | 'ignoring' | 'creating' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const currentFingerprint = persisted.currentSourceDescriptionFingerprint

  async function ignoreSourceChange() {
    if (!currentFingerprint) return
    setStatus('ignoring')
    setErrorMessage(null)
    try {
      await ignoreWorkOrderItemProductionSpecificationSourceChangeAction(item.id, {
        expectedConfirmedRevision: persisted.confirmedRevision ?? 0,
        sourceDescriptionFingerprint: currentFingerprint,
      })
      setStatus('idle')
      onIgnored()
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Source change could not be ignored.')
    }
  }

  async function createDraft() {
    if (!currentFingerprint) return
    setStatus('creating')
    setErrorMessage(null)
    try {
      const saved = await createWorkOrderItemProductionSpecificationDraftFromSourceChangeAction(item.id, {
        expectedConfirmedRevision: persisted.confirmedRevision ?? 0,
        expectedDraftRevision: persisted.draftRevision ?? 0,
        sourceDescriptionFingerprint: currentFingerprint,
      })
      onDraftCreated(saved)
      setStatus('idle')
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'A source-change draft could not be created.')
    }
  }

  return (
    <details className="rounded border border-[var(--state-warning)] bg-[var(--state-warning-soft)] px-3 py-2">
      <summary className="cursor-pointer font-semibold text-[var(--state-warning)]">Compare ServiceM8 source</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <section aria-label="Confirmed ServiceM8 source">
          <h4 className="font-semibold text-text-primary">Confirmed source</h4>
          <p className="mt-1 whitespace-pre-wrap">{persisted.sourceDescription ?? 'Confirmed source text is unavailable.'}</p>
        </section>
        <section aria-label="Current ServiceM8 source">
          <h4 className="font-semibold text-text-primary">Current ServiceM8 source</h4>
          <p className="mt-1 whitespace-pre-wrap">{item.originalDescription}</p>
        </section>
      </div>
      {canManage && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={status === 'ignoring' || status === 'creating' || Boolean(persisted.draftData)}
            onClick={() => void ignoreSourceChange()}
            className="rounded border border-[var(--state-warning)] bg-surface px-3 py-1.5 font-semibold text-[var(--state-warning)] disabled:cursor-wait disabled:opacity-60"
          >
            Ignore source change
          </button>
          <button
            type="button"
            disabled={status === 'ignoring' || status === 'creating'}
            onClick={() => void createDraft()}
            className="rounded bg-[var(--brand-strong)] px-3 py-1.5 font-semibold text-[var(--brand-on-strong)] disabled:cursor-wait disabled:opacity-60"
          >
            {persisted.draftData ? 'Draft ready for review' : 'Create new draft'}
          </button>
          {status === 'ignoring' && <span role="status">Ignoring source change</span>}
          {status === 'creating' && <span role="status">Creating reviewable draft</span>}
          {status === 'error' && <span role="alert" className="text-[var(--state-critical)]">{errorMessage}</span>}
        </div>
      )}
    </details>
  )
}

function ProductionSpecificationEditor({
  itemId,
  itemCode,
  initialSpecification,
  hasConfirmedSpecification,
  confirmedRevision,
  draftRevision,
  catalogue,
}: {
  itemId: string
  itemCode: string
  initialSpecification: ProductionSpecification
  hasConfirmedSpecification: boolean
  confirmedRevision: number
  draftRevision: number
  catalogue: readonly ProductionSpecificationCatalogueOption[]
}) {
  const [draft, setDraft] = useState(initialSpecification ?? createEmptyProductionSpecification())
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'confirming' | 'confirmed' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [revisions, setRevisions] = useState({ confirmedRevision, draftRevision })
  const [changeReason, setChangeReason] = useState<ProductionSpecificationChangeReasonCode | ''>('')
  const [changeNote, setChangeNote] = useState('')

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
      const saved = await saveWorkOrderItemProductionSpecificationDraftAction(itemId, draft, {
        expectedConfirmedRevision: revisions.confirmedRevision,
        expectedDraftRevision: revisions.draftRevision,
      })
      setRevisions({
        confirmedRevision: saved.confirmedRevision,
        draftRevision: saved.draftRevision,
      })
      setDirty(false)
      setStatus('saved')
      return saved
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Production Specification draft could not be saved.')
      return null
    }
  }

  async function confirmDraft() {
    if (hasConfirmedSpecification && !changeReason) {
      setStatus('error')
      setErrorMessage('Choose an approved change reason before confirming this revision.')
      return
    }
    const saved = dirty ? await saveDraft() : null
    if (dirty && !saved) return
    setStatus('confirming')
    setErrorMessage(null)
    try {
      await confirmWorkOrderItemProductionSpecificationAction(itemId, {
        expectedConfirmedRevision: saved?.confirmedRevision ?? revisions.confirmedRevision,
        expectedDraftRevision: saved?.draftRevision ?? revisions.draftRevision,
        ...(hasConfirmedSpecification && changeReason
          ? { changeReason: { code: changeReason, note: changeNote } }
          : {}),
      })
      setStatus('confirmed')
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Production Specification could not be confirmed.')
    }
  }

  const actionPending = status === 'saving' || status === 'confirming'
  const changeReasonError = status === 'error' && hasConfirmedSpecification && !changeReason
    ? errorMessage
    : null
  const changeReasonErrorId = `${itemCode}-change-reason-error`

  return (
    <section aria-label="Edit Production Specification" className="rounded border border-border bg-surface p-3">
      <h4 className="font-semibold text-text-primary">Review and correct draft</h4>
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
      {hasConfirmedSpecification && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-text-secondary">
            Change reason
            <select
              aria-label="Change reason"
              aria-invalid={Boolean(changeReasonError)}
              aria-describedby={changeReasonError ? changeReasonErrorId : undefined}
              required
              value={changeReason}
              onChange={(event) => {
                setChangeReason(event.target.value as ProductionSpecificationChangeReasonCode | '')
                setStatus('idle')
                setErrorMessage(null)
              }}
              className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-text-primary"
            >
              <option value="">Choose a reason</option>
              {PRODUCTION_SPECIFICATION_CHANGE_REASONS.map(({ code, label }) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-text-secondary">
            Change note {changeReason === 'other' ? '(required)' : '(optional)'}
            <textarea
              aria-label="Change note (optional)"
              required={changeReason === 'other'}
              maxLength={500}
              value={changeNote}
              onChange={(event) => setChangeNote(event.target.value)}
              className="mt-1 min-h-16 w-full rounded border border-border bg-surface px-2 py-1.5 text-text-primary"
            />
          </label>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={actionPending}
          onClick={() => void saveDraft()}
          className="rounded border border-[var(--brand-strong)] bg-surface px-3 py-1.5 text-xs font-semibold text-[var(--brand-strong)] disabled:cursor-wait disabled:opacity-60"
        >
          Save draft
        </button>
        <button
          type="button"
          disabled={actionPending}
          onClick={() => void confirmDraft()}
          className="rounded bg-[var(--brand-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-on-strong)] disabled:cursor-wait disabled:opacity-60"
        >
          Confirm specification
        </button>
        {status === 'saving' && <span role="status">Saving draft</span>}
        {status === 'saved' && <span role="status" className="text-[var(--state-positive)]">Draft saved</span>}
        {status === 'confirming' && <span role="status">Confirming specification</span>}
        {status === 'confirmed' && <span role="status" className="text-[var(--state-positive)]">Specification confirmed</span>}
        {status === 'error' && (
          <span
            id={changeReasonError ? changeReasonErrorId : undefined}
            role="alert"
            className="text-[var(--state-critical)]"
          >
            {errorMessage}
          </span>
        )}
      </div>
    </section>
  )
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
    : value.state === 'unmapped'
      ? '__unmapped'
      : value.state === 'not_applicable' ? '__not_applicable' : '__tbc'

  return (
    <div>
      <label className="block font-medium text-text-secondary">
        {label}
        <select
          aria-label={`${label} for ${itemCode}`}
          value={selectedValue}
          onChange={(event) => {
            const next = event.target.value
            if (next === '__tbc') return onChange({ state: 'tbc' })
            if (next === '__not_applicable') return onChange({ state: 'not_applicable' })
            if (next === '__unmapped') return onChange({ state: 'unmapped', raw: value.state === 'unmapped' ? value.raw : 'Needs review' })
            onChange({ state: 'selected', catalogueId: next })
          }}
          className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-primary"
        >
          <option value="__tbc">TBC</option>
          <option value="__not_applicable">Not Applicable</option>
          {options.map((option) => <option key={option.id} value={option.id}>{option.displayLabel}</option>)}
          <option value="__unmapped">Unmapped - Needs Review</option>
        </select>
      </label>
      {value.state === 'unmapped' && (
        <label className="mt-2 block font-medium text-text-secondary">
          {label} unmapped value
          <input
            aria-label={`${label} unmapped value for ${itemCode}`}
            value={value.raw}
            required
            maxLength={240}
            onChange={(event) => onChange({ state: 'unmapped', raw: event.target.value })}
            className="mt-1 w-full rounded border border-[var(--state-warning)] bg-[var(--state-warning-soft)] px-2 py-1.5 text-xs text-text-primary"
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

export function safeProductionSpecification(
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
