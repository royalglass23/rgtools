import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function pageSource() {
  return readFileSync(
    join(process.cwd(), 'app/(dashboard)/admin/work-orders/page.tsx'),
    'utf8',
  )
}

function editorSource() {
  return readFileSync(
    join(process.cwd(), 'modules/work-orders/SummaryFieldsEditor.tsx'),
    'utf8',
  )
}

function summaryConfigSource() {
  return readFileSync(
    join(process.cwd(), 'modules/work-orders/summary-config.ts'),
    'utf8',
  )
}

describe('work order admin page', () => {
  it('lets admins deactivate controlled options instead of deleting them', () => {
    const source = pageSource()

    expect(source).toContain('deactivateWorkOrderInstallerAction')
    expect(source).toContain('deactivateWorkOrderStageAction')
    expect(source).toContain('deactivateWorkOrderHardwareStatusAction')
    expect(source).toContain('Deactivate')
    expect(source).not.toContain('Delete')
  })

  it('surfaces global summary configuration controls', () => {
    const source = `${pageSource()}\n${editorSource()}\n${summaryConfigSource()}`

    expect(source).toContain('Work Order Summary Fields')
    expect(source).toContain('Maintenance Program')
    expect(source).toContain('Visible')
    expect(source).toContain('Filterable')
    expect(editorSource()).toContain('>Editable<')
    expect(editorSource()).toContain('canConfigureSummaryFieldAsEditable')
    expect(source).not.toContain('Display order')
    expect(source).toContain("params?.summarySaved === '1'")
    expect(source).toContain('Work Order summary fields saved.')
    expect(source.indexOf('Work Order summary fields saved.')).toBeLessThan(source.indexOf('Work Order Configuration'))
  })

  it('reorders summary fields by dragging rows while preserving order form fields', () => {
    const source = editorSource()

    expect(source).toContain('draggable')
    expect(source).toContain('onDragStart')
    expect(source).toContain('onDrop')
    expect(source).toContain('name={`order:${field.id}`}')
    expect(source).not.toContain('type="number"')
  })

  it('lets configure users maintain billing-line exclusions for the next refresh', () => {
    const source = pageSource()

    expect(source).toContain('Billing line exclusions')
    expect(source).toContain('saveWorkOrderBillingExclusionsAction')
    expect(source).toContain('One case-insensitive term per line')
  })
})
