import { requireModule } from '@/lib/guard'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users, modules, userModuleAccess, auditLog, errorLog } from '@rgtools/db/schema'
import { and, count, desc, eq, gte, isNull, like, lte, or } from 'drizzle-orm'
import { deriveAuditEntityType, formatAuditDetail } from '@/lib/audit'
import Link from 'next/link'
import { PaginationBar } from '@/components/pagination/PaginationBar'
import { CreateUserForm } from '@/modules/admin/CreateUserForm'
import { TestErrorButton } from '@/modules/admin/TestErrorButton'
import { UserRow } from '@/modules/admin/UserRow'
import { ExportDropdown } from '@/modules/admin/ExportDropdown'
import { MenuAvailabilityForm } from '@/modules/admin/MenuAvailabilityForm'
import { getMenuAvailability } from '@/lib/menu-availability-db'

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100] as const
const AUDIT_ENTITY_TYPES = ['user', 'access', 'lead', 'quote', 'scoring', 'pricing'] as const

function parsePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw ?? '1')
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

function parsePageSize(value: string | string[] | undefined, fallback = 10) {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw ?? String(fallback))
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? parsed : fallback
}

function parseString(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.trim() || ''
}

function parseDateParam(value: string | string[] | undefined) {
  const raw = parseString(value)
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

function endOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function auditFieldValue(detail: Record<string, unknown> | null, field: string) {
  const value = detail?.[field]
  if (isRecord(value) && ('to' in value || 'from' in value)) {
    return value.to ?? value.from ?? null
  }
  return value ?? null
}

function auditDetailWithoutTarget(detail: Record<string, unknown> | null) {
  if (!detail) return null
  return Object.fromEntries(Object.entries(detail).filter(([key]) => key !== 'username'))
}

function buildHref(
  params: Record<string, string | string[] | undefined>,
  overrides: Record<string, string>,
) {
  const query = new URLSearchParams()
  for (const [key, val] of Object.entries(params)) {
    const v = Array.isArray(val) ? val[0] : val
    if (v) query.set(key, v)
  }
  for (const [key, val] of Object.entries(overrides)) {
    query.set(key, val)
  }
  return `/admin/administration?${query.toString()}`
}

function HiddenSearchInputs({
  params,
  exclude,
}: {
  params: Record<string, string | string[] | undefined>
  exclude: string[]
}) {
  return (
    <>
      {Object.entries(params).map(([key, value]) => {
        if (exclude.includes(key)) return null
        const val = Array.isArray(value) ? value[0] : value
        if (!val) return null
        return <input key={key} type="hidden" name={key} value={val} />
      })}
    </>
  )
}

function Pagination({
  currentPage,
  pageSize,
  totalRows,
  pageParam,
  sizeParam,
  searchParams,
}: {
  currentPage: number
  pageSize: number
  totalRows: number
  pageParam: string
  sizeParam: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const itemLabel = pageParam === 'errorPage' ? 'errors' : 'audit entries'

  return (
    <PaginationBar
      count={`${totalRows} ${itemLabel}`}
      page={currentPage}
      pageCount={totalPages}
      label={`${itemLabel} pages`}
      className="border-t border-gray-100 px-4 py-3"
      previous={currentPage > 1 ? <Link
          href={buildHref(searchParams, { [pageParam]: String(Math.max(1, currentPage - 1)) })}
        >Previous</Link> : <span aria-disabled="true">Previous</span>}
      next={currentPage < totalPages ? <Link
          href={buildHref(searchParams, { [pageParam]: String(Math.min(totalPages, currentPage + 1)) })}
        >Next</Link> : <span aria-disabled="true">Next</span>}
      pageSize={<form action="/admin/administration">
        <HiddenSearchInputs params={searchParams} exclude={[pageParam, sizeParam]} />
        <input type="hidden" name={pageParam} value="1" />
        <label htmlFor={`${sizeParam}-select`}>Page size</label>
        <select
          id={`${sizeParam}-select`}
          name={sizeParam}
          defaultValue={String(pageSize)}
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          Apply
        </button>
      </form>}
    />
  )
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Guard: admin-only module
  await requireModule('admin')

  const session = await auth()
  const params = await searchParams
  const errorPage = parsePage(params.errorPage)
  const auditPage = parsePage(params.auditPage)
  const errorSize = parsePageSize(params.errorSize)
  const auditSize = parsePageSize(params.auditSize, 5)
  const auditActorId = parseString(params.auditActorId)
  const auditEntityType = parseString(params.auditEntityType)
  const auditAction = parseString(params.auditAction)
  const auditDateFrom = parseDateParam(params.auditDateFrom)
  const auditDateTo = parseDateParam(params.auditDateTo)
  const auditShowArchived = parseString(params.auditShowArchived) === '1'
  const auditFilters = [
    auditActorId ? eq(auditLog.actorId, auditActorId) : undefined,
    auditEntityType
      ? or(eq(auditLog.entityType, auditEntityType), like(auditLog.action, `${auditEntityType}.%`))
      : undefined,
    auditAction ? like(auditLog.action, `%${auditAction}%`) : undefined,
    auditDateFrom ? gte(auditLog.createdAt, auditDateFrom) : undefined,
    auditDateTo ? lte(auditLog.createdAt, endOfDay(auditDateTo)) : undefined,
    auditShowArchived ? undefined : isNull(auditLog.archivedAt),
  ].filter(Boolean)

  // Fetch all data server-side
  const [allUsers, allModules, allGrants, menuAvailability, auditRows, auditCountRows] = await Promise.all([
    db.select().from(users).orderBy(users.createdAt),
    db.select().from(modules).orderBy(modules.sortOrder),
    db.select().from(userModuleAccess),
    getMenuAvailability(),
    db
      .select()
      .from(auditLog)
      .where(and(...auditFilters))
      .orderBy(desc(auditLog.createdAt))
      .limit(auditSize)
      .offset((auditPage - 1) * auditSize),
    db.select({ value: count() }).from(auditLog).where(and(...auditFilters)),
  ])
  const auditTotalRows = auditCountRows[0]?.value ?? 0

  let errorRows: (typeof errorLog.$inferSelect)[] = []
  let errorTotalRows = 0
  try {
    const [rows, countRows] = await Promise.all([
      db.select().from(errorLog).orderBy(desc(errorLog.createdAt)).limit(errorSize).offset((errorPage - 1) * errorSize),
      db.select({ value: count() }).from(errorLog),
    ])
    errorRows = rows
    errorTotalRows = countRows[0]?.value ?? 0
  } catch (err) {
    console.error('[admin.errorLog.read]', err)
  }

  // Build a map of userId → Set<moduleId> for quick grant lookups
  const grantsByUser = new Map<string, Set<string>>()
  for (const grant of allGrants) {
    if (!grantsByUser.has(grant.userId)) {
      grantsByUser.set(grant.userId, new Set())
    }
    grantsByUser.get(grant.userId)!.add(grant.moduleId)
  }

  // Identify the current actor
  const currentUser = allUsers.find((u) => u.id === session?.user?.id)
  const isProtectedActor = currentUser?.isProtected ?? false

  // Build a map of userId → username for audit log resolution
  const usernameById = new Map<string, string>()
  for (const u of allUsers) {
    usernameById.set(u.id, u.username)
  }
  const auditExportQuery = {
    actorId: auditActorId || undefined,
    entityType: auditEntityType || undefined,
    action: auditAction || undefined,
    dateFrom: parseString(params.auditDateFrom) || undefined,
    dateTo: parseString(params.auditDateTo) || undefined,
    showArchived: auditShowArchived ? '1' : undefined,
  }
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10">
      <h1 className="text-2xl font-semibold text-gray-900">Admin Panel</h1>

      {/* ── User List ─────────────────────────────────────────────────────── */}
      <details className="order-10" open>
        <summary className="mb-4 cursor-pointer text-lg font-semibold text-gray-800">Users</summary>

        <div className="mb-4 rounded border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Create User</h3>
          <CreateUserForm />
        </div>

        <div className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-2 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Username
                </th>
                <th className="py-2 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Role
                </th>
                <th className="py-2 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  ServiceM8 Staff UUID
                </th>
                <th className="py-2 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Access
                </th>
                <th className="py-2 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((user) => (
                <UserRow
                  key={user.id}
                  user={{
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    isProtected: user.isProtected,
                    servicem8StaffUuid: user.servicem8StaffUuid,
                  }}
                  isCurrentUser={user.id === session?.user?.id}
                  isProtectedActor={isProtectedActor}
                  modules={allModules.map((m) => ({
                    id: m.id,
                    slug: m.slug,
                    name: m.name,
                    adminOnly: m.adminOnly,
                    isActive: m.isActive,
                  }))}
                  grantedModuleIds={grantsByUser.get(user.id) ?? new Set()}
                />
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {isProtectedActor && (
        <details className="order-20">
          <summary className="mb-4 cursor-pointer text-lg font-semibold text-gray-800">Menu Availability</summary>
          <MenuAvailabilityForm menuAvailability={menuAvailability} />
        </details>
      )}

      {/* ── Audit Log ─────────────────────────────────────────────────────── */}
      <details className="order-[60]">
        <summary className="mb-4 cursor-pointer text-lg font-semibold text-gray-800">
          System Errors
          <span className="ml-2 text-sm font-normal text-gray-400">({errorTotalRows} total)</span>
        </summary>
        <div className="mb-3 flex justify-end">
          <ExportDropdown kind="system" />
        </div>

        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-x-auto">
          {errorRows.length === 0 ? (
            <p className="py-6 px-4 text-sm text-gray-500">No system errors logged.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-2 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Timestamp
                  </th>
                  <th className="py-2 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Ref
                  </th>
                  <th className="py-2 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Source
                  </th>
                  <th className="py-2 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Message
                  </th>
                  <th className="py-2 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Context
                  </th>
                </tr>
              </thead>
              <tbody>
                {errorRows.map((row) => {
                  const metadata = row.metadata as Record<string, unknown> | null
                  const ts = new Date(row.createdAt)
                  const formatted = ts.toLocaleDateString('en-AU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  }) + ' ' + ts.toLocaleTimeString('en-AU', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })

                  return (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                      <td className="py-2 px-4 text-gray-500 whitespace-nowrap font-mono text-xs">
                        {formatted}
                      </td>
                      <td className="py-2 px-4 font-mono text-xs text-gray-600 whitespace-nowrap">
                        {row.id}
                      </td>
                      <td className="py-2 px-4">
                        <span className="font-mono text-xs bg-red-50 px-1.5 py-0.5 rounded text-red-700">
                          {row.source}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-gray-700 min-w-64">
                        {row.message}
                        {row.stack && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-gray-400">Stack</summary>
                            <pre className="mt-2 max-w-xl whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-500">
                              {row.stack}
                            </pre>
                          </details>
                        )}
                      </td>
                      <td className="py-2 px-4 text-gray-500 text-xs min-w-56">
                        {metadata ? JSON.stringify(metadata) : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <Pagination
            currentPage={errorPage}
            pageSize={errorSize}
            totalRows={errorTotalRows}
            pageParam="errorPage"
            sizeParam="errorSize"
            searchParams={params}
          />
        </div>
      </details>

      <details className="order-40">
        <summary className="mb-4 cursor-pointer text-lg font-semibold text-gray-800">
          Audit Log
          <span className="ml-2 text-sm font-normal text-gray-400">({auditTotalRows} total)</span>
        </summary>
        <div className="mb-3 flex justify-end">
          <ExportDropdown kind="audit" query={auditExportQuery} />
        </div>

        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-x-auto">
          <form className="grid gap-3 border-b border-gray-100 p-4 md:grid-cols-6" action="/admin/administration">
            <input type="hidden" name="auditPage" value="1" />
            <select
              name="auditActorId"
              defaultValue={auditActorId}
              className="rounded border border-gray-200 bg-white px-2 py-2 text-sm text-gray-700"
            >
              <option value="">All actors</option>
              {allUsers.map((user) => (
                <option key={user.id} value={user.id}>{user.username}</option>
              ))}
            </select>
            <select
              name="auditEntityType"
              defaultValue={auditEntityType}
              className="rounded border border-gray-200 bg-white px-2 py-2 text-sm text-gray-700"
            >
              <option value="">All entities</option>
              {AUDIT_ENTITY_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <input
              name="auditAction"
              defaultValue={auditAction}
              placeholder="Action contains"
              className="rounded border border-gray-200 px-2 py-2 text-sm text-gray-700"
            />
            <input
              name="auditDateFrom"
              type="date"
              defaultValue={parseString(params.auditDateFrom)}
              className="rounded border border-gray-200 px-2 py-2 text-sm text-gray-700"
            />
            <input
              name="auditDateTo"
              type="date"
              defaultValue={parseString(params.auditDateTo)}
              className="rounded border border-gray-200 px-2 py-2 text-sm text-gray-700"
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  name="auditShowArchived"
                  value="1"
                  defaultChecked={auditShowArchived}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Archived
              </label>
              <button
                type="submit"
                className="rounded border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Filter
              </button>
            </div>
          </form>
          {auditRows.length === 0 ? (
            <p className="py-6 px-4 text-sm text-gray-500">No audit entries yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-2 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Timestamp
                  </th>
                  <th className="py-2 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Actor
                  </th>
                  <th className="py-2 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Action
                  </th>
                  <th className="py-2 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Entity
                  </th>
                  <th className="py-2 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Target
                  </th>
                  <th className="py-2 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    IP
                  </th>
                  <th className="py-2 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((row) => {
                  // Resolve actor: use actorId → username if present; fall back to 'deleted user'
                  // Note: detail.username is the TARGET user's name, not the actor's
                  const detail = row.detail as Record<string, unknown> | null
                  const actorName = row.actorId
                    ? (usernameById.get(row.actorId) ?? 'deleted user')
                    : 'deleted user'

                  // Target: detail.username or targetId
                  const targetName = auditFieldValue(detail, 'username') ?? row.targetId ?? '-'

                  // Detail fields: omit 'username' (already shown in Target), render rest as key: value
                  const detailFields = formatAuditDetail(auditDetailWithoutTarget(detail))

                  const ts = new Date(row.createdAt)
                  const formatted = ts.toLocaleDateString('en-AU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  }) + ' ' + ts.toLocaleTimeString('en-AU', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })

                  return (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-4 text-gray-500 whitespace-nowrap font-mono text-xs">
                        {formatted}
                      </td>
                      <td className="py-2 px-4 text-gray-700 font-medium whitespace-nowrap">
                        {String(actorName)}
                      </td>
                      <td className="py-2 px-4">
                        <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                          {row.action}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-gray-600 whitespace-nowrap">
                        {row.entityType ?? deriveAuditEntityType(row.action) ?? 'unknown'}
                        {row.archivedAt && (
                          <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                            archived
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-gray-700 whitespace-nowrap">
                        {String(targetName)}
                      </td>
                      <td className="py-2 px-4 font-mono text-xs text-gray-500 whitespace-nowrap">
                        {row.ipAddress ?? '-'}
                      </td>
                      <td className="py-2 px-4 text-gray-500 text-xs">
                        {detailFields || '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <Pagination
            currentPage={auditPage}
            pageSize={auditSize}
            totalRows={auditTotalRows}
            pageParam="auditPage"
            sizeParam="auditSize"
            searchParams={params}
          />
        </div>
      </details>

      <details className="order-50">
        <summary className="mb-4 cursor-pointer text-lg font-semibold text-gray-800">Diagnostics</summary>
        <div className="rounded border border-gray-200 bg-white p-5 shadow-sm">
          <TestErrorButton />
        </div>
      </details>
    </div>
  )
}
