'use client'

import { useState } from 'react'
import type { WorkOrderSummaryFieldConfig } from './summary-config'
import { canConfigureSummaryFieldAsEditable } from './summary-field-policy'

export function SummaryFieldsEditor({ fields }: { fields: WorkOrderSummaryFieldConfig[] }) {
  const savedConfigKey = fields
    .map((field) => `${field.id}:${field.visible}:${field.filterable}:${field.editable}:${field.order}`)
    .join('|')

  return <SummaryFieldsEditorState key={savedConfigKey} fields={fields} />
}

function SummaryFieldsEditorState({ fields }: { fields: WorkOrderSummaryFieldConfig[] }) {
  const [orderedFields, setOrderedFields] = useState(fields)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  function moveField(fromId: string, toId: string) {
    if (fromId === toId) return
    setOrderedFields((current) => {
      const fromIndex = current.findIndex((field) => field.id === fromId)
      const toIndex = current.findIndex((field) => field.id === toId)
      if (fromIndex < 0 || toIndex < 0) return current

      const next = [...current]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="w-12 px-4 py-3"></th>
            <th className="px-4 py-3">Field</th>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Visible</th>
            <th className="px-4 py-3">Filterable</th>
            <th className="px-4 py-3">Editable</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {orderedFields.map((field, index) => (
            <tr
              key={field.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', field.id)
                setDraggingId(field.id)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(event) => {
                event.preventDefault()
                const sourceId = event.dataTransfer.getData('text/plain')
                moveField(sourceId, field.id)
                setDraggingId(null)
              }}
              onDragEnd={() => setDraggingId(null)}
              className={draggingId === field.id ? 'bg-sky-50' : 'bg-white'}
            >
              <td className="px-4 py-3 text-gray-400">
                <input type="hidden" name={`order:${field.id}`} value={index + 1} />
                <span className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded border border-gray-300 text-sm font-semibold active:cursor-grabbing">
                  ::
                </span>
              </td>
              <td className="px-4 py-3 font-medium text-gray-900">{field.label}</td>
              <td className="px-4 py-3 text-gray-700">{field.source}</td>
              <td className="px-4 py-3 text-gray-700">
                <input type="checkbox" name={`visible:${field.id}`} defaultChecked={field.visible} />
              </td>
              <td className="px-4 py-3 text-gray-700">
                <input type="checkbox" name={`filterable:${field.id}`} defaultChecked={field.filterable} />
              </td>
              <td className="px-4 py-3 text-gray-700">
                {canConfigureSummaryFieldAsEditable(field.id) ? (
                  <input type="checkbox" name={`editable:${field.id}`} defaultChecked={field.editable} />
                ) : (
                  <span className="text-xs text-gray-500">Read only</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
