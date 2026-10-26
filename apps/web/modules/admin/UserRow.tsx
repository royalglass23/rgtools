'use client'

import { useState, useTransition } from 'react'
import { updateUserRole, deleteUser, updateUserServiceM8StaffUuid } from './actions'

interface UserRowProps {
  user: {
    id: string
    username: string
    role: 'admin' | 'staff'
    isProtected: boolean
    servicem8StaffUuid: string | null
  }
  isCurrentUser: boolean
  isProtectedActor: boolean
}

export function UserRow({ user, isCurrentUser, isProtectedActor }: UserRowProps) {
  const [isPendingRole, startRoleTransition] = useTransition()
  const [isPendingStaffUuid, startStaffUuidTransition] = useTransition()
  const [isPendingDelete, startDeleteTransition] = useTransition()
  const [staffUuid, setStaffUuid] = useState(user.servicem8StaffUuid ?? '')
  const [staffUuidError, setStaffUuidError] = useState<string | null>(null)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Determine if this user's controls should be disabled
  // Protected users: always disabled
  // Other admins: disabled unless actor is the protected super-user
  const isTargetProtected = user.isProtected
  const isTargetAdmin = user.role === 'admin'
  const canManage =
    !isTargetProtected && (isProtectedActor || !isTargetAdmin)

  function handleRoleChange(newRole: 'admin' | 'staff') {
    setRoleError(null)
    startRoleTransition(async () => {
      const result = await updateUserRole(user.id, newRole)
      if ('error' in result) {
        setRoleError(result.error)
      } else {
        window.location.reload()
      }
    })
  }

  function handleDelete() {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return
    setDeleteError(null)
    startDeleteTransition(async () => {
      const result = await deleteUser(user.id)
      if ('error' in result) {
        setDeleteError(result.error)
      } else {
        window.location.reload()
      }
    })
  }

  function handleStaffUuidSave() {
    setStaffUuidError(null)
    startStaffUuidTransition(async () => {
      const result = await updateUserServiceM8StaffUuid(user.id, staffUuid)
      if ('error' in result) {
        setStaffUuidError(result.error)
      } else {
        window.location.reload()
      }
    })
  }

  const disabledReason = isTargetProtected
    ? 'This user is protected and cannot be modified.'
    : isTargetAdmin && !isProtectedActor
      ? 'Only the super-user can manage other admins.'
      : null

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50">
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{user.username}</span>
            {isCurrentUser && (
              <span className="text-xs text-gray-400">(you)</span>
            )}
            {user.isProtected && (
              <span
                title="This user is protected and cannot be modified"
                className="text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5"
              >
                Protected
              </span>
            )}
          </div>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <select
              value={user.role}
              disabled={!canManage || isPendingRole}
              onChange={(e) => handleRoleChange(e.target.value as 'admin' | 'staff')}
              title={disabledReason ?? undefined}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
            {isPendingRole && <span className="text-xs text-gray-400">Saving…</span>}
            {roleError && <span className="text-xs text-red-600">{roleError}</span>}
          </div>
        </td>
        <td className="py-3 px-4">
          <div className="flex max-w-72 items-center gap-2">
            <input
              type="text"
              value={staffUuid}
              disabled={!canManage || isPendingStaffUuid}
              onChange={(e) => setStaffUuid(e.target.value)}
              onBlur={handleStaffUuidSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleStaffUuidSave()
              }}
              title={disabledReason ?? undefined}
              placeholder="ServiceM8 staff UUID"
              className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {isPendingStaffUuid && <span className="text-xs text-gray-400">Saving...</span>}
            {staffUuidError && <span className="text-xs text-red-600">{staffUuidError}</span>}
          </div>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              disabled={!canManage || isPendingDelete}
              title={disabledReason ?? undefined}
              className="text-sm text-red-600 hover:text-red-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isPendingDelete ? 'Deleting…' : 'Delete'}
            </button>
            {deleteError && <span className="text-xs text-red-600">{deleteError}</span>}
          </div>
        </td>
      </tr>
    </>
  )
}
