import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ViewerAnalyticsTable } from '../ViewerAnalyticsTable'
import type { DeviceSession, EmailGroup } from '../viewer-analytics'

function device(overrides: Partial<DeviceSession> = {}): DeviceSession {
  return {
    sessionId: 'd1',
    ip: '203.0.113.7',
    geoCity: 'Auckland',
    geoIsp: 'Spark',
    geoCountry: 'NZ',
    deviceType: 'mobile',
    opens: 1,
    totalTimeMs: 12000,
    maxScrollDepth: 80,
    pagesSeen: 2,
    perPage: [
      { pageNumber: 1, activeMs: 4000 },
      { pageNumber: 2, activeMs: 8000 },
    ],
    hasDownload: false,
    hasCta: false,
    firstSeenAt: new Date('2026-06-17T01:00:00Z'),
    lastSeenAt: new Date('2026-06-17T01:05:00Z'),
    ...overrides,
  }
}

describe('ViewerAnalyticsTable (non-gated)', () => {
  it('renders one row per device and opens the per-page modal on click', () => {
    render(
      <ViewerAnalyticsTable
        gated={false}
        devices={[device(), device({ sessionId: 'd2', ip: '203.0.113.8' })]}
      />,
    )
    const rows = screen.getAllByRole('button', { name: /view per-page breakdown/i })
    expect(rows).toHaveLength(2)
    fireEvent.click(rows[0])
    expect(screen.getByRole('dialog', { name: /per-page time/i })).toBeTruthy()
    expect(screen.getByText('Page 1')).toBeTruthy()
    expect(screen.getByText('Page 2')).toBeTruthy()
    expect(screen.getByText(/Mobile · Auckland · Spark · 203\.0\.113\.xxx/)).toBeTruthy()
  })

  it('shows an empty state when there are no devices', () => {
    render(<ViewerAnalyticsTable gated={false} devices={[]} />)
    expect(screen.getByText(/no viewer sessions yet/i)).toBeTruthy()
  })

  it('paginates to 5 rows by default and pages through the rest', () => {
    const devices = Array.from({ length: 7 }, (_, i) => device({ sessionId: `s${i}`, ip: `203.0.113.${i}` }))
    render(<ViewerAnalyticsTable gated={false} devices={devices} />)

    expect(screen.getAllByRole('button', { name: /view per-page breakdown/i })).toHaveLength(5)
    expect(screen.getByText('7 devices')).toBeTruthy()
    expect(screen.getByText('Page 1 of 2')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getAllByRole('button', { name: /view per-page breakdown/i })).toHaveLength(2)
    expect(screen.getByText('Page 2 of 2')).toBeTruthy()
  })

  it('changes rows per page', () => {
    const devices = Array.from({ length: 7 }, (_, i) => device({ sessionId: `s${i}`, ip: `203.0.113.${i}` }))
    render(<ViewerAnalyticsTable gated={false} devices={devices} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Page size' }), { target: { value: '10' } })
    expect(screen.getAllByRole('button', { name: /view per-page breakdown/i })).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getAllByRole('button', { name: /view per-page breakdown/i })).toHaveLength(7)
    expect(screen.getByText('Page 1 of 1')).toBeTruthy()
  })
})

describe('ViewerAnalyticsTable (gated)', () => {
  const email: EmailGroup = {
    email: 'client@x.com',
    name: 'Client',
    devices: [device(), device({ sessionId: 'd2', ip: '203.0.113.8' })],
    opens: 2,
    totalTimeMs: 24000,
    pagesSeen: 2,
    hasDownload: false,
    hasCta: false,
    lastSeenAt: new Date('2026-06-17T01:05:00Z'),
    forwardingSuspected: true,
  }

  it('renders one row per email with a forwarding badge and expands to devices', () => {
    render(<ViewerAnalyticsTable gated emails={[email]} />)
    expect(screen.getByText('client@x.com')).toBeTruthy()
    expect(screen.getByText(/forwarding/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /expand client@x.com/i }))
    const deviceButtons = screen.getAllByRole('button', { name: /view per-page breakdown/i })
    expect(deviceButtons).toHaveLength(2)

    fireEvent.click(deviceButtons[0])
    expect(screen.getByRole('dialog', { name: /per-page time/i })).toBeTruthy()
  })

  it('shows an empty state when there are no gated viewers', () => {
    render(<ViewerAnalyticsTable gated emails={[]} />)
    expect(screen.getByText(/no gated viewers yet/i)).toBeTruthy()
  })
})
