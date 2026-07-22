export interface ProductionModuleDefinition {
  slug: string
  name: string
  adminOnly: boolean
  sortOrder: number
}

export interface ProductionAccessModule extends ProductionModuleDefinition {
  id: string
  isActive: boolean
}

export interface ProductionAccessStore {
  ensureActiveModule(
    definition: ProductionModuleDefinition,
  ): Promise<ProductionAccessModule>
  listStaffUserIds(): Promise<string[]>
  ensureUserModuleAccess(userId: string, moduleId: string): Promise<boolean>
}

export interface ProductionAccessResult {
  staffUserCount: number
  ensuredModuleSlugs: string[]
  insertedGrantCount: number
}

export const PRODUCTION_ACCESS_MODULES: ProductionModuleDefinition[] = [
  {
    slug: 'lead-intake',
    name: 'Lead Intake',
    adminOnly: false,
    sortOrder: 0,
  },
  {
    slug: 'leads',
    name: 'Leads',
    adminOnly: false,
    sortOrder: 1,
  },
  {
    slug: 'quote-tracker',
    name: 'Quote Tracker',
    adminOnly: false,
    sortOrder: 2,
  },
]

export async function ensureProductionAccess(
  store: ProductionAccessStore,
): Promise<ProductionAccessResult> {
  const productionModules = await Promise.all(
    PRODUCTION_ACCESS_MODULES.map((definition) =>
      store.ensureActiveModule(definition),
    ),
  )
  const staffUserIds = await store.listStaffUserIds()

  let insertedGrantCount = 0
  for (const userId of staffUserIds) {
    for (const moduleRow of productionModules) {
      if (await store.ensureUserModuleAccess(userId, moduleRow.id)) {
        insertedGrantCount += 1
      }
    }
  }

  return {
    staffUserCount: staffUserIds.length,
    ensuredModuleSlugs: productionModules.map((moduleRow) => moduleRow.slug),
    insertedGrantCount,
  }
}
