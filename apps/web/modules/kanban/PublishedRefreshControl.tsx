'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { publishedRefreshStatus, startPublishedRefresh } from './bot-refresh'
import styles from './WorkOrderDashboard.module.css'

const POLL_MS = 10_000, WAIT_MS = 5 * 60_000
const WAITING_MESSAGE = "Waiting for Kanban's completion receipt. Current published rows remain visible."

export function PublishedRefreshControl() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const active = useRef(false), alive = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (timer.current) clearTimeout(timer.current) } }, [])
  async function refresh() {
    if (active.current) return
    active.current = true; setPending(true); setMessage('Starting Kanban refresh…')
    const finish = (text: string) => { if (alive.current) { setMessage(text); setPending(false); active.current = false } }
    try {
      const result = await startPublishedRefresh()
      if (!alive.current) return
      if (!result.ok) { finish(result.error); return }
      const requestId = result.requestId
      setMessage(WAITING_MESSAGE)
      const deadline = Date.now() + WAIT_MS
      async function check() {
        if (!alive.current) return
        try {
          const status = await publishedRefreshStatus(requestId)
          if (!alive.current) return
          if (status.state === 'complete') {
            finish(status.changed ? 'Kanban finished. Loading the published update…' : 'Kanban finished with no changes. Reloading published rows…')
            router.refresh(); return
          }
          if (status.state === 'failed') { finish(status.error); return }
          setMessage(status.state === 'unconfirmed' ? status.error : WAITING_MESSAGE)
        } catch {
          if (!alive.current) return
          setMessage('Kanban completion could not be checked. The bot may still be running; status checking will continue.')
        }
        if (Date.now() >= deadline) { finish('Kanban completion is not yet confirmed. The bot may still be running; reload later or check the bot before retrying.'); return }
        timer.current = setTimeout(check, POLL_MS)
      }
      timer.current = setTimeout(check, POLL_MS)
    } catch { finish('Refresh could not be started. Existing rows remain visible; check the bot before retrying.') }
  }
  return <div className={styles.toolbar}>
    <button type="button" disabled={pending} onClick={refresh}>{pending ? 'Refreshing…' : 'Refresh'}</button>
    {message && <p role="status" className={styles.source}>{message}</p>}
  </div>
}
