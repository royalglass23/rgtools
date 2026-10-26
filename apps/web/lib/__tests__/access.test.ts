import { describe, it, expect } from 'vitest'
import { canAccessModule, assertCanManageUser } from '../access'
import { buildAuditDetail, AUDIT_ACTIONS } from '../audit'
import { DEFAULT_MENU_AVAILABILITY } from '../menu-availability'

// ── Shared fixtures ────────────────────────────────────────────────────────────

const admin = { id: 'u1', username: 'alice', role: 'admin' as const, isProtected: false }
const staff = { id: 'u2', username: 'bob',   role: 'staff' as const, isProtected: false }
const superAdmin = { id: 'u0', username: 'super', role: 'admin' as const, isProtected: true }
const protectedStaff = { id: 'u3', username: 'pstaff', role: 'staff' as const, isProtected: true }

const adminOnlyModule = { id: 'm1', slug: 'admin-panel', adminOnly: true,  isActive: true }
const normalModule    = { id: 'm2', slug: 'quotes',      adminOnly: false, isActive: true }
const menuLockedModule = { id: 'm3', slug: 'work-orders', adminOnly: false, isActive: true }
const menuLockedSubmodule = { id: 'm4', slug: 'ps-generator/history', adminOnly: false, isActive: true }
const clientsModule = { id: 'm5', slug: 'clients', adminOnly: false, isActive: true }

// ── canAccessModule ────────────────────────────────────────────────────────────

describe('canAccessModule', () => {
  const availability = {
    staff: { ...DEFAULT_MENU_AVAILABILITY.staff, clients: true, 'ps-generator': true, 'work-orders': true },
    admin: { ...DEFAULT_MENU_AVAILABILITY.admin, clients: true, 'ps-generator': true, 'work-orders': true },
  }

  it('gives new and existing staff the same enabled tool access', () => {
    expect(canAccessModule(staff, clientsModule, availability)).toBe(true)
    expect(canAccessModule({ ...staff, id: 'new-user' }, clientsModule, availability)).toBe(true)
  })

  it('denies a tool when disabled for the role', () => {
    expect(canAccessModule(staff, clientsModule, DEFAULT_MENU_AVAILABILITY)).toBe(false)
    expect(canAccessModule(admin, menuLockedModule, DEFAULT_MENU_AVAILABILITY)).toBe(false)
  })

  it('blocks admin-only and sensitive operations for staff', () => {
    expect(canAccessModule(staff, adminOnlyModule, availability)).toBe(false)
    for (const slug of [
      'ps-generator/configuration',
      'ps-generator/configuration/publish',
      'lead-intake/configuration',
      'clients/configuration',
      'admin/work-orders',
    ]) {
      expect(canAccessModule(staff, { id: slug, slug, adminOnly: false, isActive: true }, availability)).toBe(false)
      expect(canAccessModule(admin, { id: slug, slug, adminOnly: false, isActive: true }, availability)).toBe(true)
    }
  })

  it('keeps history and ordinary tool routes available with the parent role setting', () => {
    expect(canAccessModule(staff, menuLockedSubmodule, availability)).toBe(true)
    expect(canAccessModule(staff, menuLockedModule, availability)).toBe(true)
    expect(canAccessModule(staff, { id: 'manage', slug: 'work-orders/manage', adminOnly: false, isActive: true }, availability)).toBe(true)
  })

  it('denies inactive and unknown staff modules', () => {
    expect(canAccessModule(staff, { ...clientsModule, isActive: false }, availability)).toBe(false)
    expect(canAccessModule(staff, normalModule, availability)).toBe(false)
  })

  it('lets protected admin bypass role settings but not inactive modules', () => {
    expect(canAccessModule(superAdmin, menuLockedModule, DEFAULT_MENU_AVAILABILITY)).toBe(true)
    expect(canAccessModule(superAdmin, { ...menuLockedModule, isActive: false }, DEFAULT_MENU_AVAILABILITY)).toBe(false)
  })
})

// ── assertCanManageUser ────────────────────────────────────────────────────────

describe('assertCanManageUser', () => {
  it('admin managing staff → ok (no throw)', () => {
    expect(() => assertCanManageUser(admin, staff)).not.toThrow()
  })

  it('admin managing another admin → throws', () => {
    const otherAdmin = { id: 'u9', username: 'carol', role: 'admin' as const, isProtected: false }
    expect(() => assertCanManageUser(admin, otherAdmin)).toThrow()
  })

  it('staff trying to manage another staff → throws', () => {
    const anotherStaff = { id: 'u4', username: 'dave', role: 'staff' as const, isProtected: false }
    expect(() => assertCanManageUser(staff, anotherStaff)).toThrow()
  })

  it('staff trying to manage an admin → throws', () => {
    expect(() => assertCanManageUser(staff, admin)).toThrow()
  })

  it('protected super-user managing an admin → ok', () => {
    expect(() => assertCanManageUser(superAdmin, admin)).not.toThrow()
  })

  it('anyone demoting/deleting a protected user → throws', () => {
    expect(() => assertCanManageUser(admin, superAdmin)).toThrow()
    expect(() => assertCanManageUser(superAdmin, protectedStaff)).toThrow()
  })
})

// ── buildAuditDetail ───────────────────────────────────────────────────────────

describe('buildAuditDetail', () => {
  it('strips extra fields for USER_CREATE', () => {
    const detail = buildAuditDetail(AUDIT_ACTIONS.USER_CREATE, { username: 'x', role: 'admin' })
    expect(Object.keys(detail)).toEqual(['username', 'role'])
  })

  it('USER_CREATE shape', () => {
    const detail = buildAuditDetail(AUDIT_ACTIONS.USER_CREATE, { username: 'bob', role: 'staff' })
    expect(detail).toEqual({ username: 'bob', role: 'staff' })
  })

  it('USER_ROLE_CHANGE shape', () => {
    const detail = buildAuditDetail(AUDIT_ACTIONS.USER_ROLE_CHANGE, {
      username: 'bob', fromRole: 'staff', toRole: 'admin',
    })
    expect(detail).toEqual({ username: 'bob', fromRole: 'staff', toRole: 'admin' })
  })

  it('USER_DELETE shape', () => {
    const detail = buildAuditDetail(AUDIT_ACTIONS.USER_DELETE, { username: 'bob', role: 'staff' })
    expect(detail).toEqual({ username: 'bob', role: 'staff' })
  })

  it('ACCESS_GRANT shape', () => {
    const detail = buildAuditDetail(AUDIT_ACTIONS.ACCESS_GRANT, { username: 'bob', moduleSlug: 'quotes' })
    expect(detail).toEqual({ username: 'bob', moduleSlug: 'quotes' })
  })

  it('ACCESS_REVOKE shape', () => {
    const detail = buildAuditDetail(AUDIT_ACTIONS.ACCESS_REVOKE, { username: 'bob', moduleSlug: 'quotes' })
    expect(detail).toEqual({ username: 'bob', moduleSlug: 'quotes' })
  })

  it('unknown action → returns data as-is', () => {
    const detail = buildAuditDetail('some.unknown.action', { foo: 'bar' })
    expect(detail).toEqual({ foo: 'bar' })
  })
})
