import { DataPanel, PageHeader } from '@/components/precision-ui/PrecisionUI'

export default function WorkOrdersLoading() {
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Operations" title="Work Orders" description="Loading current Work Orders..." />
      <DataPanel title="Filters" eyebrow="Loading">
        <div className="grid gap-3 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-10 rounded-[var(--radius-control)] bg-surface-subtle" />
          ))}
        </div>
      </DataPanel>
      <DataPanel title="Current Work Orders" eyebrow="Loading">
        <div className="space-y-3 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-9 rounded-[var(--radius-control)] bg-surface-subtle" />
          ))}
        </div>
      </DataPanel>
    </div>
  )
}
