'use client'

import { useState, useSyncExternalStore, type ReactNode } from 'react'

type NoticeTone = 'error' | 'success' | 'warning' | 'info'

const toneClasses: Record<NoticeTone, string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
}

const DISMISSED_NOTICE_PREFIX = 'rgtools:dismissed-notice:'
const DISMISSED_NOTICE_EVENT = 'rgtools:notice-dismissed'

export function DismissibleNotice({
  tone,
  noticeKey,
  dismissalStorageKey,
  children,
}: {
  tone: NoticeTone
  noticeKey?: string | number
  dismissalStorageKey?: string
  children: ReactNode
}) {
  const currentNoticeKey = noticeKey ?? null
  const persistedNoticeKey = dismissalStorageKey
    ? `${DISMISSED_NOTICE_PREFIX}${dismissalStorageKey}:${String(currentNoticeKey ?? 'default')}`
    : null
  const [dismissedNoticeKey, setDismissedNoticeKey] = useState<string | number | null>()
  const wasPersistentlyDismissed = useSyncExternalStore(
    subscribeToDismissedNotices,
    () => readDismissedNotice(persistedNoticeKey),
    () => false,
  )
  if (dismissedNoticeKey === currentNoticeKey || wasPersistentlyDismissed) return null

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start justify-between gap-3 rounded border px-4 py-3 text-sm ${toneClasses[tone]}`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={() => {
          setDismissedNoticeKey(currentNoticeKey)
          persistDismissedNotice(persistedNoticeKey)
        }}
        aria-label="Close notification"
        className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-xl leading-none opacity-70 hover:bg-black/5 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
}

function subscribeToDismissedNotices(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange)
  window.addEventListener(DISMISSED_NOTICE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('storage', onStoreChange)
    window.removeEventListener(DISMISSED_NOTICE_EVENT, onStoreChange)
  }
}

function readDismissedNotice(storageKey: string | null) {
  if (!storageKey) return false
  try {
    return window.localStorage.getItem(storageKey) === '1'
  } catch {
    return false
  }
}

function persistDismissedNotice(storageKey: string | null) {
  if (!storageKey) return
  try {
    window.localStorage.setItem(storageKey, '1')
    window.dispatchEvent(new Event(DISMISSED_NOTICE_EVENT))
  } catch {
    // The notice still remains dismissed for this mounted component.
  }
}
