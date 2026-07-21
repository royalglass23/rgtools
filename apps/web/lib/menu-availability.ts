export type MenuRole = 'staff' | 'admin'
export type MenuKey = 'lead-intake' | 'quote-tracker' | 'clients' | 'ps-generator' | 'work-orders' | 'admin'

export interface MenuAvailability {
  staff: Record<MenuKey, boolean>
  admin: Record<MenuKey, boolean>
}

export interface MenuDefinition {
  key: MenuKey
  label: string
  slugs: string[]
}

export const MENU_AVAILABILITY_SETTING_KEY = 'admin.menuAvailability'

export const MENU_DEFINITIONS: MenuDefinition[] = [
  {
    key: 'lead-intake',
    label: 'Lead Intake',
    slugs: ['lead-intake', 'leads', 'lead-intake/configuration', 'lead-intake/guide'],
  },
  {
    key: 'quote-tracker',
    label: 'Quote Tracker',
    slugs: ['quote-tracker', 'admin/tracking', 'quote-tracker/guide'],
  },
  {
    key: 'clients',
    label: 'Clients',
    slugs: ['clients', 'admin/client-merge-review', 'clients/configuration', 'clients/guide'],
  },
  {
    key: 'ps-generator',
    label: 'PS Generator',
    slugs: [
      'ps-generator',
      'ps-generator/history',
      'ps-generator/configuration',
      'ps-generator/configuration/publish',
    ],
  },
  {
    key: 'work-orders',
    label: 'Work Order',
    slugs: ['work-orders', 'work-orders/manage', 'admin/work-orders', 'work-orders/guide'],
  },
  {
    key: 'admin',
    label: 'Admin',
    slugs: [
      'admin',
      'admin/administration',
      'admin/lead-scoring',
      'admin/calculator-pricing',
      'admin/dashboard-settings',
      'admin/lead-import',
    ],
  },
]

export const MENU_KEYS = MENU_DEFINITIONS.map((menu) => menu.key)

export const DEFAULT_MENU_AVAILABILITY: MenuAvailability = {
  staff: {
    'lead-intake': true,
    'quote-tracker': true,
    clients: false,
    'ps-generator': false,
    'work-orders': false,
    admin: false,
  },
  admin: {
    'lead-intake': true,
    'quote-tracker': true,
    clients: false,
    'ps-generator': false,
    'work-orders': false,
    admin: true,
  },
}

const MENU_KEY_BY_SLUG = new Map<string, MenuKey>(
  MENU_DEFINITIONS.flatMap((menu) => menu.slugs.map((slug) => [slug, menu.key] as const)),
)

export function menuKeyForSlug(slug: string): MenuKey | null {
  return MENU_KEY_BY_SLUG.get(slug) ?? null
}

export function normalizeMenuAvailability(value: unknown): MenuAvailability {
  const parsed = isRecord(value) ? value : {}

  return {
    staff: normalizeRoleAvailability(parsed.staff, DEFAULT_MENU_AVAILABILITY.staff),
    admin: normalizeRoleAvailability(parsed.admin, DEFAULT_MENU_AVAILABILITY.admin),
  }
}

export function parseMenuAvailabilitySetting(value: string | null | undefined): MenuAvailability {
  if (!value) return DEFAULT_MENU_AVAILABILITY

  try {
    return normalizeMenuAvailability(JSON.parse(value))
  } catch {
    return DEFAULT_MENU_AVAILABILITY
  }
}

export function serializeMenuAvailability(value: MenuAvailability) {
  return JSON.stringify(normalizeMenuAvailability(value))
}

export function roleCanSeeMenu(
  role: MenuRole,
  slug: string,
  availability: MenuAvailability,
) {
  const menuKey = menuKeyForSlug(slug)
  if (!menuKey) return true

  return availability[role][menuKey]
}

function normalizeRoleAvailability(value: unknown, fallback: Record<MenuKey, boolean>) {
  const parsed = isRecord(value) ? value : {}
  return Object.fromEntries(
    MENU_KEYS.map((key) => [key, typeof parsed[key] === 'boolean' ? parsed[key] : fallback[key]]),
  ) as Record<MenuKey, boolean>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
