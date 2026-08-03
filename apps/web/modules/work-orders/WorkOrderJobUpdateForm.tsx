'use client'

import { useActionState } from 'react'

export type WorkOrderJobUpdateState = {
  status: 'idle' | 'success' | 'error'
  message: string
}

type WorkOrderJobUpdateAction = (
  previousState: WorkOrderJobUpdateState,
  formData: FormData,
) => Promise<WorkOrderJobUpdateState>

const INITIAL_STATE: WorkOrderJobUpdateState = {
  status: 'idle',
  message: '',
}

export function WorkOrderJobUpdateForm({
  updateAction,
}: {
  updateAction: WorkOrderJobUpdateAction
}) {
  const [state, formAction, pending] = useActionState(updateAction, INITIAL_STATE)

  return (
    <div className="space-y-2">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          ServiceM8 job number
          <input
            name="jobNumber"
            type="text"
            required
            autoComplete="off"
            disabled={pending}
            placeholder="R260210"
            className="w-40 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 disabled:cursor-wait disabled:bg-gray-100"
          />
        </label>
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
          {pending ? 'Updating job...' : 'Update job'}
        </button>
      </form>
      {state.message && (
        <p
          role={state.status === 'error' ? 'alert' : 'status'}
          className={state.status === 'error' ? 'text-sm text-red-700' : 'text-sm text-emerald-700'}
        >
          {state.message}
        </p>
      )}
    </div>
  )
}
