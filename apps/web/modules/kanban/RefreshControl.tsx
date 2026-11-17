'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { refreshDashboardWorkOrdersAction } from '@/modules/work-orders/actions'
import { assessmentRunStatusAction, continueAssessmentRunAction } from './assessment-run-actions'
import type { RunProgress } from './assessment-runs'
import { PrecisionButton } from '@/components/precision-ui/PrecisionUI'
import { hasPendingProductEdits } from './draft-guard'

function progressMessage(run: RunProgress) {
  const counts = `${run.completedJobs}/${run.totalJobs} jobs; ${run.assessedProducts} products assessed; ${run.reusedProducts} unchanged. ${run.reviewProducts} products need review; ${run.pendingJobs} jobs pending; ${run.failedJobs} need retry; ${run.unavailableJobs} unavailable.`
  return (run.state === 'active' ? 'Assessment in progress. ' : run.state === 'needs_retry' ? 'Assessment needs retry. ' : run.state === 'superseded' ? 'Assessment superseded. ' : 'Assessment finished. ') + counts + (run.reason ? ` ${run.reason}` : '')
}
export function RefreshControl({ lastSuccessfulAt }: { lastSuccessfulAt: string | null }) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState('')
  const busy = useRef(false), mounted = useRef(true), run = useRef<RunProgress | null>(null), recovered = useRef(false)
  const nextAttempt = useRef(0), failures = useRef(0)
  const router = useRouter()
  function updateView() { if (mounted.current && document.visibilityState === 'visible' && !hasPendingProductEdits()) router.refresh() }
  function accept(progress: RunProgress) {
    run.current = progress; failures.current = 0; nextAttempt.current = Date.now() + 3000
    if (!mounted.current) return
    if (hasPendingProductEdits()) {
      setMessage(previous => previous.includes('Save or reload') ? previous : 'Assessment progress is saved. Save or reload your product edits before updating this view.')
      return
    }
    setMessage(progressMessage(progress)); updateView()
  }
  function refresh() {
    if (busy.current || document.visibilityState !== 'visible') return
    if (hasPendingProductEdits()) { setMessage('Save or reload your product edits before refreshing.'); return }
    if (run.current?.state === 'active') { void advance(); return }
    busy.current = true
    start(async () => {
      try {
        const result = await refreshDashboardWorkOrdersAction()
        if (!mounted.current) return
        if (result.ok) {
          if (result.run) accept(result.run)
          else { setMessage('ServiceM8 records refreshed.'); updateView() }
          if (hasPendingProductEdits()) setMessage('Source refreshed. Save or reload your edits before updating this view.')
        } else setMessage(result.error ?? 'Refresh could not finish.')
      } catch { if (mounted.current) setMessage('Refresh could not finish. Saved records are still available.') }
      finally { busy.current = false }
    })
  }
  async function advance() {
    if (!mounted.current || busy.current || document.visibilityState !== 'visible' || Date.now() < nextAttempt.current) return
    if (hasPendingProductEdits()) { setMessage('Assessment paused. Save or reload your product edits to continue.'); return }
    busy.current = true
    try {
      const progress = run.current?.state === 'active' ? await continueAssessmentRunAction(run.current.id) : await assessmentRunStatusAction()
      if (!mounted.current) return
      recovered.current = true
      if (progress) accept(progress)
    } catch {
      failures.current++; nextAttempt.current = Date.now() + Math.min(30_000, 3000 * 2 ** failures.current)
      if (mounted.current) setMessage('Assessment paused after a temporary error. Progress is saved; retrying while this tab is visible.')
    } finally { busy.current = false }
  }
  useEffect(() => {
    mounted.current = true
    // Recover durable work after reload/navigation without a new source sync.
    if (document.visibilityState === 'visible' && !hasPendingProductEdits()) {
      void assessmentRunStatusAction().then(progress => {
        recovered.current = true
        if (mounted.current && !busy.current && !run.current && progress) accept(progress)
      }).catch(() => { nextAttempt.current = Date.now() + 6000 })
    }
    const polling = setInterval(() => {
      if (Date.now() >= nextAttempt.current && (run.current?.state === 'active' || !recovered.current)) void advance()
    }, 3000)
    const fullRefresh = setInterval(() => {
      if (run.current?.state === 'active') { void advance(); return }
      if (run.current?.state === 'needs_retry') return
      if (!lastSuccessfulAt || Date.now() - Date.parse(lastSuccessfulAt) > 300000) refresh()
    }, 60000)
    const visible = () => { if (document.visibilityState === 'visible') void advance() }
    document.addEventListener('visibilitychange', visible)
    return () => { mounted.current = false; clearInterval(polling); clearInterval(fullRefresh); document.removeEventListener('visibilitychange', visible) }
    // Refs preserve in-flight work and drafts across server refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSuccessfulAt])
  return <div><PrecisionButton tone="secondary" disabled={pending} onClick={refresh}>{pending ? 'Refreshing…' : 'Refresh from ServiceM8'}</PrecisionButton><p role="status">{message}</p></div>
}
