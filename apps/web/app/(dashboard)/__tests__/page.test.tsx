import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.hoisted(() => vi.fn())
const redirectMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('@/modules/dashboard/config', () => ({ getDashboardTables: vi.fn(async () => []) }))
vi.mock('@/modules/dashboard/tables', () => ({ getTableMeta: vi.fn() }))
vi.mock('@/modules/dashboard/registry', () => ({ SERVER_TABLES: {} }))
vi.mock('@/modules/dashboard/kpis', () => ({
  getDashboardActionCounts: vi.fn(async () => ({
    staleLeads: 0,
    unsynced: 0,
    expiringSoon: 0,
    neverOpened: 0,
    forwarding: 0,
    goneCold: 0,
  })),
  getDashboardChartData: vi.fn(async () => ({ leadsPerWeek: [], pipelineByWeek: [] })),
  getDashboardKpis: vi.fn(async () => ({
    pipelineValue: 0,
    conversionRate: 0,
    volumeTrend: 0,
    leadVolume: 0,
    pipelineSparkline: [],
    conversionSparkline: [],
    volumeSparkline: [],
  })),
}))
vi.mock('@/modules/dashboard/ChartSection', () => ({ ChartSection: () => <div data-testid="chart-section" /> }))

import DashboardPage from '../page'

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue({ user: { id: 'user-1', role: 'staff' } })
})

describe('DashboardPage', () => {
  it('does not render Quick Capture on the dashboard', async () => {
    render(await DashboardPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByRole('heading', { level: 1, name: 'Operations dashboard' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Quick Capture' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Next actions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recommendations' })).toBeInTheDocument()
  })
})
