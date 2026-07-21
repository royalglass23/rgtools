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

        <section aria-label="Original ServiceM8 description">
          <h4 className="font-semibold text-text-primary">Original ServiceM8 description</h4>
          <p className="mt-1 whitespace-pre-wrap">
            {persisted.sourceDescription ?? 'Original source text was not recorded.'}
          </p>
        </section>

        {(persisted.evidenceData?.length ?? 0) > 0 && (
          <section aria-label="Source evidence">
            <h4 className="font-semibold text-text-primary">Source evidence</h4>
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
            <h4 className="font-semibold text-text-primary">Review flags</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {persisted.ambiguityFlags?.map((flag) => <li key={flag}>{flag}</li>)}
            </ul>
          </section>
        )}

        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          {SPECIFICATION_FIELDS.map(({ field, label }) => (
            <div key={field}>
              <dt className="font-medium text-text-muted">{label}</dt>
              <dd className="mt-0.5 text-text-primary">{productionSpecificationValueLabel(specification[field], catalogue)}</dd>
            </div>
          ))}
        </dl>

        {specification.measurements.length > 0 && (
          <section aria-label="Measurements">
            <h4 className="font-semibold text-text-primary">Measurements</h4>
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
            <h4 className="font-semibold text-text-primary">Additional Components</h4>
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
            <h4 className="font-semibold text-text-primary">Special Requirements</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {specification.specialRequirements.map((requirement, index) => (
                <li key={`${requirement.kind}-${index}`}>{requirement.detail}</li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Production Specification history">
          <h4 className="font-semibold text-text-primary">History</h4>
          {persisted.history.length === 0 ? (
            <p className="mt-1 text-text-muted">No confirmed changes yet.</p>
          ) : (
            <ol className="mt-1 space-y-2">
              {persisted.history.map((revision) => (
                <li key={revision.id} className="rounded border border-border bg-surface px-2 py-1.5">
                  <span className="font-medium">
                    {revisionTypeLabel(revision.revisionType)}
                    {' by '}{revision.actorUsername ?? 'Unknown user'}
                  </span>
                  {' - '}{formatDateTime(revision.createdAt)}
                  {revision.reasonCode ? ` - ${changeReasonLabel(revision.reasonCode)}` : ''}
                  {revision.note ? `: ${revision.note}` : ''}
                  {(revision.changes?.length ?? 0) > 0 && (
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {revision.changes?.map((change, index) => (
                        <li key={`${String(change.identity ?? change.kind ?? 'change')}-${index}`}>
                          {revisionChangeLabel(change, catalogue)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

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

function revisionTypeLabel(revisionType: string) {
  if (revisionType === 'baseline_confirmed') return 'Baseline confirmed'
  if (revisionType === 'source_change_ignored') return 'Source change ignored'
  if (revisionType === 'source_change_draft_created') return 'Source-change draft created'
  if (revisionType === 'catalogue_option_changed') return 'Catalogue option updated'
  return 'Specification updated'
}

function changeReasonLabel(reasonCode: string) {
  return PRODUCTION_SPECIFICATION_CHANGE_REASONS.find(({ code }) => code === reasonCode)?.label ?? reasonCode
}

function revisionChangeLabel(
  change: Record<string, unknown>,
  catalogue: readonly ProductionSpecificationCatalogueOption[],
) {
  const identity = String(change.identity ?? 'Specification')
  if (change.kind === 'catalogue') {
    const governedAttribute = typeof change.label === 'string' ? ` — ${change.label}` : ''
    return `Catalogue option ${identity}${governedAttribute}: ${auditValueLabel(change.previousValue, catalogue)} → ${auditValueLabel(change.newValue, catalogue)}`
  }
  const field = SPECIFICATION_FIELDS.find(({ field }) => field === identity)
  const label = field?.label ?? identity
  return `${label}: ${auditValueLabel(change.previousValue, catalogue)} → ${auditValueLabel(change.newValue, catalogue)}`
}

function auditValueLabel(
  value: unknown,
  catalogue: readonly ProductionSpecificationCatalogueOption[],
) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && !Array.isArray(value) && 'state' in value) {
    return productionSpecificationValueLabel(value as ProductionSpecificationValue, catalogue)
  }
  return JSON.stringify(value)
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
      <fieldset className="rounded border border-border p-3">
        <legend className="px-1 font-semibold text-text-primary">Measurements</legend>
        <div className="space-y-3">
          {measurements.map((measurement, index) => (
            <div key={index} className="grid grid-cols-2 gap-2 rounded bg-surface-subtle p-2">
              <label>Kind
                <select
                  aria-label={`Measurement kind ${index + 1}`}
                  value={measurement.kind}
                  onChange={(event) => onMeasurementsChange(replaceAt(measurements, index, {
                    ...measurement,
                    kind: event.target.value as ProductionSpecificationMeasurement['kind'],
                  }))}
                  className="mt-1 w-full rounded border border-border bg-surface px-2 py-1"
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
                  className="mt-1 w-full rounded border border-border bg-surface px-2 py-1"
                />
              </label>
              <label>Value
                <input
                  aria-label={`Measurement value ${index + 1}`}
                  value={measurement.value}
                  required
                  maxLength={40}
                  onChange={(event) => onMeasurementsChange(replaceAt(measurements, index, { ...measurement, value: event.target.value }))}
                  className="mt-1 w-full rounded border border-border bg-surface px-2 py-1"
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
                  className="mt-1 w-full rounded border border-border bg-surface px-2 py-1"
                >
                  {MEASUREMENT_UNITS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => onMeasurementsChange(removeAt(measurements, index))} className="col-span-2 justify-self-start text-[var(--state-critical)]">
                Remove measurement {index + 1}
              </button>
            </div>
          ))}
          <button type="button" onClick={() => onMeasurementsChange([...measurements, { kind: 'other', value: '', unit: 'mm' }])} className="rounded border border-border bg-surface px-2 py-1 font-medium">
            Add measurement
          </button>
        </div>
      </fieldset>

      <fieldset className="rounded border border-border p-3">
        <legend className="px-1 font-semibold text-text-primary">Additional Components</legend>
        <div className="space-y-3">
          {components.map((component, index) => (
            <div key={index} className="grid grid-cols-2 gap-2 rounded bg-surface-subtle p-2">
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
                    className="mt-1 w-full rounded border border-border bg-surface px-2 py-1"
                  />
                </label>
              ))}
              <button type="button" onClick={() => onComponentsChange(removeAt(components, index))} className="col-span-2 justify-self-start text-[var(--state-critical)]">
                Remove component {index + 1}
              </button>
            </div>
          ))}
          <button type="button" onClick={() => onComponentsChange([...components, { name: '' }])} className="rounded border border-border bg-surface px-2 py-1 font-medium">
            Add component
          </button>
        </div>
      </fieldset>

      <fieldset className="rounded border border-border p-3">
        <legend className="px-1 font-semibold text-text-primary">Special Requirements</legend>
        <div className="space-y-3">
          {requirements.map((requirement, index) => (
            <div key={index} className="space-y-2 rounded bg-surface-subtle p-2">
              <label>Kind
                <select
                  aria-label={`Special requirement kind ${index + 1}`}
                  value={requirement.kind}
                  onChange={(event) => onRequirementsChange(replaceAt(requirements, index, {
                    ...requirement,
                    kind: event.target.value as ProductionSpecificationRequirement['kind'],
                  }))}
                  className="mt-1 w-full rounded border border-border bg-surface px-2 py-1"
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
                  className="mt-1 min-h-16 w-full rounded border border-border bg-surface px-2 py-1"
                />
              </label>
              <button type="button" onClick={() => onRequirementsChange(removeAt(requirements, index))} className="text-[var(--state-critical)]">
                Remove special requirement {index + 1}
              </button>
            </div>
          ))}
          <button type="button" onClick={() => onRequirementsChange([...requirements, { kind: 'other', detail: '' }])} className="rounded border border-border bg-surface px-2 py-1 font-medium">
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

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
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
      <label className="block font-medium text-text-secondary">
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
          className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-primary"
        >
          <option value="__tbc">TBC</option>
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
