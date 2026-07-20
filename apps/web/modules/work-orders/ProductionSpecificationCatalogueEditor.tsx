'use client'

import { useActionState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

import {
  saveProductionSpecificationCatalogueOptionAction,
  type ProductionSpecificationCatalogueActionState,
} from './production-specification-catalogue-actions'
import type { ProductionSpecificationCatalogueAdminOption } from './production-specification-catalogue-store'
import {
  PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS,
  productionSpecificationFieldLabel,
} from './production-specifications'

const INITIAL_STATE: ProductionSpecificationCatalogueActionState = { status: 'idle', message: '' }

export function ProductionSpecificationCatalogueEditor({
  options,
}: {
  options: ProductionSpecificationCatalogueAdminOption[]
}) {
  return (
    <section className="rounded border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 p-4">
        <h2 className="text-sm font-semibold text-gray-950">Specification Catalogue</h2>
        <p className="mt-1 text-sm text-gray-500">
          Govern stable canonical values, source aliases, Production Label wording, and PS1/PS3 applicability.
        </p>
      </div>
      <div className="border-b border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-900">Add canonical option</h3>
        <CatalogueOptionForm />
      </div>
      <div className="divide-y divide-gray-100">
        {options.map((model) => (
          <div key={model.option.id} className="p-4">
            <CatalogueOptionForm model={model} />
          </div>
        ))}
      </div>
    </section>
  )
}

function CatalogueOptionForm({ model }: { model?: ProductionSpecificationCatalogueAdminOption }) {
  const [state, action] = useActionState(saveProductionSpecificationCatalogueOptionAction, INITIAL_STATE)
  const option = model?.option
  const hasPsMapping = Boolean(option?.ps1Applicable || option?.ps3Applicable)

  return (
    <form action={action} className="mt-3 space-y-3">
      {option && <input type="hidden" name="editingId" value={option.id} />}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
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

      <div className="flex flex-wrap gap-5 text-sm text-gray-800">
        <Checkbox name="ps1Applicable" label="PS1" defaultChecked={option?.ps1Applicable ?? false} />
        <Checkbox name="ps3Applicable" label="PS3" defaultChecked={option?.ps3Applicable ?? false} />
        <Checkbox name="isActive" label="Active" defaultChecked={option?.isActive ?? true} />
        {!hasPsMapping && option && <span className="text-gray-500">Not used for PS</span>}
      </div>

      {model && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Affected confirmed items: {model.affectedCount}</p>
          {model.affectedItems.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {model.affectedItems.map((item) => (
                <li key={item.workOrderItemId}>
                  {item.jobNumber ?? 'Unknown job'} / {item.itemCode ?? 'No item code'} — {item.productionLabel ?? 'No Production Label'}
                </li>
              ))}
            </ul>
          )}
          {model.affectedCount > model.affectedItems.length && (
            <p className="mt-1">Plus {model.affectedCount - model.affectedItems.length} more confirmed items.</p>
          )}
          {model.affectedCount > 0 && (
            <label className="mt-2 flex items-start gap-2 font-medium">
              <input type="checkbox" name="confirmImpact" className="mt-0.5" />
              Confirm this rename or deactivation may rebuild every affected Production Label and add system history.
            </label>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <CatalogueSubmitButton label={option ? 'Save catalogue option' : 'Add catalogue option'} />
        {state.message && (
          <span role={state.status === 'error' ? 'alert' : 'status'} className={state.status === 'error' ? 'text-sm text-red-700' : 'text-sm text-green-700'}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  )
}

function CatalogueSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-[#142B3A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d3d52] disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? 'Saving catalogue option…' : label}
      {pending && <span className="sr-only" role="status">Saving catalogue option</span>}
    </button>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="space-y-1 text-sm font-medium text-gray-800"><span>{label}</span>{children}</label>
}

function Checkbox({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return <label className="flex items-center gap-2"><input type="checkbox" name={name} defaultChecked={defaultChecked} />{label}</label>
}

function inputClass(readOnly: boolean) {
  return `w-full rounded border px-3 py-2 text-sm ${readOnly ? 'border-gray-200 bg-gray-50 text-gray-600' : 'border-gray-300 bg-white text-gray-950'}`
}
