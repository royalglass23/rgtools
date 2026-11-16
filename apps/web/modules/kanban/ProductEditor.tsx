'use client'
import { useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveDashboardProduct, productHistory } from './actions'
import type { DashboardProduct } from './persistence'
import { READINESS_FIELDS, type ManualState, type Readiness } from './work-orders'
import { PrecisionButton } from '@/components/precision-ui/PrecisionUI'
import styles from './WorkOrderDashboard.module.css'
import { hasPendingProductEdits } from './draft-guard'
import { useProductDrafts } from './ProductDrafts'

const emptySubscribe = () => () => {}

export function ProductEditor({ product, installers }: { product: DashboardProduct; installers: Array<{ id: string; name: string }> }) {
  const router = useRouter()
  const draftStore = useProductDrafts()
  const restored = product.itemId ? draftStore.drafts[product.itemId] : undefined
  const [base, setBase] = useState(restored?.base ?? product)
  const [previousProduct, setPreviousProduct] = useState(product)
  const [manual, setManual] = useState(restored?.manual ?? product.manual)
  const [installerId, setInstaller] = useState(restored ? restored.installerId : product.installerId)
  const [installDate, setDate] = useState(restored ? restored.installDate : product.installDate)
  const [dirty, setDirty] = useState(Boolean(restored))
  const [pending, start] = useTransition()
  const interactive = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof productHistory>> | null>(null)
  const [historyPage, setHistoryPage] = useState(1)
  // Adjust only pristine state when a new server snapshot arrives. Dirty drafts
  // keep their original revision until the user saves or explicitly reloads.
  if (product !== previousProduct) {
    setPreviousProduct(product)
    if (!dirty && product.revision >= base.revision) {
      setBase(product); setManual(product.manual); setInstaller(product.installerId); setDate(product.installDate)
    }
  }
  const newer = product.revision > base.revision || product.installerId !== base.installerId || product.installDate !== base.installDate
  function retain(nextManual: ManualState, nextInstaller: string | null, nextDate: string | null) {
    if (product.itemId) draftStore.retain(product.itemId, { base, manual: nextManual, installerId: nextInstaller, installDate: nextDate,
      installerName: installers.find(i => i.id === nextInstaller)?.name ?? (nextInstaller ? product.installer : null) })
  }
  function change<K extends keyof ManualState>(key: K, value: ManualState[K]) {
    const next = { ...manual, [key]: value }
    setManual(next); setDirty(true); setMessage(''); retain(next, installerId, installDate)
  }
  function loadHistory(page: number) {
    if (!product.itemId) return
    start(async () => {
      try { setHistory(await productHistory(product.itemId!, page)); setHistoryPage(page) }
      catch { setFailed(true); setMessage('History could not load. Try again.') }
    })
  }
  return <div className={styles.editor}>
    <p className={styles.source}>ServiceM8 quantity: {product.quantity}. Source description: {product.description}</p>
    {product.kanbanFlag && <p className={styles.source}><strong>Kanban flag: {product.kanbanFlag.flag}.</strong> Imported from Master {product.kanbanFlag.sourceCell}. This product inherits the job flag unless you choose a product override. <a href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(product.kanbanFlag.source.spreadsheetId)}/edit#gid=${product.kanbanFlag.source.sheetId}&range=${product.kanbanFlag.sourceCell}`} target="_blank" rel="noreferrer">View Master source</a></p>}
    <details className={styles.history}>
      <summary>Detected planning evidence</summary>
      <p className={styles.source}>Automatic evidence never overwrites your target date or manual fields. Clearing a staff target allows a suggested date; inclusion still follows the product override or inherited Master flag.</p>
      {product.assessment?.result ? <>
        {(!product.assessmentCurrent || product.assessment.state === 'failed') && <p role="alert">This saved suggestion is stale or could not be refreshed. It is not used for automatic inclusion.</p>}
        {product.assessment.state === 'failed' && product.assessment.error && <p>{product.assessment.error}</p>}
        <p>{product.assessment.result.status === 'dated' ? `AI-suggested ${product.assessment.result.kind}: ${product.assessment.result.date}` : 'No automatic date accepted.'} {product.assessment.result.reason}</p>
        {product.assessment.assessedAt && <p className={styles.source}>Assessed: {new Date(product.assessment.assessedAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })}</p>}
        {product.assessment.result.evidence.map((source, index) => <blockquote key={index}><strong>{source.kind}{source.observedAt ? ` · ${source.observedAt}` : ''}</strong><p>{source.quote}</p></blockquote>)}
      </> : <p>{product.assessment?.error ?? 'Awaiting assessment. Refresh reads job descriptions, notes and email evidence; calendar bookings are excluded.'}</p>}
    </details>
    {newer && dirty && <p role="alert">A newer saved version is available. Your unsaved edits are preserved. Copy them before reloading.</p>}
    <form data-work-order-product={product.itemId} data-work-order-dirty={dirty ? 'true' : undefined} onSubmit={event => {
      event.preventDefault()
      if (!product.itemId) return
      start(async () => {
        try {
          const result = await saveDashboardProduct({ id: product.itemId, revision: base.revision,
            expectedInstallerId: base.installerId, expectedInstallDate: base.installDate, installerId, installDate, manual })
          setFailed(!result.ok)
          if (result.ok) {
            draftStore.forget(product.itemId!)
            setBase({ ...base, revision: result.revision, installerId, installDate, manual }); setDirty(false)
            setHistory(null)
            if (hasPendingProductEdits(product.itemId ?? undefined)) setMessage('Saved. Dashboard refresh waits for other product edits.')
            else { setMessage('Saved. Change history updated.'); router.refresh() }
          } else setMessage(result.error)
        } catch { setFailed(true); setMessage('The update could not be saved. Your edits are kept here. Try again.') }
      })
    }}>
      <fieldset disabled={pending || !interactive} className={styles.fields}>
        <legend>Product operations</legend>
        <label>Installer<select aria-label="Installer" value={installerId ?? ''} onChange={e => { const next = e.target.value || null; setInstaller(next); setDirty(true); retain(manual, next, installDate) }}>
          <option value="">Unassigned</option>
          {installerId && !installers.some(i => i.id === installerId) && <option value={installerId}>{product.installer ?? 'Archived installer'}</option>}
          {installers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select></label>
        <label>Target install date<input aria-label="Target install date" type="date" value={installDate ?? ''} onChange={e => { const next = e.target.value || null; setDate(next); setDirty(true); retain(manual, installerId, next) }} /></label>
        <label>Focus selection<select aria-label="Focus selection" value={manual.focus} onChange={e => change('focus', e.target.value as ManualState['focus'])}>
          <option value="auto">Use Kanban flag / automatic date</option><option value="include">Include manually</option><option value="exclude">Exclude manually</option><option value="unknown">Needs review</option>
        </select></label>
        <label>Materials ETA<input aria-label="Materials ETA" type="date" value={manual.materialsEta ?? ''} onChange={e => change('materialsEta', e.target.value || null)} /></label>
        {Object.entries(READINESS_FIELDS).map(([key, label]) => <label key={key}>{label}
          <select aria-label={label} value={manual[key as keyof typeof READINESS_FIELDS]} onChange={e => change(key as keyof typeof READINESS_FIELDS, e.target.value as Readiness)}>
            <option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option><option value="na">N/A</option>
          </select></label>)}
        <label>Estimated hours<input aria-label="Estimated hours" inputMode="decimal" maxLength={12} value={manual.estimatedHours} onChange={e => change('estimatedHours', e.target.value)} /></label>
        <label className={styles.wide}>Client waiting for<input aria-label="Client waiting for" maxLength={500} value={manual.clientWaitingFor} onChange={e => change('clientWaitingFor', e.target.value)} /></label>
        <label className={styles.wide}>Notes<textarea aria-label="Notes" rows={3} maxLength={4000} value={manual.notes} onChange={e => change('notes', e.target.value)} /></label>
      </fieldset>
      <p className={styles.source}>Document requirements and issue checks are separate. These updates stay in RG Tools.</p>
      <div className={styles.actions}>
        <PrecisionButton type="submit" disabled={pending || !interactive || !dirty}>{pending ? 'Saving…' : 'Save product'}</PrecisionButton>
        {dirty && <button type="button" onClick={() => { if (product.itemId) draftStore.forget(product.itemId); setBase(product); setManual(product.manual); setInstaller(product.installerId); setDate(product.installDate); setDirty(false); setMessage('Loaded the saved version.'); if (!hasPendingProductEdits(product.itemId ?? undefined)) router.refresh() }}>Reload saved version</button>}
        <span role={failed ? 'alert' : 'status'}>{message}</span>
      </div>
    </form>
    <details className={styles.history} onToggle={e => { if (e.currentTarget.open && !history) loadHistory(1) }}>
      <summary>Change history</summary>
      {history ? <>
        {history.events.length === 0 && <p>No product changes recorded yet.</p>}
        <ol>{history.events.map(event => <li key={event.id}>
          <strong>{event.actor ?? 'System'} · {new Date(event.createdAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })}</strong>
          <div>{event.field === 'dashboard_kanban_flag_imported' ? 'Imported Master flag' : event.field.replaceAll('_', ' ')}</div>
          <details><summary>Before and after</summary><pre>{JSON.stringify({ before: event.previous, after: event.next }, null, 2)}</pre></details>
        </li>)}</ol>
        <div className={styles.actions}>
          <button type="button" disabled={pending || historyPage === 1} onClick={() => loadHistory(historyPage - 1)}>Newer changes</button>
          <button type="button" disabled={pending || !history.more} onClick={() => loadHistory(historyPage + 1)}>Older changes</button>
        </div>
      </> : <p role="status">Loading history…</p>}
    </details>
  </div>
}
