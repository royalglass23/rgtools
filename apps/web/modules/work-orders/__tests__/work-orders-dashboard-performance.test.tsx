import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../actions', () => ({
  regenerateWorkOrderItemLabelAction: vi.fn(),
  updateWorkOrderItemLabelAction: vi.fn(),
  updateWorkOrderItemOperationalFieldAction: vi.fn(),
}))
vi.mock('../production-specification-actions', () => ({
  confirmWorkOrderItemProductionSpecificationAction: vi.fn(),
  createWorkOrderItemProductionSpecificationDraftFromSourceChangeAction: vi.fn(),
  ignoreWorkOrderItemProductionSpecificationSourceChangeAction: vi.fn(),
  retryWorkOrderItemProductionSpecificationEnrichmentAction: vi.fn(),
  saveWorkOrderItemProductionSpecificationDraftAction: vi.fn(),
}))

import { ExistingItemRolloutPanel } from '../ExistingItemRolloutPanel'
import type { ExistingItemRolloutStatus } from '../existing-item-rollout'
import { WorkOrderItemsSummary } from '../WorkOrderItemsSummary'
import type { WorkOrderItemSummaryRow } from '../work-order-items'

describe('Work Orders rollout dashboard performance', () => {
  it('keeps the warmed 100-item dashboard render within the 10-percent rollout budget', () => {
    const items = realisticItems(100)
    const baseline = () => renderToStaticMarkup(
      <WorkOrderItemsSummary items={items} productionSpecificationsEnabled={false} />,
    )
    const withRollout = () => renderToStaticMarkup(
      <>
        <ExistingItemRolloutPanel
          initialStatus={completedRolloutStatus()}
          startAction={vi.fn()}
          resumeAction={vi.fn()}
          statusAction={vi.fn()}
          canManage={false}
        />
        <WorkOrderItemsSummary items={items} productionSpecificationsEnabled={false} />
      </>,
    )

    baseline()
    withRollout()
    const baselineSamples: number[] = []
    const rolloutSamples: number[] = []
    for (let run = 0; run < 5; run += 1) {
      baselineSamples.push(measureRender(baseline))
      rolloutSamples.push(measureRender(withRollout))
    }

    const baselineMedian = median(baselineSamples)
    const rolloutMedian = median(rolloutSamples)
    console.log(JSON.stringify({
      fixture: '100 realistic Work Order items',
      baselineSamplesMs: baselineSamples,
      rolloutSamplesMs: rolloutSamples,
      baselineMedianMs: baselineMedian,
      rolloutMedianMs: rolloutMedian,
      regressionPercent: ((rolloutMedian / baselineMedian) - 1) * 100,
    }))
    expect(rolloutMedian).toBeLessThanOrEqual(baselineMedian * 1.1)
  }, 30_000)
})

function realisticItems(count: number): WorkOrderItemSummaryRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `performance-item-${index + 1}`,
    workOrderId: 'performance-work-order',
    itemCode: `GLASS-${String(index + 1).padStart(3, '0')}`,
    quantity: index % 3 === 0 ? '2.000' : '1.000',
    originalDescription: `Realistic glass item ${index + 1} with measured opening and hardware notes`,
    lineTotalExcludingGst: `${900 + index}.00`,
    generatedLabel: `Glass item ${index + 1}`,
    manualLabelOverride: null,
    labelStatus: 'generated',
    sourceDescriptionFingerprint: `fingerprint-${index + 1}`,
    isActive: true,
    installerId: null,
    installerName: null,
    stageOptionId: null,
    stageName: null,
    hardwareStatusOptionId: null,
    hardwareStatusName: null,
    maintenanceProgram: false,
    installDate: null,
    dateCompleted: null,
    riskLevel: index % 10 === 0 ? 'high' : null,
    importance: index % 4 === 0 ? 'medium' : null,
    productionSpecification: null,
    enrichmentStatus: null,
  }))
}

function completedRolloutStatus(): ExistingItemRolloutStatus {
  return {
    id: 'performance-rollout',
    correlationId: 'performance-correlation',
    state: 'completed',
    total: 100,
    queued: 0,
    processing: 0,
    drafted: 92,
    needsReview: 92,
    unmapped: 3,
    failed: 5,
    retried: 5,
    skippedRemoved: 0,
    skippedConfirmed: 0,
    skippedCurrentKey: 0,
    safeFailureClass: null,
    startedAt: new Date('2026-07-20T03:00:00.000Z'),
    completedAt: new Date('2026-07-20T03:01:00.000Z'),
    durationMs: 60_000,
  }
}

function measureRender(renderDashboard: () => string) {
  const startedAt = performance.now()
  renderDashboard()
  return performance.now() - startedAt
}

function median(samples: number[]) {
  return [...samples].sort((left, right) => left - right)[2]
}
