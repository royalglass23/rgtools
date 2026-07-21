import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MENU_AVAILABILITY,
  normalizeMenuAvailability,
  parseMenuAvailabilitySetting,
  roleCanSeeMenu,
  serializeMenuAvailability,
} from '../menu-availability'

describe('menu availability', () => {
  it('defaults to production-safe menu visibility', () => {
    expect(parseMenuAvailabilitySetting(null)).toEqual(DEFAULT_MENU_AVAILABILITY)
  })

  it('normalizes partial settings with safe defaults', () => {
    expect(normalizeMenuAvailability({ staff: { clients: true } }).staff).toEqual({
      ...DEFAULT_MENU_AVAILABILITY.staff,
      clients: true,
    })
  })

  it('uses parent menu availability for submenu slugs', () => {
    const availability = parseMenuAvailabilitySetting(serializeMenuAvailability({
      ...DEFAULT_MENU_AVAILABILITY,
      staff: {
        ...DEFAULT_MENU_AVAILABILITY.staff,
        'ps-generator': false,
      },
    }))

    expect(roleCanSeeMenu('staff', 'ps-generator', availability)).toBe(false)
    expect(roleCanSeeMenu('staff', 'ps-generator/history', availability)).toBe(false)
    expect(roleCanSeeMenu('staff', 'ps-generator/configuration', availability)).toBe(false)
  })

  it('groups moved settings routes under their owning module menus', () => {
    const availability = parseMenuAvailabilitySetting(serializeMenuAvailability({
      ...DEFAULT_MENU_AVAILABILITY,
      admin: {
        ...DEFAULT_MENU_AVAILABILITY.admin,
        'quote-tracker': false,
        clients: false,
        admin: true,
      },
    }))

    expect(roleCanSeeMenu('admin', 'admin/tracking', availability)).toBe(false)
    expect(roleCanSeeMenu('admin', 'quote-tracker/guide', availability)).toBe(false)
    expect(roleCanSeeMenu('admin', 'admin/client-merge-review', availability)).toBe(false)
    expect(roleCanSeeMenu('admin', 'clients/configuration', availability)).toBe(false)
    expect(roleCanSeeMenu('admin', 'admin/dashboard-settings', availability)).toBe(true)
  })

  it('allows unknown slugs unless another guard blocks them', () => {
    expect(roleCanSeeMenu('staff', 'future-module', DEFAULT_MENU_AVAILABILITY)).toBe(true)
  })
})
