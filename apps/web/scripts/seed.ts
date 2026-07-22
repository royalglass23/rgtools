import { config } from 'dotenv'
import { PRODUCTION_ACCESS_MODULES } from '../lib/production-access'

config({ path: '.env.local' })

async function seed() {
  const bcrypt = await import('bcryptjs')
  const { db } = await import('../lib/db')
  const { users, modules, userModuleAccess } = await import('@rgtools/db/schema')
  const { eq } = await import('drizzle-orm')

  const username = 'rgadmin'
  const password = '*royalglass23'

  // Upsert rgadmin user
  const existing = await db.select().from(users).where(eq(users.username, username))
  const passwordHash = await bcrypt.default.hash(password, 12)
  if (existing.length > 0) {
    // User exists; keep the documented local credentials deterministic for tests.
    await db
      .update(users)
      .set({ passwordHash, role: 'admin', isProtected: true })
      .where(eq(users.username, username))
    console.log(`Updated user '${username}' to role=admin, isProtected=true`)
  } else {
    // User does not exist; create with role=admin and isProtected=true
    await db.insert(users).values({
      username,
      passwordHash,
      role: 'admin',
      isProtected: true,
    })
    console.log(`Created admin user: ${username}`)
  }

  // Upsert modules
  const modulesToSeed = [
    ...PRODUCTION_ACCESS_MODULES.map((moduleRow) => ({ ...moduleRow, isActive: true })),
    { slug: 'clients', name: 'Clients', adminOnly: false, sortOrder: 3, isActive: true },
    { slug: 'ps-generator', name: 'PS Generator', adminOnly: false, sortOrder: 4, isActive: true },
    { slug: 'ps-generator/history', name: 'PS History', adminOnly: false, sortOrder: 5, isActive: true },
    { slug: 'ps-generator/configuration', name: 'PS Configuration', adminOnly: false, sortOrder: 6, isActive: true },
    { slug: 'ps-generator/configuration/publish', name: 'PS Configuration Publisher', adminOnly: false, sortOrder: 7, isActive: true },
    { slug: 'work-orders', name: 'Work Orders', adminOnly: false, sortOrder: 8, isActive: true },
    { slug: 'work-orders/manage', name: 'Work Orders Manage', adminOnly: false, sortOrder: 9, isActive: true },
    { slug: 'admin', name: 'Administration', adminOnly: true, sortOrder: 99, isActive: true },
    { slug: 'admin/calculator-pricing', name: 'Cost Calculator Price', adminOnly: true, sortOrder: 101, isActive: true },
    { slug: 'admin/dashboard-settings', name: 'Dashboard Settings', adminOnly: true, sortOrder: 102, isActive: true },
    { slug: 'admin/tracking', name: 'Tracking Settings', adminOnly: true, sortOrder: 103, isActive: true },
    { slug: 'admin/client-merge-review', name: 'Client Merge Review', adminOnly: true, sortOrder: 105, isActive: true },
    { slug: 'admin/work-orders', name: 'Work Order Configuration', adminOnly: true, sortOrder: 106, isActive: true },
  ]

  for (const moduleSeed of modulesToSeed) {
    const existing = await db.select().from(modules).where(eq(modules.slug, moduleSeed.slug))
    if (existing.length > 0) {
      await db
        .update(modules)
        .set({ ...moduleSeed, updatedAt: new Date() })
        .where(eq(modules.slug, moduleSeed.slug))
      console.log(`Updated module: ${moduleSeed.slug}`)
    } else {
      await db.insert(modules).values(moduleSeed)
      console.log(`Created module: ${moduleSeed.slug}`)
    }
  }

  const staffDefaultModuleSlugs = [
    ...PRODUCTION_ACCESS_MODULES.map((moduleRow) => moduleRow.slug),
    'clients',
    'ps-generator',
    'ps-generator/history',
    'dashboard',
    'work-orders',
  ]
  const staffDefaultModules = await db
    .select({ id: modules.id, slug: modules.slug })
    .from(modules)
    .where(eq(modules.adminOnly, false))
  const staffDefaultModuleRows = staffDefaultModules.filter((moduleRow) => staffDefaultModuleSlugs.includes(moduleRow.slug))

  if (staffDefaultModuleRows.length > 0) {
    const staffUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'staff'))

    for (const staffUser of staffUsers) {
      for (const moduleRow of staffDefaultModuleRows) {
        await db
          .insert(userModuleAccess)
          .values({
            userId: staffUser.id,
            moduleId: moduleRow.id,
            grantedBy: null,
          })
          .onConflictDoNothing()
      }
    }
  }

  console.log('Seed completed successfully')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
