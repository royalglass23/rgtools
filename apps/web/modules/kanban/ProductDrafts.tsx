'use client'
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { DashboardProduct } from './persistence'
import { READINESS_FIELDS, type ManualState, type FieldPatches } from './work-orders'
import type { ReadinessDates } from './field-ownership'
import { FIELD_LABELS } from './effective-fields'
import { PrecisionButton } from '@/components/precision-ui/PrecisionUI'

export type ProductDraft = {
  base: DashboardProduct; manual: ManualState; installerId: string | null;
  installDate: string | null; installerName: string | null;
  patches: FieldPatches;
  readinessDates?: ReadinessDates;
}
type DraftContext = { drafts: Record<string, ProductDraft>; retain: (id: string, draft: ProductDraft) => void; forget: (id: string) => void }
const Context = createContext<DraftContext>({ drafts: {}, retain: () => {}, forget: () => {} })
export const useProductDrafts = () => useContext(Context)

// Lives in the authenticated layout, above filtered/paginated product rows.
// No local/session storage: drafts are cleared when the authenticated layout exits.
export function ProductDrafts({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>({})
  const [message, setMessage] = useState('')
  const retain = (id: string, draft: ProductDraft) => setDrafts(previous => ({ ...previous, [id]: draft }))
  const forget = (id: string) => setDrafts(previous => { const next = { ...previous }; delete next[id]; return next })
  function discard(id: string) {
    // Check the live editor at action time; a recovered row may have remounted
    // since this recovery disclosure rendered. Never detach its dirty state.
    const mounted = Array.from(document.querySelectorAll<HTMLFormElement>('form[data-work-order-dirty="true"]')).some(form => form.dataset.workOrderProduct === id)
    if (mounted) { setMessage('This product has an open editor with unsaved edits. Use Reload saved version in its editor before discarding.'); return }
    forget(id); setMessage('')
  }
  return <Context.Provider value={{ drafts, retain, forget }}>
    {Object.keys(drafts).length > 0 && <aside aria-label="Recoverable product drafts" className="mb-4 rounded border border-border bg-surface p-4 text-text-primary">
      <strong>{Object.keys(drafts).length} unsaved product {Object.keys(drafts).length === 1 ? 'draft' : 'drafts'}</strong>
      <p className="mt-1 text-sm">Your drafts stay here if a product moves out of the current view. Save or reload the product to clear its draft.</p>
      <p className="mt-1 text-sm">Copy any text you need before discarding a recovered draft. Discard clears only that product’s draft in this tab; saved records stay unchanged.</p>
      {message && <p role="alert" className="mt-1 text-sm">{message}</p>}
      {Object.entries(drafts).map(([id, draft]) => <details key={id} className="mt-2" data-work-order-product={id} data-work-order-dirty="true">
        <summary className="cursor-pointer text-sm font-semibold">{draft.base.jobNumber} · {draft.base.label}</summary>
        <textarea readOnly aria-label={`Recoverable draft for ${draft.base.jobNumber} ${draft.base.label}`} rows={8}
          className="mt-2 w-full rounded border border-border bg-surface p-2 text-sm text-text-primary"
          value={[
            `Installer: ${draft.installerName ?? 'Unassigned'}`, `Target install date: ${draft.installDate ?? 'TBC'}`,
            `Focus selection: ${draft.manual.focus}`, `Materials ETA: ${draft.manual.materialsEta ?? 'TBC'}`,
            ...Object.entries(READINESS_FIELDS).map(([key, label]) => `${label}: ${draft.manual[key as keyof typeof READINESS_FIELDS]}`),
            ...Object.entries(draft.readinessDates ?? {}).map(([key, detail]) => `${READINESS_FIELDS[key as keyof typeof READINESS_FIELDS]}: ${detail!.datePurpose === 'ready' ? 'Ready on' : 'Expected'} ${detail!.date}`),
            `Estimated hours: ${draft.manual.estimatedHours}`, `Client waiting for: ${draft.manual.clientWaitingFor}`, `Notes: ${draft.manual.notes}`,
            ...Object.entries(draft.patches).map(([field, patch]) => `${FIELD_LABELS[field as keyof typeof FIELD_LABELS]}: ${patch!.mode === 'auto' ? 'Use automatic assessment' : 'Keep staff value'}`),
          ].join('\n')} />
        <PrecisionButton type="button" tone="secondary" aria-label={`Discard draft for ${draft.base.jobNumber} ${draft.base.label}`} onClick={() => discard(id)}>Discard recovered draft</PrecisionButton>
      </details>)}
    </aside>}
    {children}
  </Context.Provider>
}
