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
}

export interface ProductionAccessResult {
  ensuredModuleSlugs: string[]
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
  return {
    ensuredModuleSlugs: productionModules.map((moduleRow) => moduleRow.slug),
  }
}
