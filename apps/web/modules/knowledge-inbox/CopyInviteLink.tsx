'use client'

import { useState } from 'react'

export function CopyInviteLink({ token, label }: { token: string; label: string }) {
  const [message, setMessage] = useState('')
  async function copy() {
    try {
      const url = new URL('/knowledge-response', window.location.origin)
      url.searchParams.set('token', token)
      await navigator.clipboard.writeText(url.href)
      setMessage('Link copied. Send it only to the intended respondent.')
    } catch {
      setMessage('Could not copy the link. Please try again.')
    }
  }
  return <div className="flex flex-wrap items-center gap-3">
    <button type="button" onClick={copy} className="rounded border border-teal-800 px-3 py-2 text-sm font-semibold text-teal-800">Copy {label} response link</button>
    <span role="status" className="text-xs text-slate-600">{message}</span>
  </div>
}
