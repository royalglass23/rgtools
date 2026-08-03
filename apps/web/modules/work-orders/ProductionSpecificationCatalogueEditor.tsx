'use client'

import { useActionState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

import {
  DataPanel,
  FeedbackState,
  PrecisionButton,
  StatusBadge,
  precisionControlClassName,
} from '@/components/precision-ui/PrecisionUI'
import {
  saveProductionSpecificationCatalogueOptionAction,
  type ProductionSpecificationCatalogueActionState,
} from './production-specification-catalogue-actions'
import type { ProductionSpecificationCatalogueAdminOption } from './production-specification-catalogue-store'
import {
  PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS,
  productionSpecificationFieldLabel,
} from './production-specifications'
import styles from './ProductionSpecificationCatalogueEditor.module.css'

const INITIAL_STATE: ProductionSpecificationCatalogueActionState = { status: 'idle', message: '' }

export function ProductionSpecificationCatalogueEditor({
  options,
}: {
  options: ProductionSpecificationCatalogueAdminOption[]
}) {
  return (
    <DataPanel title="Specification Catalogue" eyebrow="Canonical production terminology">
      <p className={styles.description}>
        Govern stable canonical values, source aliases, Production Label wording, and PS1/PS3 applicability.
      </p>
      <section className={styles.section} aria-labelledby="add-catalogue-option-heading">
        <h3 id="add-catalogue-option-heading" className={styles.sectionHeading}>Add canonical option</h3>
        <CatalogueOptionForm />
      </section>
      <div className={styles.options}>
        {options.map((model) => (
          <div key={model.option.id} className={styles.option}>
            <CatalogueOptionForm model={model} />
          </div>
        ))}
      </div>
    </DataPanel>
  )
}

function CatalogueOptionForm({ model }: { model?: ProductionSpecificationCatalogueAdminOption }) {
  const [state, action] = useActionState(saveProductionSpecificationCatalogueOptionAction, INITIAL_STATE)
  const option = model?.option
  const hasPsMapping = Boolean(option?.ps1Applicable || option?.ps3Applicable)

  return (
    <form action={action} className={styles.form}>
      {option && <input type="hidden" name="editingId" value={option.id} />}
      <div className={styles.fields}>
        <Field label="Stable ID">
          <input
            name="id"
            defaultValue={option?.id ?? ''}
            readOnly={Boolean(option)}
            required
            placeholder="system.frameless-spigot"
            className={inputClass(Boolean(option))}
          />
        </Field>
        <Field label="Field / category ownership">
          {option ? (
            <>
              <input type="hidden" name="field" value={option.field} />
              <div className={`${precisionControlClassName} ${styles.readOnly}`}>
                {productionSpecificationFieldLabel(option.field)}
              </div>
            </>
          ) : (
            <select name="field" required className={inputClass(false)} defaultValue="">
              <option value="" disabled>Choose field</option>
              {PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS.map(({ field, label }) => (
                <option key={field} value={field}>{label}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Display label">
          <input name="displayLabel" defaultValue={option?.displayLabel ?? ''} required className={inputClass(false)} />
        </Field>
        <Field label="Production Label wording">
          <input name="productionLabel" defaultValue={option?.productionLabel ?? ''} required className={inputClass(false)} />
        </Field>
        <Field label="Aliases (one per line)">
          <textarea name="aliases" rows={3} defaultValue={(option?.aliases ?? []).join('\n')} className={inputClass(false)} />
        </Field>
        <Field label="PS category slug">
          <input name="psCategorySlug" defaultValue={option?.psCategorySlug ?? ''} placeholder="glass_type" className={inputClass(false)} />
        </Field>
        <Field label="PS option slug">
          <input name="psOptionSlug" defaultValue={option?.psOptionSlug ?? ''} placeholder="toughened" className={inputClass(false)} />
        </Field>
        <Field label="Sort order">
          <input name="sortOrder" type="number" min={0} max={100000} defaultValue={option?.sortOrder ?? 0} required className={inputClass(false)} />
        </Field>
      </div>

      <div className={styles.checkboxes}>
        <Checkbox name="ps1Applicable" label="PS1" defaultChecked={option?.ps1Applicable ?? false} />
        <Checkbox name="ps3Applicable" label="PS3" defaultChecked={option?.ps3Applicable ?? false} />
        <Checkbox name="isActive" label="Active" defaultChecked={option?.isActive ?? true} />
        {!hasPsMapping && option && <span className={styles.muted}>Not used for PS</span>}
      </div>

      {model && (
        <div className={styles.impact}>
          <p className={styles.impactTitle}>Affected confirmed items: {model.affectedCount}</p>
          {model.affectedItems.length > 0 && (
            <ul className={styles.impactList}>
              {model.affectedItems.map((item) => (
                <li key={item.workOrderItemId}>
                  {item.jobNumber ?? 'Unknown job'} / {item.itemCode ?? 'No item code'} — {item.productionLabel ?? 'No Production Label'}
                </li>
              ))}
            </ul>
          )}
          {model.affectedCount > model.affectedItems.length && (
            <p>Plus {model.affectedCount - model.affectedItems.length} more confirmed items.</p>
          )}
          {model.affectedCount > 0 && (
            <label className={styles.impactConfirmation}>
              <input type="checkbox" name="confirmImpact" />
              Confirm this rename or deactivation may rebuild every affected Production Label and add system history.
            </label>
          )}
        </div>
      )}

      <div className={styles.actions}>
        <CatalogueSubmitButton label={option ? 'Save catalogue option' : 'Add catalogue option'} />
        {state.status === 'error' && state.message && (
          <FeedbackState tone="error">{state.message}</FeedbackState>
        )}
        {state.status === 'success' && state.message && (
          <span role="status"><StatusBadge tone="positive">{state.message}</StatusBadge></span>
        )}
      </div>
    </form>
  )
}

function CatalogueSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <PrecisionButton
      type="submit"
      disabled={pending}
    >
      {pending ? 'Saving catalogue option…' : label}
      {pending && <span className="sr-only" role="status">Saving catalogue option</span>}
    </PrecisionButton>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>
}

function Checkbox({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return <label className={styles.checkbox}><input type="checkbox" name={name} defaultChecked={defaultChecked} />{label}</label>
}

function inputClass(readOnly: boolean) {
  return `${precisionControlClassName}${readOnly ? ` ${styles.readOnly}` : ''}`
}
