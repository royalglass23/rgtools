import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WorkOrderJobUpdateForm } from '../WorkOrderJobUpdateForm'

describe('WorkOrderJobUpdateForm', () => {
  it('updates one entered ServiceM8 job and reports the completed AI work', async () => {
    const updateAction = vi.fn(async (_previousState: unknown, formData: FormData) => ({
      status: 'success' as const,
      message: `Job ${formData.get('jobNumber')} updated: 2 items refreshed and 2 AI drafts created.`,
    }))
    render(<WorkOrderJobUpdateForm updateAction={updateAction} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'ServiceM8 job number' }), {
      target: { value: 'R260210' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update job' }))

    await waitFor(() => expect(updateAction).toHaveBeenCalledOnce())
    expect(screen.getByRole('status')).toHaveTextContent(
      'Job R260210 updated: 2 items refreshed and 2 AI drafts created.',
    )
  })
})
