export interface DashboardModule {
  id: string
  slug: string
  name: string
  sortOrder: number
  adminOnly: boolean
  isActive: boolean
}

export interface DashboardNavItem {
  id: string
  slug: string
  name: string
  href: string
}

const LEAD_INTAKE_ROUTE_BY_SLUG: Record<string, DashboardNavItem> = {
  'lead-intake': {
    id: 'lead-intake-form',
    slug: 'lead-intake',
    name: 'Form',
    href: '/lead-intake',
  },
  leads: {
    id: 'lead-intake-list',
    slug: 'leads',
    name: 'List',
    href: '/leads',
  },
}

const LEAD_INTAKE_SORT_ORDER: Record<string, number> = {
  'lead-intake': 0,
  leads: 1,
  'lead-intake/configuration': 2,
  'lead-intake/guide': 3,
}

const QUOTE_TRACKER_ROUTE_BY_SLUG: Record<string, DashboardNavItem> = {
  'quote-tracker': {
    id: 'quote-tracker-list',
    slug: 'quote-tracker',
    name: 'Track Quotes',
    href: '/quote-tracker',
  },
  'admin/tracking': {
    id: 'quote-tracker-configuration',
    slug: 'admin/tracking',
    name: 'Configuration',
    href: '/admin/tracking',
  },
}

const QUOTE_TRACKER_SORT_ORDER: Record<string, number> = {
  'quote-tracker': 0,
  'admin/tracking': 1,
  'quote-tracker/guide': 2,
}

const CLIENTS_ROUTE_BY_SLUG: Record<string, DashboardNavItem> = {
  clients: {
    id: 'clients-list',
    slug: 'clients',
    name: 'List',
    href: '/clients',
  },
  'admin/client-merge-review': {
    id: 'clients-merge-review',
    slug: 'admin/client-merge-review',
    name: 'Merge Review',
    href: '/admin/client-merge-review',
  },
}

const CLIENTS_SORT_ORDER: Record<string, number> = {
  clients: 0,
  'admin/client-merge-review': 1,
  'clients/configuration': 2,
  'clients/guide': 3,
}

const PS_GENERATOR_ROUTE_BY_SLUG: Record<string, DashboardNavItem> = {
  'ps-generator': {
    id: 'ps-generator-generate',
    slug: 'ps-generator',
    name: 'Generate PS',
    href: '/ps-generator',
  },
  'ps-generator/configuration': {
    id: 'ps-generator-configuration',
    slug: 'ps-generator/configuration',
    name: 'Configuration',
    href: '/ps-generator/configuration',
  },
  'ps-generator/history': {
    id: 'ps-generator-history',
    slug: 'ps-generator/history',
    name: 'History',
    href: '/ps-generator/history',
  },
}

const PS_GENERATOR_SORT_ORDER: Record<string, number> = {
  'ps-generator': 0,
  'ps-generator/history': 1,
  'ps-generator/configuration': 2,
}

const PS_GENERATOR_PERMISSION_ONLY_SLUGS = new Set([
  'ps-generator/configuration/publish',
])

const WORK_ORDER_ROUTE_BY_SLUG: Record<string, DashboardNavItem> = {
  'work-orders': {
    id: 'work-order-list',
    slug: 'work-orders',
    name: 'Lists',
    href: '/work-orders',
  },
  'admin/work-orders': {
    id: 'work-order-configuration',
    slug: 'admin/work-orders',
    name: 'Configuration',
    href: '/admin/work-orders',
  },
}

const WORK_ORDER_SORT_ORDER: Record<string, number> = {
  'work-orders': 0,
  'admin/work-orders': 1,
  'work-orders/guide': 2,
}

const WORK_ORDER_PERMISSION_ONLY_SLUGS = new Set([
  'work-orders/manage',
])

const REMOVED_ROUTE_SLUGS = new Set([
  'admin/lead-import',
  'admin/lead-scoring',
])

const ADMIN_ROUTE_BY_SLUG: Record<string, string> = {
  admin: '/admin/administration',
  'admin/administration': '/admin/administration',
  'admin/calculator-pricing': '/admin/calculator-pricing',
  'admin/dashboard-settings': '/admin/dashboard-settings',
}

const ADMIN_SORT_ORDER: Record<string, number> = {
  admin: 0,
  'admin/administration': 0,
  'admin/calculator-pricing': 1,
  'admin/dashboard-settings': 2,
}

function adminItemKey(slug: string) {
  return slug === 'admin/administration' ? 'admin' : slug
}

export function buildDashboardNavigation(modules: DashboardModule[], options: { isAdmin?: boolean; showWorkOrderNavigation?: boolean } = {}) {
  const activeModules = modules
    .filter((mod) => mod.isActive)
    .toSorted((a, b) => a.sortOrder - b.sortOrder)

  const primaryModules = activeModules.filter((mod) => (
    !(mod.slug in ADMIN_ROUTE_BY_SLUG) &&
    !(mod.slug in LEAD_INTAKE_ROUTE_BY_SLUG) &&
    !(mod.slug in QUOTE_TRACKER_ROUTE_BY_SLUG) &&
    !(mod.slug in CLIENTS_ROUTE_BY_SLUG) &&
    !(mod.slug in PS_GENERATOR_ROUTE_BY_SLUG) &&
    !(mod.slug in WORK_ORDER_ROUTE_BY_SLUG) &&
    !PS_GENERATOR_PERMISSION_ONLY_SLUGS.has(mod.slug) &&
    !WORK_ORDER_PERMISSION_ONLY_SLUGS.has(mod.slug) &&
    !REMOVED_ROUTE_SLUGS.has(mod.slug)
  ))
  const leadIntakeItemsByKey = new Map<string, DashboardNavItem>()
  const quoteTrackerItemsByKey = new Map<string, DashboardNavItem>()
  const clientsItemsByKey = new Map<string, DashboardNavItem>()
  const psGeneratorItemsByKey = new Map<string, DashboardNavItem>()
  const workOrderItemsByKey = new Map<string, DashboardNavItem>()
  const adminItemsByKey = new Map<string, DashboardNavItem>()

  for (const mod of activeModules) {
    const item = LEAD_INTAKE_ROUTE_BY_SLUG[mod.slug]
    if (!item) continue

    leadIntakeItemsByKey.set(item.slug, item)
  }

  if (options.isAdmin && leadIntakeItemsByKey.size > 0) {
    leadIntakeItemsByKey.set('lead-intake/configuration', {
      id: 'lead-intake-configuration',
      slug: 'lead-intake/configuration',
      name: 'Configuration',
      href: '/lead-intake/configuration',
    })
  }

  if (leadIntakeItemsByKey.size > 0) {
    leadIntakeItemsByKey.set('lead-intake/guide', {
      id: 'lead-intake-guide',
      slug: 'lead-intake/guide',
      name: 'Guide',
      href: '/lead-intake/guide',
    })
  }

  for (const mod of activeModules) {
    const item = QUOTE_TRACKER_ROUTE_BY_SLUG[mod.slug]
    if (!item) continue

    quoteTrackerItemsByKey.set(item.slug, item)
  }

  if (!quoteTrackerItemsByKey.has('quote-tracker')) {
    quoteTrackerItemsByKey.clear()
  }

  if (quoteTrackerItemsByKey.size > 0) {
    quoteTrackerItemsByKey.set('quote-tracker/guide', {
      id: 'quote-tracker-guide',
      slug: 'quote-tracker/guide',
      name: 'Guide',
      href: '/quote-tracker/guide',
    })
  }

  for (const mod of activeModules) {
    const item = CLIENTS_ROUTE_BY_SLUG[mod.slug]
    if (!item) continue

    clientsItemsByKey.set(item.slug, item)
  }

  if (!clientsItemsByKey.has('clients')) {
    clientsItemsByKey.clear()
  }

  if (options.isAdmin && clientsItemsByKey.has('clients')) {
    clientsItemsByKey.set('clients/configuration', {
      id: 'clients-configuration',
      slug: 'clients/configuration',
      name: 'Configuration',
      href: '/clients/configuration',
    })
  }

  if (clientsItemsByKey.size > 0) {
    clientsItemsByKey.set('clients/guide', {
      id: 'clients-guide',
      slug: 'clients/guide',
      name: 'Guide',
      href: '/clients/guide',
    })
  }

  for (const mod of activeModules) {
    const item = PS_GENERATOR_ROUTE_BY_SLUG[mod.slug]
    if (!item) continue

    psGeneratorItemsByKey.set(item.slug, item)
  }

  if (options.isAdmin && psGeneratorItemsByKey.has('ps-generator')) {
    psGeneratorItemsByKey.set('ps-generator/history', {
      id: 'ps-generator-history',
      slug: 'ps-generator/history',
      name: 'History',
      href: '/ps-generator/history',
    })
    psGeneratorItemsByKey.set('ps-generator/configuration', {
      id: 'ps-generator-configuration',
      slug: 'ps-generator/configuration',
      name: 'Configuration',
      href: '/ps-generator/configuration',
    })
  }

  if (options.showWorkOrderNavigation) {
    for (const mod of activeModules) {
      if (mod.slug === 'admin/work-orders' && !options.isAdmin) continue

      const item = WORK_ORDER_ROUTE_BY_SLUG[mod.slug]
      if (!item) continue

      workOrderItemsByKey.set(item.slug, item)
    }

    if (workOrderItemsByKey.has('work-orders')) {
      workOrderItemsByKey.set('work-orders/guide', {
        id: 'work-order-guide',
        slug: 'work-orders/guide',
        name: 'Guide',
        href: '/work-orders/guide',
      })
    }
  }

  for (const mod of activeModules) {
    const href = ADMIN_ROUTE_BY_SLUG[mod.slug]
    if (!href) continue

    const key = adminItemKey(mod.slug)
    if (!adminItemsByKey.has(key)) {
      adminItemsByKey.set(key, {
        id: mod.id,
        slug: mod.slug,
        name: mod.name,
        href,
      })
    }
  }

  const adminItems = Array.from(adminItemsByKey.values()).toSorted((a, b) => {
    const aOrder = ADMIN_SORT_ORDER[a.slug] ?? Number.MAX_SAFE_INTEGER
    const bOrder = ADMIN_SORT_ORDER[b.slug] ?? Number.MAX_SAFE_INTEGER
    return aOrder - bOrder
  })

  const leadIntakeItems = Array.from(leadIntakeItemsByKey.values()).toSorted((a, b) => {
    const aOrder = LEAD_INTAKE_SORT_ORDER[a.slug] ?? Number.MAX_SAFE_INTEGER
    const bOrder = LEAD_INTAKE_SORT_ORDER[b.slug] ?? Number.MAX_SAFE_INTEGER
    return aOrder - bOrder
  })

  const psGeneratorItems = Array.from(psGeneratorItemsByKey.values()).toSorted((a, b) => {
    const aOrder = PS_GENERATOR_SORT_ORDER[a.slug] ?? Number.MAX_SAFE_INTEGER
    const bOrder = PS_GENERATOR_SORT_ORDER[b.slug] ?? Number.MAX_SAFE_INTEGER
    return aOrder - bOrder
  })

  const quoteTrackerItems = Array.from(quoteTrackerItemsByKey.values()).toSorted((a, b) => {
    const aOrder = QUOTE_TRACKER_SORT_ORDER[a.slug] ?? Number.MAX_SAFE_INTEGER
    const bOrder = QUOTE_TRACKER_SORT_ORDER[b.slug] ?? Number.MAX_SAFE_INTEGER
    return aOrder - bOrder
  })

  const clientsItems = Array.from(clientsItemsByKey.values()).toSorted((a, b) => {
    const aOrder = CLIENTS_SORT_ORDER[a.slug] ?? Number.MAX_SAFE_INTEGER
    const bOrder = CLIENTS_SORT_ORDER[b.slug] ?? Number.MAX_SAFE_INTEGER
    return aOrder - bOrder
  })

  const workOrderItems = Array.from(workOrderItemsByKey.values()).toSorted((a, b) => {
    const aOrder = WORK_ORDER_SORT_ORDER[a.slug] ?? Number.MAX_SAFE_INTEGER
    const bOrder = WORK_ORDER_SORT_ORDER[b.slug] ?? Number.MAX_SAFE_INTEGER
    return aOrder - bOrder
  })

  return { primaryModules, leadIntakeItems, quoteTrackerItems, clientsItems, psGeneratorItems, workOrderItems, adminItems }
}
