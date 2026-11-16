'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { refreshDashboardWorkOrdersAction } from '@/modules/work-orders/actions'
import { PrecisionButton } from '@/components/precision-ui/PrecisionUI'
import { hasPendingProductEdits } from './draft-guard'

export function RefreshControl({ lastSuccessfulAt }: { lastSuccessfulAt: string | null }) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState('')
  const busy = useRef(false)
  const router = useRouter()
  function refresh() {
    if (busy.current) return
    if (hasPendingProductEdits()) {
      setMessage('Save or reload your product edits before refreshing.')
      return
    }
    busy.current = true
    start(async () => {
      try {
        const result = await refreshDashboardWorkOrdersAction()
        const assessmentMessage = result.assessment?.unavailable ? ' Due assessment is unavailable; check AI configuration and evidence access.'
          : result.assessment ? ` ${result.assessment.assessedProducts} products assessed; ${result.assessment.reusedProducts} unchanged. ${result.assessment.pendingJobs} jobs pending; ${result.assessment.failedJobs} need retry.` : ''
        setMessage(result.ok ? 'ServiceM8 records refreshed.' + assessmentMessage : result.error ?? 'Refresh could not finish.')
        if (result.ok) {
          if (hasPendingProductEdits()) setMessage('Source refreshed. Save or reload your edits before updating this view.')
          else router.refresh()
        }
      } catch { setMessage('Refresh could not finish. Saved records are still available.') }
      finally { busy.current = false }
    })
  }
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !hasPendingProductEdits() && (!lastSuccessfulAt || Date.now() - Date.parse(lastSuccessfulAt) > 300000)) refresh()
    }, 60000)
    return () => clearInterval(timer)
    // A new successful source time restarts the freshness check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSuccessfulAt])
  return <div><PrecisionButton tone="secondary" disabled={pending} onClick={refresh}>{pending ? 'Refreshing…' : 'Refresh from ServiceM8'}</PrecisionButton><p role="status">{message}</p></div>
}
