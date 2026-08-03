import { config } from 'dotenv'
import type { ProductionAccessStore } from '../lib/production-access'

config({ path: '.env.local' })

async function seedProductionAccess() {
  const { eq } = await import('drizzle-orm')
  const { db } = await import('../lib/db')
  const { users, modules, userModuleAccess } = await import('@rgtools/db/schema')
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
    async listStaffUserIds() {
      const staffUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'staff'))
      return staffUsers.map((user) => user.id)
    },
    async ensureUserModuleAccess(userId, moduleId) {
      const result = await db
        .insert(userModuleAccess)
        .values({
          userId,
          moduleId,
          grantedBy: null,
        })
        .onConflictDoNothing()
        .returning({ userId: userModuleAccess.userId })
      return result.length > 0
    },
  }

  const result = await ensureProductionAccess(store)
  console.log(`Checked ${result.staffUserCount} staff users`)
  console.log(`Ensured staff access to: ${result.ensuredModuleSlugs.join(', ')}`)
  console.log(`Inserted ${result.insertedGrantCount} missing access grants`)
  process.exit(0)
}

seedProductionAccess().catch((error) => {
  console.error('Seed production access failed:', error)
  process.exit(1)
})
