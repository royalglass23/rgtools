import { config } from 'dotenv'
import type { ProductionAccessStore } from '../lib/production-access'

config({ path: '.env.local' })

async function seedProductionAccess() {
  const { db } = await import('../lib/db')
  const { modules } = await import('@rgtools/db/schema')
  const { ensureProductionAccess } = await import('../lib/production-access')

  const store: ProductionAccessStore = {
    async ensureActiveModule(definition) {
      const [moduleRow] = await db
        .insert(modules)
        .values({ ...definition, isActive: true })
        .onConflictDoUpdate({
          target: modules.slug,
          set: { ...definition, isActive: true, updatedAt: new Date() },
        })
        .returning({
          id: modules.id,
          slug: modules.slug,
          name: modules.name,
          adminOnly: modules.adminOnly,
          isActive: modules.isActive,
          sortOrder: modules.sortOrder,
        })

      return moduleRow
    },
  }

  const result = await ensureProductionAccess(store)
  console.log(`Ensured active modules: ${result.ensuredModuleSlugs.join(', ')}`)
  process.exit(0)
}

seedProductionAccess().catch((error) => {
  console.error('Seed production access failed:', error)
  process.exit(1)
})
