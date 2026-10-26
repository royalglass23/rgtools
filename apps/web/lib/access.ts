import { roleCanSeeMenu, type MenuAvailability } from './menu-availability'

/**
 * Pure access-control functions — no DB imports, no side effects.
 * All decisions are derived from the arguments passed in.
 */

// ── Minimal interfaces (mirror the DB schema shapes) ──────────────────────────

export interface AccessUser {
  id: string
  username: string
  role: 'admin' | 'staff'
  isProtected: boolean
}

export interface AccessModule {
  id: string
  slug: string
  adminOnly: boolean
  isActive: boolean
}

// ── canAccessModule ───────────────────────────────────────────────────────────

/**
 * Determine whether `user` may access `module`.
 *
 * Rules:
 *   - Role access controls the ordinary tools for all users of that role.
 *   - Sensitive configuration modules require an admin role.
 *
 * @param user      The user requesting access
 * @param module    The module being checked
 */
export function canAccessModule(
  user: AccessUser,
  module: AccessModule,
  menuAvailability: MenuAvailability,
): boolean {
  if (!module.isActive) return false

  if (user.role === 'admin' && user.isProtected) {
    return true
  }

  if (!roleCanSeeMenu(user.role, module.slug, menuAvailability)) {
    return false
  }

  if (module.adminOnly || isAdminOperation(module.slug)) {
    return user.role === 'admin'
  }

  return true
}

// Existing databases may still mark configuration modules as staff-capable.
// Enforce the Admin boundary without requiring a production migration.
function isAdminOperation(slug: string): boolean {
  return slug === 'admin' || slug.startsWith('admin/') || slug.includes('/configuration')
}

// ── assertCanManageUser ───────────────────────────────────────────────────────

/**
 * Assert that `actor` is allowed to manage (create / update / delete) `target`.
 * Throws an Error with a descriptive message when the operation is forbidden.
 *
 * Rules:
 *   1. NOBODY may demote or delete a protected user.
 *   2. A protected actor (super-user) may manage any non-protected user,
 *      including other admins.
 *   3. A regular admin may manage staff only — not other admins.
 *   4. Staff may not manage anyone (falls through to the admin-required check).
 */
export function assertCanManageUser(actor: AccessUser, target: AccessUser): void {
  // Rule 1 — target is protected → always blocked
  if (target.isProtected) {
    throw new Error(
      `Forbidden: user "${target.username}" is protected and cannot be managed.`,
    )
  }

  // Rule 2 — protected actor can manage anyone that isn't protected
  if (actor.isProtected) {
    return
  }

  // From here actor is a regular (non-protected) user.
  // Rule 3/4 — only admins can manage, and only staff targets
  if (actor.role !== 'admin') {
    throw new Error(
      `Forbidden: actor "${actor.username}" is not an admin and cannot manage users.`,
    )
  }

  if (target.role === 'admin') {
    throw new Error(
      `Forbidden: admin "${actor.username}" cannot manage another admin "${target.username}".`,
    )
  }
}
