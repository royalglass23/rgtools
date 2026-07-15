import { describe, expect, it } from 'vitest'
import { auditExportRowsToCsv, rowsToCsv } from '../audit-export'

describe('rowsToCsv', () => {
  it('neutralizes spreadsheet formula prefixes while preserving ordinary values', () => {
    const csv = rowsToCsv([[
      '=HYPERLINK("https://attacker.test")',
      '+SUM(1,1)',
      '-2+3',
      '@SUM(1,1)',
      '\tSUM(1,1)',
      '   =SUM(1,1)',
      '\t  +SUM(1,1)',
      ' ordinary leading space',
      'Glass + hardware',
      -12,
    ]])

    expect(csv).toBe([
      '"\'=HYPERLINK(""https://attacker.test"")"',
      '"\'+SUM(1,1)"',
      '"\'-2+3"',
      '"\'@SUM(1,1)"',
      '"\'\tSUM(1,1)"',
      '"\'   =SUM(1,1)"',
      '"\'\t  +SUM(1,1)"',
      '" ordinary leading space"',
      '"Glass + hardware"',
      '"-12"',
    ].join(','))
  })
})

describe('auditExportRowsToCsv', () => {
  it('renders diff detail and includes archive/IP columns', () => {
    const csv = auditExportRowsToCsv([
      {
        id: 'a1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        actorId: 'u1',
        actorName: 'alice',
        entityType: 'lead',
        action: 'lead.edited',
        targetId: 'l1',
        detail: { tier: { from: 'B', to: 'A' } },
        ipAddress: '203.0.113.1',
        archivedAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ])

    expect(csv).toContain('"entityType"')
    expect(csv).toContain('"ipAddress"')
    expect(csv).toContain('"archivedAt"')
    expect(csv).toContain('"tier: B -> A"')
  })
})
