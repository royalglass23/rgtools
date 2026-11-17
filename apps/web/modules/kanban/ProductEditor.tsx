'use client'
import { useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveDashboardProduct, productHistory } from './actions'
import type { DashboardProduct } from './persistence'
import { READINESS_FIELDS, parseManualState, type ManualState, type Readiness, type FieldPatches, type OwnedField } from './work-orders'
import { PrecisionButton } from '@/components/precision-ui/PrecisionUI'
import styles from './WorkOrderDashboard.module.css'
import { hasPendingProductEdits } from './draft-guard'
import { useProductDrafts } from './ProductDrafts'
import { effectiveProductFields, FIELD_LABELS, coverageLabel } from './effective-fields'
import { EffectiveValue } from './EffectiveValue'
import type { ReadinessDates } from './field-ownership'

const emptySubscribe = () => () => {}

export function ProductEditor({ product, installers }: { product: DashboardProduct; installers: Array<{ id: string; name: string }> }) {
  const router = useRouter()
  const draftStore = useProductDrafts()
  const restored = product.itemId ? draftStore.drafts[product.itemId] : undefined
  const [base, setBase] = useState(restored?.base ?? product)
  const [previousProduct, setPreviousProduct] = useState(product)
  const [manual, setManual] = useState(restored?.manual ?? effectiveProductFields(product).manual)
  const [readinessDates, setReadinessDates] = useState<ReadinessDates>(restored?.readinessDates ?? effectiveProductFields(product).readinessDates)
  const [installerId, setInstaller] = useState(restored ? restored.installerId : product.installerId)
  const [installDate, setDate] = useState(restored ? restored.installDate : product.installDate)
  const [patches, setPatches] = useState<FieldPatches>(restored?.patches ?? {})
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
      const effective = effectiveProductFields(product)
      setBase(product); setManual(effective.manual); setReadinessDates(effective.readinessDates); setInstaller(product.installerId); setDate(product.installDate)
    }
  }
  const newer = product.revision > base.revision || product.installerId !== base.installerId || product.installDate !== base.installDate
  // Compose a preview from changed patches only. Displayed automatic defaults
  // never become a whole manual snapshot when another field saves.
  const latestAssessment = { assessment: product.assessment, assessmentCurrent: product.assessmentCurrent, operationalCurrent: product.operationalCurrent }
  const preview = { ...base, ...latestAssessment, manual: { ...base.manual }, ownership: { ...base.ownership }, installerId, installDate, readinessDates }
  for (const field of Object.keys(patches) as OwnedField[]) {
    const patch = patches[field]!
    preview.ownership[field] = patch.mode
    if (field !== 'installerId' && field !== 'installDate') preview.manual[field] = (patch.mode === 'auto' ? parseManualState({})[field] : typeof patch.value === 'object' && patch.value ? patch.value.state : patch.value) as never
  }
  const effective = effectiveProductFields(preview)
  const visibleManual = { ...manual }
  for (const field of Object.keys(manual) as Array<keyof ManualState>) {
    if (preview.ownership[field] === 'auto') visibleManual[field] = effective.manual[field] as never
  }
  const visibleDates = effective.readinessDates
  function retain(nextManual: ManualState, nextInstaller: string | null, nextDate: string | null, nextPatches: FieldPatches, dates = visibleDates) {
    if (product.itemId) draftStore.retain(product.itemId, { base, manual: nextManual, installerId: nextInstaller, installDate: nextDate,
      patches: nextPatches,
      readinessDates: dates,
      installerName: installers.find(i => i.id === nextInstaller)?.name ?? (nextInstaller ? product.installer : null) })
  }
  function change<K extends keyof ManualState>(key: K, value: ManualState[K]) {
    const next = { ...visibleManual, [key]: value }
    const detail = visibleDates[key as keyof ReadinessDates]
    const nextPatches = { ...patches, [key]: { mode: 'staff' as const, value: detail ? { state: value, ...detail } : value } } as FieldPatches
    setManual(next); setReadinessDates(visibleDates); setPatches(nextPatches); setDirty(true); setMessage(''); retain(next, installerId, installDate, nextPatches)
  }
  function setFieldMode(field: OwnedField, mode: 'auto' | 'staff') {
    const value = field === 'installDate' ? installDate : field === 'installerId' ? installerId : visibleManual[field]
    const detail = visibleDates[field as keyof ReadinessDates]
    const nextPatches = { ...patches, [field]: mode === 'auto' ? { mode } : { mode, value: detail ? { state: value, ...detail } : value } } as FieldPatches
    const automatic = effectiveProductFields({ ...base, ...latestAssessment, ownership: { ...base.ownership, [field]: 'auto' } })
    const nextManual = mode === 'auto' && field !== 'installDate' && field !== 'installerId' ? { ...visibleManual, [field]: field === 'notes' || field === 'focus' ? parseManualState({})[field] : automatic.manual[field] } : visibleManual
    const dates = { ...visibleDates }
    if (mode === 'auto') { delete dates[field as keyof ReadinessDates]; if (automatic.readinessDates[field as keyof ReadinessDates]) dates[field as keyof ReadinessDates] = automatic.readinessDates[field as keyof ReadinessDates] }
    const nextInstaller = mode === 'auto' && field === 'installerId' ? null : installerId
    const nextDate = mode === 'auto' && field === 'installDate' ? null : installDate
    setPatches(nextPatches); setManual(nextManual); setReadinessDates(dates); setInstaller(nextInstaller); setDate(nextDate); setDirty(true); setMessage('')
    retain(nextManual, nextInstaller, nextDate, nextPatches, dates)
  }
  function changeReadinessDate(field: 'siteReady' | 'glassReady' | 'hardwareReady', date: string | null, purpose: 'ready' | 'expected' | null) {
    const dates = { ...visibleDates }; if (date && purpose) dates[field] = { date, datePurpose: purpose }; else delete dates[field]
    const nextPatches: FieldPatches = { ...patches, [field]: { mode: 'staff', value: { state: visibleManual[field], date, datePurpose: date ? purpose ?? 'expected' : null } } }
    setManual(visibleManual); setReadinessDates(dates); setPatches(nextPatches); setDirty(true); setMessage(''); retain(visibleManual, installerId, installDate, nextPatches, dates)
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
      <p className={styles.source}>Staff edits and deliberate blanks stay protected. Use automatic assessment for a field to release its override. Inclusion still follows the product override or inherited Master flag.</p>
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
            expectedInstallerId: base.installerId, expectedInstallDate: base.installDate, patches })
          setFailed(!result.ok)
          if (result.ok) {
            draftStore.forget(product.itemId!)
            setBase({ ...preview, revision: result.revision }); setPatches({}); setDirty(false)
            setHistory(null)
            if (hasPendingProductEdits(product.itemId ?? undefined)) setMessage('Saved. Dashboard refresh waits for other product edits.')
            else { setMessage('Saved. Change history updated.'); router.refresh() }
          } else setMessage(result.error)
        } catch { setFailed(true); setMessage('The update could not be saved. Your edits are kept here. Try again.') }
      })
    }}>
      <fieldset disabled={pending || !interactive} className={styles.fields}>
        <legend>Product operations</legend>
        {dirty && <p className={`${styles.source} ${styles.wide}`}>Unsaved preview. Tables show saved values until you save this product.</p>}
        <div className={styles.field}><label>Installer<select aria-label="Installer" value={installerId ?? ''} onChange={e => { const next = e.target.value || null; const nextPatches = { ...patches, installerId: { mode: 'staff' as const, value: next } }; setInstaller(next); setPatches(nextPatches); setDirty(true); retain(visibleManual, next, installDate, nextPatches) }}>
          <option value="">Unassigned</option>
          {installerId && !installers.some(i => i.id === installerId) && <option value={installerId}>{product.installer ?? 'Archived installer'}</option>}
          {installers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select></label><EffectiveValue field={effective.fields.installerId} label="Installer" kind="installer" installers={installers} /><p className={styles.source}>Automatic suggestions do not assign an installer.</p></div>
        <div className={styles.field}><label>Target install date<input aria-label="Target install date" type="date" value={installDate ?? ''} onChange={e => { const next = e.target.value || null; const nextPatches = { ...patches, installDate: { mode: 'staff' as const, value: next } }; setDate(next); setPatches(nextPatches); setDirty(true); retain(visibleManual, installerId, next, nextPatches) }} /></label><EffectiveValue field={effective.fields.installDate} label="Target install date" kind="date" /><p className={styles.source}>Enter an installation target explicitly. Automatic delivery dates are not copied into this staff target.</p></div>
        <label className={styles.field}>Focus selection<select aria-label="Focus selection" value={visibleManual.focus} onChange={e => change('focus', e.target.value as ManualState['focus'])}>
          <option value="auto">Use Kanban flag / automatic date</option><option value="include">Include manually</option><option value="exclude">Exclude manually</option><option value="unknown">Needs review</option>
        </select></label>
        <div className={styles.field}><label>Materials ETA<input aria-label="Materials ETA" type="date" value={visibleManual.materialsEta ?? ''} onChange={e => change('materialsEta', e.target.value || null)} /></label><EffectiveValue field={effective.fields.materialsEta} label="Materials ETA" kind="date" /></div>
        {Object.entries(READINESS_FIELDS).map(([key, label]) => <div key={key} className={styles.field}><label>{label}{key === 'buildingConsent' ? ' · staff override' : ''}
          <select aria-label={label} value={visibleManual[key as keyof typeof READINESS_FIELDS]} onChange={e => change(key as keyof typeof READINESS_FIELDS, e.target.value as Readiness)}>
            <option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option><option value="na">N/A</option>
          </select></label><EffectiveValue field={effective.fields[key as keyof typeof READINESS_FIELDS]} label={label} />
          {(['siteReady', 'glassReady', 'hardwareReady'] as string[]).includes(key) && <div className={styles.readinessDates}><label>{label} date<input aria-label={`${label} date`} type="date" value={visibleDates[key as keyof ReadinessDates]?.date ?? ''} onChange={e => changeReadinessDate(key as 'siteReady' | 'glassReady' | 'hardwareReady', e.target.value || null, e.target.value ? visibleDates[key as keyof ReadinessDates]?.datePurpose ?? 'expected' : null)} /></label><label>Date purpose<select aria-label={`${label} date purpose`} value={visibleDates[key as keyof ReadinessDates]?.datePurpose ?? 'expected'} disabled={!visibleDates[key as keyof ReadinessDates]?.date} onChange={e => changeReadinessDate(key as 'siteReady' | 'glassReady' | 'hardwareReady', visibleDates[key as keyof ReadinessDates]?.date ?? null, e.target.value as 'ready' | 'expected')}><option value="expected">Expected</option><option value="ready">Ready on (actual)</option></select></label></div>}
          {key === 'buildingConsent' && <p className={styles.source}>Automatic consent status stays literal. Choose a staff value to override; approval and consent number are separate.</p>}
        </div>)}
        <div className={styles.field}><span>Consent reference · read-only</span><EffectiveValue field={effective.fields.buildingConsentNumber} label="Consent reference" /></div>
        <div className={styles.field}><label>Estimated hours<input aria-label="Estimated hours" inputMode="decimal" maxLength={12} value={visibleManual.estimatedHours} onChange={e => change('estimatedHours', e.target.value)} /></label><EffectiveValue field={effective.fields.estimatedHours} label="Estimated hours" kind="hours" /></div>
        <div className={styles.wide}><label>Client waiting for<input aria-label="Client waiting for" maxLength={500} value={visibleManual.clientWaitingFor} onChange={e => change('clientWaitingFor', e.target.value)} /></label><EffectiveValue field={effective.fields.clientWaitingFor} label="Client waiting for" /></div>
        <label className={styles.wide}>Notes<textarea aria-label="Notes" rows={3} maxLength={4000} value={visibleManual.notes} onChange={e => change('notes', e.target.value)} /></label>
        <details className={styles.wide}>
          <summary>Field ownership</summary>
          <p className={styles.source}>Staff values include deliberate blanks and Unknown. Use automatic assessment clears this field’s saved staff value; the previous value stays in history. Automatic installer suggestions do not assign an installer.</p>
          {Object.entries({ installerId: 'Installer', installDate: 'Target install date', focus: 'Focus selection', materialsEta: 'Materials ETA', ...READINESS_FIELDS, estimatedHours: 'Estimated hours', clientWaitingFor: 'Client waiting for', notes: 'Notes' }).map(([key, label]) => {
            const field = key as OwnedField
            const mode = patches[field]?.mode ?? base.ownership[field]
            return <div key={field} className={styles.actions}><span>{label}: {mode === 'staff' ? 'Staff value' : 'Automatic assessment'}</span>
              <button type="button" aria-label={`${mode === 'staff' ? 'Use automatic assessment' : 'Keep staff value'} for ${label}`} onClick={() => setFieldMode(field, mode === 'staff' ? 'auto' : 'staff')}>{mode === 'staff' ? 'Use automatic assessment' : field === 'buildingConsent' || field === 'installerId' || field === 'installDate' ? 'Keep current staff choice (including blank / Unknown)' : 'Keep staff value'}</button>
            </div>
          })}
        </details>
      </fieldset>
      <section className={styles.generated} aria-label="Generated assessment notes"><strong>Generated assessment notes · separate from staff Notes</strong><p>{effective.summary ?? 'No current generated summary. Open field evidence to inspect saved suggestions and missing coverage.'}</p>{effective.gaps.length > 0 && <p>Readiness gaps: {effective.gaps.map(field => FIELD_LABELS[field]).join(', ')}.</p>}{product.assessment?.coverage && <details><summary>Source coverage</summary><ul>{Object.entries(product.assessment.coverage).map(([kind, coverage]) => <li key={kind}>{coverageLabel(kind)}: {coverage.state}</li>)}</ul></details>}</section>
      <p className={styles.source}>Document requirements and issue checks are separate. These updates stay in RG Tools.</p>
      <div className={styles.actions}>
        <PrecisionButton type="submit" disabled={pending || !interactive || !dirty}>{pending ? 'Saving…' : 'Save product'}</PrecisionButton>
        {dirty && <button type="button" onClick={() => { if (product.itemId) draftStore.forget(product.itemId); const effective = effectiveProductFields(product); setBase(product); setManual(effective.manual); setReadinessDates(effective.readinessDates); setInstaller(product.installerId); setDate(product.installDate); setPatches({}); setDirty(false); setMessage('Loaded the saved version.'); if (!hasPendingProductEdits(product.itemId ?? undefined)) router.refresh() }}>Reload saved version</button>}
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
