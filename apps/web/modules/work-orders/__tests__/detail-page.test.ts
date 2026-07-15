import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function pageSource() {
  return readFileSync(
    join(process.cwd(), 'app/(dashboard)/work-orders/[id]/page.tsx'),
    'utf8',
  )
}

describe('work order detail page', () => {
  it('renders job summary, client context, contacts, and timeline surfaces without internal ServiceM8 identifiers', () => {
    const source = pageSource()

    for (const text of [
      'Job Summary',
      'Job number',
      'Address',
      'Status',
      'Lead score',
      'Description',
      'Client Context',
      'Client notes',
      'Client Context Summary',
      'Contacts',
      'Job contact',
      'Work Order Items',
      'No Work Order Items have been synced yet.',
      'Original ServiceM8 description',
      'Project Timeline',
    ]) {
      expect(source).toContain(text)
    }
    expect(source).toContain('{detail.companyName &&')
    expect(source).toContain('detail.items.map')
    expect(source).not.toContain('No job number')
    expect(source).not.toContain('ServiceM8 job UUID')
    expect(source).not.toContain('Client Approach Note')
  })

  it('retires the parent operational write path and identifies item audit events', () => {
    const source = pageSource()

    expect(source).toContain('permissions.canManage &&')
    expect(source).toContain('Add note')
    expect(source).toContain('event.itemLabel')
    expect(source).toContain('event.actorUsername')
    expect(source).not.toContain('Manage Work Order')
    expect(source).not.toContain('updateWorkOrderOperationalFieldsAction')
    expect(source).not.toContain('Save changes')
  })
})
