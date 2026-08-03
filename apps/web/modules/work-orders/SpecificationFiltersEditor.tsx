'use client'

import {
  FeedbackState,
  PrecisionButton,
  StatusBadge,
  TableShell,
} from '@/components/precision-ui/PrecisionUI'
import { useActionState, useState } from 'react'
import { productionSpecificationFieldLabel } from './production-specifications'
import type {
  WorkOrderSpecificationFilterConfigActionState,
} from './specification-filter-config-actions'
import type { WorkOrderSpecificationFilterConfig } from './specification-filter-config'
import styles from './SpecificationFiltersEditor.module.css'

const INITIAL_ACTION_STATE: WorkOrderSpecificationFilterConfigActionState = {
  status: 'idle',
  message: '',
}

export function SpecificationFiltersEditor({
  fields,
  saveAction,
}: {
  fields: readonly WorkOrderSpecificationFilterConfig[]
  saveAction: (
    previousState: WorkOrderSpecificationFilterConfigActionState,
    formData: FormData,
  ) => Promise<WorkOrderSpecificationFilterConfigActionState>
}) {
  const [orderedFields, setOrderedFields] = useState([...fields].sort((left, right) => left.order - right.order))
  const [actionState, formAction, pending] = useActionState(saveAction, INITIAL_ACTION_STATE)

  function moveField(index: number, offset: -1 | 1) {
    const destination = index + offset
    if (destination < 0 || destination >= orderedFields.length) return
    setOrderedFields((current) => {
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(destination, 0, moved)
      return next
    })
  }

  return (
    <form action={formAction} className={styles.editor}>
      <p className={styles.description}>
        Enable the canonical fields staff can filter by and set their global order. Disabled fields remain searchable.
      </p>

      <TableShell label="Production Specification filter order">
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Order</th>
              <th>Specification field</th>
              <th>Enabled</th>
            </tr>
          </thead>
          <tbody>
            {orderedFields.map((field, index) => {
              const label = productionSpecificationFieldLabel(field.field)
              return (
                <tr key={field.field}>
                  <td>
                    <input type="hidden" name={`order:${field.field}`} value={index + 1} />
                    <div className={styles.orderActions}>
                      <PrecisionButton
                        type="button"
                        tone="quiet"
                        aria-label={`Move ${label} filter up`}
                        disabled={index === 0}
                        onClick={() => moveField(index, -1)}
                      >
                        Up
                      </PrecisionButton>
                      <PrecisionButton
                        type="button"
                        tone="quiet"
                        aria-label={`Move ${label} filter down`}
                        disabled={index === orderedFields.length - 1}
                        onClick={() => moveField(index, 1)}
                      >
                        Down
                      </PrecisionButton>
                    </div>
                  </td>
                  <td className={styles.fieldLabel}>{label}</td>
                  <td>
                    <input
                      className={styles.checkbox}
                      type="checkbox"
                      name={`enabled:${field.field}`}
                      aria-label={`Enable ${label} filter`}
                      defaultChecked={field.enabled}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableShell>

      {pending && <FeedbackState tone="loading">Saving Production Specification filters…</FeedbackState>}
      {!pending && actionState.status === 'error' && (
        <FeedbackState tone="error">
          {actionState.message} Review the filter choices and try again.
        </FeedbackState>
      )}
      {!pending && actionState.status === 'success' && (
        <div role="status" aria-live="polite">
          <StatusBadge tone="positive">{actionState.message}</StatusBadge>
        </div>
      )}

      <div className={styles.formActions}>
        <PrecisionButton type="submit" disabled={pending}>
          {pending ? 'Saving specification filters…' : 'Save specification filters'}
        </PrecisionButton>
      </div>
    </form>
  )
}
