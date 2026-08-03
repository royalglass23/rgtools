// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import type { ProductionSpecification } from '../production-specifications'

const catalogueRows = [
  {
    id: 'system.active-rail',
    field: 'system',
    displayLabel: 'Active Rail',
    productionLabel: 'Active Rail',
    aliases: [],
    psCategorySlug: null,
    psOptionSlug: null,
    ps1Applicable: false,
    ps3Applicable: false,
    isActive: true,
    sortOrder: 10,
  },
  {
    id: 'system.retired-rail',
    field: 'system',
    displayLabel: 'Retired Rail',
    productionLabel: 'Retired Rail',
    aliases: [],
    psCategorySlug: null,
    psOptionSlug: null,
    ps1Applicable: false,
    ps3Applicable: false,
    isActive: false,
    sortOrder: 20,
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
    ps1Applicable: {},
    ps3Applicable: {},
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

import {
  buildProductionSpecificationCatalogueChange,
  loadProductionSpecificationCatalogue,
  parseProductionSpecificationCatalogueOptionInput,
  projectProductionSpecificationCatalogueOptionToPs,
  validateProductionSpecificationCataloguePsMapping,
} from '../production-specification-catalogue'

describe('Production Specification catalogue loading', () => {
  it('returns deprecated options so confirmed specifications remain readable', async () => {
    await expect(loadProductionSpecificationCatalogue()).resolves.toEqual([
      expect.objectContaining({
        id: 'system.active-rail',
        isActive: true,
        ps1Applicable: false,
        ps3Applicable: false,
        sortOrder: 10,
      }),
      expect.objectContaining({ id: 'system.retired-rail', isActive: false, sortOrder: 20 }),
    ])
  })

  it('rejects aliases that would resolve to two canonical options in the same field', () => {
    expect(() => parseProductionSpecificationCatalogueOptionInput({
      id: 'system.second-rail',
      field: 'system',
      displayLabel: 'Second Rail',
      productionLabel: 'Second Rail',
      aliases: ['active rail'],
      ps1Applicable: false,
      ps3Applicable: false,
      isActive: true,
      sortOrder: 30,
    }, [{
      id: 'system.active-rail',
      field: 'system',
      displayLabel: 'Active Rail',
      productionLabel: 'Active Rail',
      aliases: ['rail one'],
      ps1Applicable: false,
      ps3Applicable: false,
      isActive: true,
      sortOrder: 10,
    }])).toThrow('Alias active rail is already used by Active Rail.')
  })

  it('checks every token accepted by the alias resolver for collisions', () => {
    const existing = {
      id: 'system.active-rail',
      field: 'system' as const,
      displayLabel: 'Active Rail',
      productionLabel: 'AR Rail',
      aliases: ['rail one'],
      ps1Applicable: false,
      ps3Applicable: false,
      isActive: true,
      sortOrder: 10,
    }

    expect(() => parseProductionSpecificationCatalogueOptionInput({
      id: 'system.second-rail',
      field: 'system',
      displayLabel: 'Second Rail',
      productionLabel: 'Second Rail',
      aliases: ['AR Rail'],
      ps1Applicable: false,
      ps3Applicable: false,
      isActive: true,
      sortOrder: 20,
    }, [existing])).toThrow('Alias ar rail is already used by Active Rail.')

    expect(() => parseProductionSpecificationCatalogueOptionInput({
      id: 'system.second-rail',
      field: 'system',
      displayLabel: 'system.active-rail',
      productionLabel: 'Second Rail',
      aliases: [],
      ps1Applicable: false,
      ps3Applicable: false,
      isActive: true,
      sortOrder: 20,
    }, [existing])).toThrow('Alias system.active-rail is already used by Active Rail.')
  })

  it('keeps the stable ID and field immutable while editing catalogue wording', () => {
    const existing = {
      id: 'glass_construction.toughened',
      field: 'glassConstruction' as const,
      displayLabel: 'Toughened',
      productionLabel: 'Toughened',
      aliases: ['tempered'],
      psCategorySlug: 'glass_type',
      psOptionSlug: 'toughened',
      ps1Applicable: true,
      ps3Applicable: true,
      isActive: true,
      sortOrder: 10,
    }

    expect(parseProductionSpecificationCatalogueOptionInput({
      ...existing,
      id: 'forged-id',
      field: 'glassAppearance',
      displayLabel: 'Safety Toughened',
    }, [existing], existing)).toMatchObject({
      id: 'glass_construction.toughened',
      field: 'glassConstruction',
      displayLabel: 'Safety Toughened',
    })
  })

  it('projects Glass Construction to the PS Glass type context but keeps appearance separate', () => {
    expect(projectProductionSpecificationCatalogueOptionToPs({
      id: 'glass_construction.toughened',
      field: 'glassConstruction',
      displayLabel: 'Toughened',
      productionLabel: 'Toughened',
      aliases: [],
      psCategorySlug: 'glass_type',
      psOptionSlug: 'toughened',
      ps1Applicable: true,
      ps3Applicable: true,
      isActive: true,
      sortOrder: 10,
    }, 'ps1')).toEqual({
      categorySlug: 'glass_type',
      categoryLabel: 'Glass type',
      optionSlug: 'toughened',
    })

    expect(projectProductionSpecificationCatalogueOptionToPs({
      id: 'glass_appearance.clear',
      field: 'glassAppearance',
      displayLabel: 'Clear',
      productionLabel: 'Clear',
      aliases: [],
      ps1Applicable: false,
      ps3Applicable: false,
      isActive: true,
      sortOrder: 10,
    }, 'ps1')).toBeNull()
  })

  it('enforces field ownership for the PS Glass type context', () => {
    const shared = {
      id: 'glass_appearance.clear',
      field: 'glassAppearance' as const,
      displayLabel: 'Clear',
      productionLabel: 'Clear',
      aliases: [],
      psCategorySlug: 'glass_type',
      psOptionSlug: 'toughened',
      ps1Applicable: true,
      ps3Applicable: false,
      isActive: true,
      sortOrder: 10,
    }
    expect(() => parseProductionSpecificationCatalogueOptionInput(shared, [])).toThrow(
      'The PS Glass type category belongs to Glass Construction, not Glass Appearance or another Work Order field.',
    )
    expect(() => parseProductionSpecificationCatalogueOptionInput({
      ...shared,
      id: 'glass_construction.toughened',
      field: 'glassConstruction',
      psCategorySlug: 'glass_colour',
    }, [])).toThrow('Glass Construction PS mappings must use the Glass type category.')
  })

  it('validates applicable mappings against the published PS Generator configuration', () => {
    const option = {
      id: 'glass_construction.toughened',
      field: 'glassConstruction' as const,
      displayLabel: 'Toughened',
      productionLabel: 'Toughened',
      aliases: [],
      psCategorySlug: 'glass_type',
      psOptionSlug: 'toughened',
      ps1Applicable: true,
      ps3Applicable: false,
      isActive: true,
      sortOrder: 10,
    }
    expect(() => validateProductionSpecificationCataloguePsMapping(option, [{
      slug: 'glass_type',
      label: 'Glass type',
      values: [{ slug: 'toughened', label: 'Toughened' }],
    }])).not.toThrow()
    expect(() => validateProductionSpecificationCataloguePsMapping(option, [{
      slug: 'glass_type',
      label: 'Glass type',
      values: [{ slug: 'laminated', label: 'Laminated' }],
    }])).toThrow('PS1 mapping glass_type.toughened is not present in the published PS Generator configuration.')
  })

  it('requires confirmation for a used rename and rebuilds labels with system history', () => {
    const current = {
      id: 'finish.chrome',
      field: 'hardwareFinish' as const,
      displayLabel: 'Chrome',
      productionLabel: 'Chrome',
      aliases: ['polished chrome'],
      ps1Applicable: false,
      ps3Applicable: false,
      isActive: true,
      sortOrder: 10,
    }
    const confirmedData = specificationWithHardwareFinish('finish.chrome')
    const catalogue = [{
      id: 'system.shower-glass',
      field: 'system' as const,
      displayLabel: 'Shower Glass',
      productionLabel: 'Shower Glass',
      aliases: [],
      ps1Applicable: false,
      ps3Applicable: false,
      isActive: true,
      sortOrder: 10,
    }, current]
    const affectedSpecifications = [{
      specificationId: 'spec-1',
      workOrderItemId: 'item-1',
      workOrderId: 'work-order-1',
      confirmedData,
      productionLabel: 'Shower Glass | Location TBC | Chrome',
    }]

    expect(() => buildProductionSpecificationCatalogueChange({
      current,
      next: { ...current, displayLabel: 'Polished Chrome', productionLabel: 'Polished Chrome' },
      catalogue,
      affectedSpecifications,
      confirmedImpact: false,
    })).toThrow('Confirm the impact on 1 confirmed item before saving this catalogue change.')

    expect(buildProductionSpecificationCatalogueChange({
      current,
      next: { ...current, displayLabel: 'Polished Chrome', productionLabel: 'Polished Chrome' },
      catalogue,
      affectedSpecifications,
      confirmedImpact: true,
    })).toMatchObject({
      affectedCount: 1,
      rebuiltCount: 1,
      specificationUpdates: [{
        specificationId: 'spec-1',
        productionLabel: 'Shower Glass | Location TBC\nPolished Chrome',
        revision: {
          revisionType: 'catalogue_option_changed',
          note: 'Catalogue option finish.chrome changed: Display label Chrome -> Polished Chrome; Production Label wording Chrome -> Polished Chrome.',
        },
      }],
    })
  })

  it('preserves deprecated confirmed wording and records the state transition', () => {
    const current = {
      id: 'finish.chrome',
      field: 'hardwareFinish' as const,
      displayLabel: 'Chrome',
      productionLabel: 'Chrome',
      aliases: [],
      ps1Applicable: false,
      ps3Applicable: false,
      isActive: true,
      sortOrder: 10,
    }
    const system = {
      id: 'system.shower-glass',
      field: 'system' as const,
      displayLabel: 'Shower Glass',
      productionLabel: 'Shower Glass',
      aliases: [],
      ps1Applicable: false,
      ps3Applicable: false,
      isActive: true,
      sortOrder: 10,
    }
    const [update] = buildProductionSpecificationCatalogueChange({
      current,
      next: { ...current, isActive: false },
      catalogue: [system, current],
      affectedSpecifications: [{
        specificationId: 'spec-1',
        workOrderItemId: 'item-1',
        workOrderId: 'work-order-1',
        confirmedData: specificationWithHardwareFinish(current.id),
        productionLabel: 'Shower Glass | Location TBC\nChrome',
      }],
      confirmedImpact: true,
    }).specificationUpdates

    expect(update.productionLabel).toBe('Shower Glass | Location TBC\nChrome')
    expect(update.revision.changes).toContainEqual({
      kind: 'catalogue',
      identity: 'finish.chrome',
      label: 'State',
      previousValue: 'Active',
      newValue: 'Deprecated',
    })
  })
})

function specificationWithHardwareFinish(catalogueId: string): ProductionSpecification {
  const tbc = { state: 'tbc' as const }
  return {
    schemaVersion: 1,
    system: { state: 'selected', catalogueId: 'system.shower-glass' },
    structureMaterial: tbc,
    structureType: tbc,
    locationEnvironment: tbc,
    locationDetail: tbc,
    structureBuilt: tbc,
    glassConstruction: tbc,
    glassAppearance: tbc,
    thickness: tbc,
    gateRequired: tbc,
    doorOpeningType: tbc,
    fixingMethod: tbc,
    hardwareFinish: { state: 'selected', catalogueId },
    systemFinish: tbc,
    interlinkingRail: tbc,
    deliveryScope: tbc,
    measurements: [],
    additionalComponents: [],
    specialRequirements: [],
  }
}
