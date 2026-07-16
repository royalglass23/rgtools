import { describe, expect, it } from 'vitest'

import {
  buildProductionLabel,
  confirmProductionSpecificationDraft,
  parseProductionSpecification,
} from '../production-specifications'

describe('Production Specifications', () => {
  it('keeps shower location, glass appearance, and door type distinct in the unified label', () => {
    const specification = parseProductionSpecification({
      schemaVersion: 1,
      system: { state: 'selected', catalogueId: 'system.shower-glass' },
      structureMaterial: { state: 'tbc' },
      structureType: { state: 'tbc' },
      locationEnvironment: { state: 'selected', catalogueId: 'location.internal' },
      locationDetail: { state: 'selected', catalogueId: 'location_detail.bathroom' },
      structureBuilt: { state: 'tbc' },
      glassConstruction: { state: 'selected', catalogueId: 'glass_construction.toughened' },
      glassAppearance: { state: 'selected', catalogueId: 'glass_appearance.frosted' },
      thickness: { state: 'selected', catalogueId: 'thickness.10mm' },
      gateRequired: { state: 'selected', catalogueId: 'gate_required.no' },
      doorOpeningType: { state: 'selected', catalogueId: 'door_opening_type.hinged' },
      fixingMethod: { state: 'tbc' },
      hardwareFinish: { state: 'selected', catalogueId: 'finish.chrome' },
      systemFinish: { state: 'tbc' },
      interlinkingRail: { state: 'tbc' },
      deliveryScope: { state: 'selected', catalogueId: 'delivery_scope.supply-install' },
      measurements: [],
      additionalComponents: [],
      specialRequirements: [],
    })

    expect(buildProductionLabel(specification)).toBe(
      'Shower Glass | Int Bathroom | 10 mm Toughened Frosted | Hinged | Chrome | Supply & Install',
    )
  })

  it('validates the approved Double Disc tracer and builds one deterministic production label', () => {
    const specification = parseProductionSpecification({
      schemaVersion: 1,
      system: { state: 'selected', catalogueId: 'system.double-disc' },
      structureMaterial: { state: 'selected', catalogueId: 'structure_material.timber' },
      structureType: { state: 'selected', catalogueId: 'structure_type.balcony' },
      locationEnvironment: { state: 'selected', catalogueId: 'location.external' },
      locationDetail: { state: 'tbc' },
      structureBuilt: { state: 'selected', catalogueId: 'structure_built.new' },
      glassConstruction: { state: 'selected', catalogueId: 'glass_construction.toughened' },
      glassAppearance: { state: 'selected', catalogueId: 'glass_appearance.clear' },
      thickness: { state: 'selected', catalogueId: 'thickness.12mm' },
      gateRequired: { state: 'selected', catalogueId: 'gate_required.no' },
      doorOpeningType: { state: 'tbc' },
      fixingMethod: { state: 'selected', catalogueId: 'fixing_method.double-disc' },
      hardwareFinish: { state: 'selected', catalogueId: 'finish.chrome' },
      systemFinish: { state: 'tbc' },
      interlinkingRail: { state: 'selected', catalogueId: 'interlinking_rail.21x25mm' },
      deliveryScope: { state: 'selected', catalogueId: 'delivery_scope.supply-install' },
      measurements: [{ kind: 'length', value: '14.9', unit: 'm' }],
      additionalComponents: [],
      specialRequirements: [{
        kind: 'standard',
        detail: 'AS/NZS 2208:1996 compliant',
      }],
    })

    expect(buildProductionLabel(specification)).toBe(
      'Double Disc | Ext Balcony | 14.9 m | 12 mm Toughened Clear | Timber | Chrome | IL Rail 21 x 25 mm | Supply & Install',
    )
    expect(buildProductionLabel(specification)).not.toContain('AS/NZS')
  })

  it('promotes a corrected draft into the first attributable confirmed baseline without a change reason', () => {
    const draft = parseProductionSpecification({
      schemaVersion: 1,
      system: { state: 'selected', catalogueId: 'system.double-disc' },
      structureMaterial: { state: 'selected', catalogueId: 'structure_material.timber' },
      structureType: { state: 'selected', catalogueId: 'structure_type.balcony' },
      locationEnvironment: { state: 'selected', catalogueId: 'location.external' },
      locationDetail: { state: 'unmapped', raw: 'Upper balcony' },
      structureBuilt: { state: 'selected', catalogueId: 'structure_built.new' },
      glassConstruction: { state: 'selected', catalogueId: 'glass_construction.toughened' },
      glassAppearance: { state: 'selected', catalogueId: 'glass_appearance.clear' },
      thickness: { state: 'selected', catalogueId: 'thickness.12mm' },
      gateRequired: { state: 'selected', catalogueId: 'gate_required.no' },
      doorOpeningType: { state: 'tbc' },
      fixingMethod: { state: 'selected', catalogueId: 'fixing_method.double-disc' },
      hardwareFinish: { state: 'selected', catalogueId: 'finish.chrome' },
      systemFinish: { state: 'tbc' },
      interlinkingRail: { state: 'selected', catalogueId: 'interlinking_rail.21x25mm' },
      deliveryScope: { state: 'selected', catalogueId: 'delivery_scope.supply-install' },
      measurements: [],
      additionalComponents: [],
      specialRequirements: [],
    })
    const confirmedAt = new Date('2026-07-16T03:30:00.000Z')

    const result = confirmProductionSpecificationDraft({
      specificationId: 'specification-1',
      workOrderItemId: 'item-1',
      draft,
      previousConfirmed: null,
      actorId: 'user-1',
      confirmedAt,
    })

    expect(result).toEqual({
      specification: {
        status: 'confirmed',
        draftData: null,
        confirmedData: draft,
        schemaVersion: 1,
        productionLabel: 'Double Disc | Ext Balcony | 12 mm Toughened Clear | Timber | Chrome | IL Rail 21 x 25 mm | Supply & Install',
        confirmedBy: 'user-1',
        confirmedAt,
        updatedAt: confirmedAt,
      },
      revision: {
        specificationId: 'specification-1',
        workOrderItemId: 'item-1',
        actorId: 'user-1',
        revisionType: 'baseline_confirmed',
        previousSnapshot: null,
        newSnapshot: draft,
        reasonCode: null,
        note: null,
        createdAt: confirmedAt,
      },
    })

    const changedDraft = {
      ...draft,
      hardwareFinish: { state: 'selected' as const, catalogueId: 'finish.matte-black' },
    }
    const changed = confirmProductionSpecificationDraft({
      specificationId: 'specification-1',
      workOrderItemId: 'item-1',
      draft: changedDraft,
      previousConfirmed: draft,
      actorId: 'user-2',
      confirmedAt: new Date('2026-07-17T03:30:00.000Z'),
    })

    expect(changed.revision).toEqual(expect.objectContaining({
      revisionType: 'draft_confirmed',
      actorId: 'user-2',
      previousSnapshot: draft,
      newSnapshot: changedDraft,
      note: 'Hardware/Fittings Finish: Chrome -> Matte Black',
    }))
  })
})
