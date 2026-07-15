import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SummaryFieldsEditor } from '../SummaryFieldsEditor'
import type { WorkOrderSummaryFieldConfig } from '../summary-config'

const riskField: WorkOrderSummaryFieldConfig = {
  id: 'risk',
  label: 'Risk',
  source: 'rg',
  visible: true,
  filterable: true,
  editable: true,
  order: 1,
}

describe('SummaryFieldsEditor', () => {
  it('reflects the saved Editable value when server props refresh', () => {
    const view = render(<SummaryFieldsEditor fields={[riskField]} />)
    const editableCheckbox = () => view.container.querySelector<HTMLInputElement>('input[name="editable:risk"]')

    expect(editableCheckbox()).toBeChecked()

    view.rerender(<SummaryFieldsEditor fields={[{ ...riskField, editable: false }]} />)

    expect(editableCheckbox()).not.toBeChecked()
  })
})
