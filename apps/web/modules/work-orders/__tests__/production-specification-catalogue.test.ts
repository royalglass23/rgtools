// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

const catalogueRows = [
  {
    id: 'system.active-rail',
    field: 'system',
    displayLabel: 'Active Rail',
    productionLabel: 'Active Rail',
    aliases: [],
    psCategorySlug: null,
    psOptionSlug: null,
    isActive: true,
  },
  {
    id: 'system.retired-rail',
    field: 'system',
    displayLabel: 'Retired Rail',
    productionLabel: 'Retired Rail',
    aliases: [],
    psCategorySlug: null,
    psOptionSlug: null,
    isActive: false,
  },
]

vi.mock('drizzle-orm', () => ({
  asc: vi.fn((column: unknown) => column),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}))

vi.mock('@rgtools/db/schema-workorders', () => ({
  workOrderSpecificationCatalogueOptions: {
    id: {},
    fieldName: {},
    displayLabel: {},
    productionLabel: {},
    aliases: {},
    psCategorySlug: {},
    psOptionSlug: {},
    isActive: {},
    sortOrder: {},
  },
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      let activeOnly = false
      const builder = {
        from: vi.fn(() => builder),
        where: vi.fn(() => {
          activeOnly = true
          return builder
        }),
        orderBy: vi.fn(async () => (
          activeOnly ? catalogueRows.filter((row) => row.isActive) : catalogueRows
        )),
      }
      return builder
    }),
  },
}))

import { loadProductionSpecificationCatalogue } from '../production-specification-catalogue'

describe('Production Specification catalogue loading', () => {
  it('returns deprecated options so confirmed specifications remain readable', async () => {
    await expect(loadProductionSpecificationCatalogue()).resolves.toEqual([
      expect.objectContaining({ id: 'system.active-rail', isActive: true }),
      expect.objectContaining({ id: 'system.retired-rail', isActive: false }),
    ])
  })
})
