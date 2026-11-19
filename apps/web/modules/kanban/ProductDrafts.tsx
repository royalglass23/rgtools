'use client'
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { DashboardProduct } from './persistence'
import { READINESS_FIELDS, type ManualState } from './work-orders'

export type ProductDraft = {
  base: DashboardProduct; manual: ManualState; installerId: string | null;
  installDate: string | null; installerName: string | null;
}
type DraftContext = { drafts: Record<string, ProductDraft>; retain: (id: string, draft: ProductDraft) => void; forget: (id: string) => void }
const Context = createContext<DraftContext>({ drafts: {}, retain: () => {}, forget: () => {} })
export const useProductDrafts = () => useContext(Context)

// Lives in the authenticated layout, above filtered/paginated product rows.
// No local/session storage: drafts are cleared when the authenticated layout exits.
export function ProductDrafts({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>({})
  const retain = (id: string, draft: ProductDraft) => setDrafts(previous => ({ ...previous, [id]: draft }))
  const forget = (id: string) => setDrafts(previous => { const next = { ...previous }; delete next[id]; return next })
  return <Context.Provider value={{ drafts, retain, forget }}>
    {Object.keys(drafts).length > 0 && <aside aria-label="Recoverable product drafts" className="mb-4 rounded border border-border bg-surface p-4 text-text-primary">
      <strong>{Object.keys(drafts).length} unsaved product {Object.keys(drafts).length === 1 ? 'draft' : 'drafts'}</strong>
      <p className="mt-1 text-sm">Your drafts stay here if a product moves out of the current view. Save or reload the product to clear its draft.</p>
      {Object.entries(drafts).map(([id, draft]) => <details key={id} className="mt-2">
        <summary className="cursor-pointer text-sm font-semibold">{draft.base.jobNumber} · {draft.base.label}</summary>
        <textarea readOnly aria-label={`Recoverable draft for ${draft.base.jobNumber} ${draft.base.label}`} rows={8}
          className="mt-2 w-full rounded border border-border bg-surface p-2 text-sm text-text-primary"
          value={[
            `Installer: ${draft.installerName ?? 'Unassigned'}`, `Target install date: ${draft.installDate ?? 'TBC'}`,
            `Focus selection: ${draft.manual.focus}`, `Materials ETA: ${draft.manual.materialsEta ?? 'TBC'}`,
            ...Object.entries(READINESS_FIELDS).map(([key, label]) => `${label}: ${draft.manual[key as keyof typeof READINESS_FIELDS]}`),
            `Estimated hours: ${draft.manual.estimatedHours}`, `Client waiting for: ${draft.manual.clientWaitingFor}`, `Notes: ${draft.manual.notes}`,
          ].join('\n')} />
      </details>)}
    </aside>}
    {children}
  </Context.Provider>
}
