'use client'

import { useFormStatus } from 'react-dom'

export function WorkOrderRefreshButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded bg-[#142B3A] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1d3d52] disabled:cursor-wait disabled:bg-[#365364]"
    >
      {pending && (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
        />
      )}
      {pending ? <span role="status">Fetching data...</span> : 'Refresh from ServiceM8'}
    </button>
  )
}
