import { describe, expect, it } from 'vitest'
import {
  ensureProductionAccess,
  type ProductionAccessModule,
  type ProductionAccessStore,
  type ProductionModuleDefinition,
} from '../production-access'

describe('ensureProductionAccess', () => {
  it('creates missing canonical modules without writing user grants', async () => {
    const modules = new Map<string, ProductionAccessModule>()
    const store: ProductionAccessStore = {
      async ensureActiveModule(definition: ProductionModuleDefinition) {
        const row = { id: `module-${definition.slug}`, ...definition, isActive: true }
        modules.set(definition.slug, row)
        return row
      },
    }

    const result = await ensureProductionAccess(store)

    expect(result.ensuredModuleSlugs).toEqual(['lead-intake', 'leads', 'quote-tracker'])
    expect([...modules.keys()]).toEqual(result.ensuredModuleSlugs)
  })
})
