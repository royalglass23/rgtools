'use server'

import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { type Session } from 'next-auth'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users, settings } from '@rgtools/db/schema'
import { assertCanManageUser } from '@/lib/access'
import type { AccessUser } from '@/lib/access'
import { AUDIT_ACTIONS } from '@/lib/audit'
import { logAudit } from '@/lib/audit-db'
import { logError } from '@/lib/logger'
import {
  DEFAULT_MENU_AVAILABILITY,
  MENU_AVAILABILITY_SETTING_KEY,
  MENU_KEYS,
  serializeMenuAvailability,
  type MenuAvailability,
  type MenuRole,
} from '@/lib/menu-availability'

// ── Helper: resolve the calling actor as an AccessUser ────────────────────────

interface ActorContext {
  session: Session
  actor: AccessUser
}

async function getActorOrThrow(): Promise<ActorContext> {
  const rawSession = await auth()
  // next-auth's `auth()` is overloaded; when called with no args in server context
  // it returns Session | null. We cast to disambiguate from the middleware overload.
  const session = rawSession as Session | null

  if (session?.user?.role !== 'admin') {
    throw new Error('Forbidden')
  }

  const actorRow = await db.query.users.findFirst({
    where: eq(users.id, session.user.id as string),
  })

  if (!actorRow) {
    throw new Error('Forbidden: actor not found')
  }

  const actor: AccessUser = {
    id: actorRow.id,
    username: actorRow.username,
    role: actorRow.role,
    isProtected: actorRow.isProtected,
  }

  return { session, actor }
}

// ── createUser ────────────────────────────────────────────────────────────────

/**
 * Create a new user account.
 * Only admins may call this action.
 * bcrypt cost 12; username must be unique (DB enforces via UNIQUE constraint).
 */
export async function createUser(data: {
  username: string
  password: string
  role: 'admin' | 'staff'
}): Promise<{ success: true } | { error: string }> {
  const { username, password, role } = data
  let actorId: string | null = null

  if (!username.trim() || password.length < 6) {
    return { error: 'Username is required and password must be at least 6 characters.' }
  }

  try {
    const { session } = await getActorOrThrow()
    actorId = session.user.id as string

    const passwordHash = await bcrypt.hash(password, 12)

    await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({ username: username.trim(), passwordHash, role })
        .returning()

      await logAudit({
        actorId: session.user.id as string,
        entityType: 'user',
        action: AUDIT_ACTIONS.USER_CREATE,
        targetId: newUser.id,
        before: null,
        after: { username: username.trim(), role },
      }, tx)
    })

    return { success: true }
  } catch (err) {
    const cause = (err as { cause?: unknown }).cause
    const pgCode = (err as { code?: string }).code ?? (cause as { code?: string } | undefined)?.code
    const msg = err instanceof Error ? err.message : String(err)
    const causeMsg = cause instanceof Error ? cause.message : ''
    if (pgCode === '23505' || msg.includes('duplicate key') || causeMsg.includes('duplicate key') || msg.includes('unique constraint') || causeMsg.includes('unique constraint')) {
      return { error: `Username "${username.trim()}" is already taken.` }
    }
    if (msg === 'Forbidden' || msg.includes('Forbidden')) return { error: msg }
    const errorId = await logError('admin.createUser', err, {
      userId: actorId,
      metadata: { username: username.trim(), role },
    })
    return { error: `Failed to create user. Please try again. Ref: ${errorId}` }
  }
}

// ── updateUserRole ────────────────────────────────────────────────────────────

/**
 * Change an existing user's role.
 * Blocked on protected users and on regular-admin managing another admin.
 */
export async function updateUserRole(
  userId: string,
  role: 'admin' | 'staff',
): Promise<{ success: true } | { error: string }> {
  let actorId: string | null = null

  try {
    const { session, actor } = await getActorOrThrow()
    actorId = session.user.id as string

    const targetRow = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!targetRow) return { error: 'User not found' }

    const target: AccessUser = {
      id: targetRow.id,
      username: targetRow.username,
      role: targetRow.role,
      isProtected: targetRow.isProtected,
    }

    assertCanManageUser(actor, target)

    await db.transaction(async (tx) => {
      await tx.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId))

      await logAudit({
        actorId: session.user.id as string,
        entityType: 'user',
        action: AUDIT_ACTIONS.USER_ROLE_CHANGE,
        targetId: userId,
        before: {
          username: targetRow.username,
          role: targetRow.role,
        },
        after: {
          username: targetRow.username,
          role,
        },
      }, tx)
    })

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Forbidden')) return { error: msg }
    const errorId = await logError('admin.updateUserRole', err, {
      userId: actorId,
      metadata: { targetUserId: userId, role },
    })
    return { error: `Failed to update role. Please try again. Ref: ${errorId}` }
  }
}

// ── deleteUser ────────────────────────────────────────────────────────────────

/**
 * Hard-delete a user. Cascades grants.
 * Captures username + role BEFORE deletion for the audit row.
 */
export async function updateUserServiceM8StaffUuid(
  userId: string,
  staffUuid: string,
): Promise<{ success: true } | { error: string }> {
  let actorId: string | null = null
  const normalized = staffUuid.trim() || null

  try {
    const { session, actor } = await getActorOrThrow()
    actorId = session.user.id as string

    const targetRow = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!targetRow) return { error: 'User not found' }

    const target: AccessUser = {
      id: targetRow.id,
      username: targetRow.username,
      role: targetRow.role,
      isProtected: targetRow.isProtected,
    }

    assertCanManageUser(actor, target)

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ servicem8StaffUuid: normalized, updatedAt: new Date() })
        .where(eq(users.id, userId))

      await logAudit({
        actorId: session.user.id as string,
        entityType: 'user',
        action: 'user.servicem8_staff_uuid.updated',
        targetId: userId,
        before: { username: targetRow.username, servicem8StaffUuid: targetRow.servicem8StaffUuid },
        after: { username: targetRow.username, servicem8StaffUuid: normalized },
      }, tx)
    })

    return { success: true }
  } catch (err) {
    const cause = (err as { cause?: unknown }).cause
    const pgCode = (err as { code?: string }).code ?? (cause as { code?: string } | undefined)?.code
    const msg = err instanceof Error ? err.message : String(err)
    const causeMsg = cause instanceof Error ? cause.message : ''
    if (pgCode === '23505' || msg.includes('duplicate key') || causeMsg.includes('duplicate key')) {
      return { error: 'That ServiceM8 staff UUID is already assigned to another user.' }
    }
    if (msg.includes('Forbidden')) return { error: msg }
    const errorId = await logError('admin.updateUserServiceM8StaffUuid', err, {
      userId: actorId,
      metadata: { targetUserId: userId },
    })
    return { error: `Failed to update ServiceM8 staff UUID. Please try again. Ref: ${errorId}` }
  }
}

export async function deleteUser(
  userId: string,
): Promise<{ success: true } | { error: string }> {
  let actorId: string | null = null

  try {
    const { session, actor } = await getActorOrThrow()
    actorId = session.user.id as string

    const targetRow = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!targetRow) return { error: 'User not found' }

    const target: AccessUser = {
      id: targetRow.id,
      username: targetRow.username,
      role: targetRow.role,
      isProtected: targetRow.isProtected,
    }

    assertCanManageUser(actor, target)

    const { username, role } = targetRow

    await db.transaction(async (tx) => {
      await tx.delete(users).where(eq(users.id, userId))

      await logAudit({
        actorId: session.user.id as string,
        entityType: 'user',
        action: AUDIT_ACTIONS.USER_DELETE,
        targetId: userId,
        before: { username, role },
        after: null,
      }, tx)
    })

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Forbidden')) return { error: msg }
    const errorId = await logError('admin.deleteUser', err, {
      userId: actorId,
      metadata: { targetUserId: userId },
    })
    return { error: `Failed to delete user. Please try again. Ref: ${errorId}` }
  }
}

export async function updateMenuAvailability(
  formData: FormData,
): Promise<{ success: true } | { error: string }> {
  let actorId: string | null = null

  try {
    const { session, actor } = await getActorOrThrow()
    actorId = session.user.id as string

    if (!actor.isProtected) {
      return { error: 'Forbidden: only the protected admin can update menu availability.' }
    }

    const nextAvailability: MenuAvailability = {
      staff: { ...DEFAULT_MENU_AVAILABILITY.staff },
      admin: { ...DEFAULT_MENU_AVAILABILITY.admin },
    }

    for (const role of ['staff', 'admin'] satisfies MenuRole[]) {
      for (const key of MENU_KEYS) {
        nextAvailability[role][key] = formData.get(`menu:${role}:${key}`) === 'on'
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(settings)
        .values({
          key: MENU_AVAILABILITY_SETTING_KEY,
          value: serializeMenuAvailability(nextAvailability),
          updatedBy: session.user.id as string,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: {
            value: serializeMenuAvailability(nextAvailability),
            updatedBy: session.user.id as string,
            updatedAt: new Date(),
          },
        })

      await logAudit({
        actorId: session.user.id as string,
        entityType: 'access',
        action: 'access.menu_availability_updated',
        targetId: null,
        before: null,
        after: { menuAvailability: nextAvailability },
      }, tx)
    })

    revalidatePath('/')
    revalidatePath('/admin/administration')

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Forbidden')) return { error: msg }
    const errorId = await logError('admin.updateMenuAvailability', err, {
      userId: actorId,
    })
    return { error: `Failed to update menu availability. Please try again. Ref: ${errorId}` }
  }
}

export async function createTestError(): Promise<{ success: true; errorId: string } | { error: string }> {
  try {
    const { session } = await getActorOrThrow()
    const errorId = await logError('admin.testError', new Error('Deliberate test error from Admin Panel'), {
      userId: session.user.id as string,
      metadata: {
        purpose: 'manual reproduction test',
        triggeredAt: new Date().toISOString(),
      },
    })

    return { success: true, errorId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: msg }
  }
}
