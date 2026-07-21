import { requireModule } from '@/lib/guard'
import Link from 'next/link'
import { PricingEditor } from '@/modules/admin/pricing/PricingEditor'
import type { PricingConfig } from '@/modules/admin/pricing/config-admin'
import {
  activatePricingConfigVersion,
  deletePricingConfigVersion,
  getPricingVersionRows,
} from '@/modules/admin/pricing/actions'

export default async function CalculatorPricingAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireModule('admin/calculator-pricing')

  const params = await searchParams
  const selectedVersionId = Array.isArray(params.version) ? params.version[0] : params.version
  const versionRows = await getPricingVersionRows()
  const selectedVersion = selectedVersionId
    ? versionRows.find((row) => row.id === selectedVersionId)
    : versionRows.find((row) => row.isActive)
  const activeVersion = versionRows.find((row) => row.isActive)
  const readOnly = Boolean(selectedVersion && !selectedVersion.isActive)

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Cost Calculator Price</h1>
          <p className="mt-1 text-sm text-gray-500">
            Active version: <span className="font-mono text-gray-700">{activeVersion?.versionLabel ?? 'None seeded'}</span>
          </p>
        </div>
        {readOnly && (
          <Link href="/admin/calculator-pricing" className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm">
            Back to active editor
          </Link>
        )}
      </div>

      <section className="rounded border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-800">Version History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Version</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Created by</th>
                <th className="px-4 py-2 font-medium">View</th>
              </tr>
            </thead>
            <tbody>
              {versionRows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs text-gray-700">{row.versionLabel}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-1 text-xs ${row.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {row.isActive ? 'Active' : 'Past'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{formatDate(row.createdAt)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{row.createdBy ?? '-'}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      {row.isActive ? (
                        <Link href="/admin/calculator-pricing" className="text-sm text-blue-700 hover:text-blue-900">
                          Open editor
                        </Link>
                      ) : (
                        <Link href={`/admin/calculator-pricing?version=${row.id}`} className="text-sm text-blue-700 hover:text-blue-900">
                          View
                        </Link>
                      )}
                      {!row.isActive && (
                        <>
                          <details className="relative">
                            <summary className="cursor-pointer list-none text-sm text-green-700 hover:text-green-900">
                              Activate
                            </summary>
                            <form action={activatePricingConfigVersionAction} className="absolute right-0 z-10 mt-2 w-72 rounded border border-gray-200 bg-white p-3 shadow-lg">
                              <input type="hidden" name="versionId" value={row.id} />
                              <label className="block text-xs font-medium uppercase text-gray-500">
                                Remarks
                                <textarea
                                  name="activationNote"
                                  required
                                  rows={3}
                                  className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm normal-case text-gray-900 placeholder:text-gray-500"
                                />
                              </label>
                              <button type="submit" className="mt-2 rounded bg-green-700 px-3 py-1.5 text-sm text-white">
                                Activate
                              </button>
                            </form>
                          </details>
                          <details className="relative">
                            <summary className="cursor-pointer list-none text-sm text-red-700 hover:text-red-900">
                              Delete
                            </summary>
                            <form action={deletePricingConfigVersionAction} className="absolute right-0 z-10 mt-2 w-72 rounded border border-gray-200 bg-white p-3 shadow-lg">
                              <input type="hidden" name="versionId" value={row.id} />
                              <label className="block text-xs font-medium uppercase text-gray-500">
                                Remarks
                                <textarea
                                  name="deleteNote"
                                  required
                                  rows={3}
                                  className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm normal-case text-gray-900 placeholder:text-gray-500"
                                />
                              </label>
                              <button type="submit" className="mt-2 rounded bg-red-700 px-3 py-1.5 text-sm text-white">
                                Delete
                              </button>
                            </form>
                          </details>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {versionRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-sm text-gray-500">
                    No pricing versions have been seeded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedVersion ? (
        <PricingEditor
          key={selectedVersion.id}
          initialConfig={selectedVersion.config as PricingConfig}
          readOnly={readOnly}
        />
      ) : (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Seed the first pricing version before editing calculator prices in rgtools.
        </div>
      )}
    </div>
  )
}

function formatDate(value: Date) {
  return `${value.toLocaleDateString('en-NZ')} ${value.toLocaleTimeString('en-NZ', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })}`
}

async function activatePricingConfigVersionAction(formData: FormData) {
  'use server'
  await activatePricingConfigVersion(formData)
}

async function deletePricingConfigVersionAction(formData: FormData) {
  'use server'
  await deletePricingConfigVersion(formData)
}
