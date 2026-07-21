import { createHash } from 'node:crypto'

import { validateWorkOrderItemLabel, type WorkOrderItemLabelGenerator } from './item-labels'

export type WorkOrderItemLabelStatus = 'pending' | 'generated' | 'manual' | 'failed' | 'source_changed'

export type WorkOrderItemLabelRecord = {
  id: string
  originalDescription: string
  generatedLabel: string | null
  manualLabelOverride: string | null
  labelStatus: WorkOrderItemLabelStatus
  sourceDescriptionFingerprint: string | null
}

export type WorkOrderItemLabelStore = {
  markPending(itemId: string): Promise<void>
  saveGenerated(itemId: string, label: string, sourceDescriptionFingerprint: string): Promise<void>
  markFailed(itemId: string): Promise<void>
  markSourceChanged(itemId: string): Promise<void>
}

export async function refreshWorkOrderItemLabels(
  items: WorkOrderItemLabelRecord[],
  store: WorkOrderItemLabelStore,
  generateLabel: WorkOrderItemLabelGenerator,
) {
  let generated = 0
  let failed = 0
  let sourceChanged = 0

  for (const item of items) {
    const currentFingerprint = fingerprintSourceDescription(item.originalDescription)
    if (item.manualLabelOverride) {
      if (item.sourceDescriptionFingerprint !== currentFingerprint) {
        await store.markSourceChanged(item.id)
        sourceChanged += 1
      }
      continue
    }
    if (item.generatedLabel && item.sourceDescriptionFingerprint === currentFingerprint) continue

    await store.markPending(item.id)
    try {
      const label = validateWorkOrderItemLabel(await generateLabel(item.originalDescription))
      await store.saveGenerated(item.id, label, currentFingerprint)
      generated += 1
    } catch {
      await store.markFailed(item.id)
      failed += 1
    }
  }

  return { generated, failed, sourceChanged }
}

export function fingerprintSourceDescription(originalDescription: string) {
  return createHash('sha256').update(originalDescription).digest('hex')
}
