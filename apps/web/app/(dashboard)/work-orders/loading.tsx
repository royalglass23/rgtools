export default function WorkOrdersLoading() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-950">Work Orders</h1>
        <p className="mt-1 text-sm text-gray-500">Loading current Work Orders...</p>
      </div>
      <div className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-10 rounded bg-gray-100" />
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
        <div className="space-y-3 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-9 rounded bg-gray-100" />
          ))}
        </div>
      </div>
    </div>
  )
}
