import { describe, expect, it } from 'vitest'
import { canAccessModule, type AccessUser } from '../access'
import {
  ensureProductionAccess,
  type ProductionAccessModule,
  type ProductionAccessStore,
  type ProductionModuleDefinition,
} from '../production-access'

describe('ensureProductionAccess', () => {
  it('restores a missing Quote Tracker module for admins and staff', async () => {
    const store = new MemoryProductionAccessStore({
      modules: [
        moduleRow('lead-intake', 'Lead Intake', 0),
        moduleRow('leads', 'Leads', 1),
        moduleRow('reports', 'Reports', 50),
      ],
      staffUserIds: ['staff-1'],
      grants: {
        'staff-1': ['lead-intake', 'leads', 'reports'],
      },
    })
    const unrelatedModuleBefore = store.moduleSnapshot('reports')

    const result = await ensureProductionAccess(store)

    expect({
      insertedGrantCount: result.insertedGrantCount,
      unrelatedModule: store.moduleSnapshot('reports'),
      admin: store.accessibleSlugs({
        id: 'admin-1',
        username: 'rgadmin',
        role: 'admin',
        isProtected: true,
      }),
      staff: store.accessibleSlugs({
        id: 'staff-1',
        username: 'staff-1',
        role: 'staff',
        isProtected: false,
      }),
    }).toEqual({
      insertedGrantCount: 1,
      unrelatedModule: unrelatedModuleBefore,
      admin: ['lead-intake', 'leads', 'quote-tracker', 'reports'],
      staff: ['lead-intake', 'leads', 'quote-tracker', 'reports'],
    })
  })

  it('reactivates canonical modules without duplicating existing grants', async () => {
    const store = new MemoryProductionAccessStore({
      modules: [
        moduleRow('lead-intake', 'Lead Intake', 0),
        moduleRow('leads', 'Leads', 1),
        { ...moduleRow('quote-tracker', 'Quote Tracker', 2), isActive: false },
      ],
      staffUserIds: ['staff-1'],
      grants: {
        'staff-1': ['lead-intake', 'leads', 'quote-tracker'],
      },
    })

    const firstRun = await ensureProductionAccess(store)
    const secondRun = await ensureProductionAccess(store)

    expect({
      quoteTrackerActive: store.moduleSnapshot('quote-tracker').isActive,
      firstRunInsertedGrantCount: firstRun.insertedGrantCount,
      secondRunInsertedGrantCount: secondRun.insertedGrantCount,
    }).toEqual({
      quoteTrackerActive: true,
      firstRunInsertedGrantCount: 0,
      secondRunInsertedGrantCount: 0,
    })
  })
})

class MemoryProductionAccessStore implements ProductionAccessStore {
  private readonly modules = new Map<string, ProductionAccessModule>()
  private readonly staffUserIds: string[]
  private readonly grants = new Map<string, Set<string>>()

  constructor(input: {
    modules: ProductionAccessModule[]
    staffUserIds: string[]
    grants: Record<string, string[]>
  }) {
    for (const moduleRow of input.modules) {
      this.modules.set(moduleRow.slug, moduleRow)
    }
    this.staffUserIds = input.staffUserIds
    for (const [userId, slugs] of Object.entries(input.grants)) {
      this.grants.set(
        userId,
        new Set(slugs.map((slug) => this.requireModule(slug).id)),
      )
    }
  }

  async ensureActiveModule(
    definition: ProductionModuleDefinition,
  ): Promise<ProductionAccessModule> {
    const existing = this.modules.get(definition.slug)
    const moduleRow = {
      id: existing?.id ?? `module-${definition.slug}`,
      ...definition,
      isActive: true,
    }
    this.modules.set(moduleRow.slug, moduleRow)
    return moduleRow
  }

  async listStaffUserIds(): Promise<string[]> {
    return this.staffUserIds
  }

  async ensureUserModuleAccess(
    userId: string,
    moduleId: string,
  ): Promise<boolean> {
    const grants = this.grants.get(userId) ?? new Set<string>()
    const sizeBefore = grants.size
    grants.add(moduleId)
    this.grants.set(userId, grants)
    return grants.size > sizeBefore
  }

  accessibleSlugs(user: AccessUser): string[] {
    const grants = this.grants.get(user.id) ?? new Set<string>()
    return Array.from(this.modules.values())
      .filter((moduleRow) => canAccessModule(user, moduleRow, grants))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((moduleRow) => moduleRow.slug)
  }

  moduleSnapshot(slug: string): ProductionAccessModule {
    return { ...this.requireModule(slug) }
  }

  private requireModule(slug: string): ProductionAccessModule {
    const moduleRow = this.modules.get(slug)
    if (!moduleRow) throw new Error(`Missing fixture module: ${slug}`)
    return moduleRow
  }
}

function moduleRow(
  slug: string,
  name: string,
  sortOrder: number,
): ProductionAccessModule {
  return {
    id: `module-${slug}`,
    slug,
    name,
    adminOnly: false,
    isActive: true,
    sortOrder,
  }
}
