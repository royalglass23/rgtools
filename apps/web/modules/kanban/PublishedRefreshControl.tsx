'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { currentPublicationVersion, startPublishedRefresh } from './bot-refresh'
import styles from './WorkOrderDashboard.module.css'

export function PublishedRefreshControl({ publicationId = null }: { publicationId?: string | null }) {
  const router = useRouter()
  const [pending, setPending] = useState(false), [message, setMessage] = useState('')
  const active = useRef(false), alive = useRef(true)
  useEffect(() => {
    alive.current = true
    let checking = false
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible' || checking) return
      checking = true
      try {
        const latest = await currentPublicationVersion()
        if (alive.current && latest !== publicationId) router.refresh()
      } catch { /* A later check or normal navigation can load the stored publication. */ }
      finally { checking = false }
    }, 30_000)
    return () => { alive.current = false; clearInterval(timer) }
  }, [publicationId, router])
  async function requestUpdate() {
    if (active.current) return
    active.current = true; setPending(true); setMessage('Requesting update…')
    try {
      const result = await startPublishedRefresh()
      if (alive.current) setMessage(result.ok ? 'Update requested. Current rows remain available; new publications load automatically while this page is visible.' : result.error)
    } catch { if (alive.current) setMessage('Update request acceptance could not be confirmed. Check the bot before retrying.') }
    finally { active.current = false; if (alive.current) setPending(false) }
  }
  return <div className={styles.toolbar}>
    <button type="button" disabled={pending} onClick={requestUpdate}>{pending ? 'Requesting…' : 'Request update'}</button>
    {message && <p role="status" className={styles.source}>{message}</p>}
  </div>
}
