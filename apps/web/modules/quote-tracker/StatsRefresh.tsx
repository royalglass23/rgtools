'use client'

import { useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function StatsRefresh() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const pendingRef = useRef(false)

  useEffect(() => { pendingRef.current = pending }, [pending])
  useEffect(() => {
    let lastRefreshAt = -Infinity
    function refresh() {
      if (document.visibilityState !== 'visible' || pendingRef.current) return
      // Server refreshes should not replace controls while someone is editing.
      if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (Date.now() - lastRefreshAt < 5000) return
      lastRefreshAt = Date.now()
      startTransition(() => router.refresh())
    }
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    refresh()
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [router, startTransition])
  return null
}
