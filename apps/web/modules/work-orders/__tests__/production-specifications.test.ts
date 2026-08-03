import { describe, expect, it } from 'vitest'

import {
  buildProductionLabel,
  confirmProductionSpecificationDraft,
  createEmptyProductionSpecification,
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
      'Shower Glass | Int Bathroom\n10 mm Toughened Frosted | Hinged | Chrome | Supply & Install',
    )
  })

  it('builds the production label from dropdowns only when historical repeatables remain stored', () => {
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
      'Double Disc | Ext Balcony\n12 mm Toughened Clear | Timber | Chrome | IL Rail 21 x 25 mm | Supply & Install',
    )
    expect(buildProductionLabel(specification)).not.toContain('14.9 m')
    expect(buildProductionLabel(specification)).not.toContain('AS/NZS')
  })

  it('promotes a fully resolved draft while omitting Not Applicable values from its label', () => {
    const draft = parseProductionSpecification({
      schemaVersion: 1,
      system: { state: 'selected', catalogueId: 'system.double-disc' },
      structureMaterial: { state: 'selected', catalogueId: 'structure_material.timber' },
      structureType: { state: 'selected', catalogueId: 'structure_type.balcony' },
      locationEnvironment: { state: 'selected', catalogueId: 'location.external' },
      locationDetail: { state: 'not_applicable' },
      structureBuilt: { state: 'selected', catalogueId: 'structure_built.new' },
      glassConstruction: { state: 'selected', catalogueId: 'glass_construction.toughened' },
      glassAppearance: { state: 'selected', catalogueId: 'glass_appearance.clear' },
      thickness: { state: 'selected', catalogueId: 'thickness.12mm' },
      gateRequired: { state: 'selected', catalogueId: 'gate_required.no' },
      doorOpeningType: { state: 'not_applicable' },
      fixingMethod: { state: 'selected', catalogueId: 'fixing_method.double-disc' },
      hardwareFinish: { state: 'selected', catalogueId: 'finish.chrome' },
      systemFinish: { state: 'not_applicable' },
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
      existingItemLabel: 'Existing item label',
      actorId: 'user-1',
      confirmedAt,
    })

    expect(result).toEqual({
      specification: {
        status: 'confirmed',
        draftData: null,
        confirmedData: draft,
        schemaVersion: 1,
        productionLabel: 'Double Disc | Ext Balcony\n12 mm Toughened Clear | Timber | Chrome | IL Rail 21 x 25 mm | Supply & Install',
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
        changes: [],
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
      existingItemLabel: 'Existing item label',
      actorId: 'user-2',
      confirmedAt: new Date('2026-07-17T03:30:00.000Z'),
      changeReason: {
        code: 'client_request',
        note: 'Client approved the Matte Black finish.',
      },
    })

    expect(changed.revision).toEqual(expect.objectContaining({
      revisionType: 'draft_confirmed',
      actorId: 'user-2',
      previousSnapshot: draft,
      newSnapshot: changedDraft,
      reasonCode: 'client_request',
      note: 'Client approved the Matte Black finish.',
      changes: [{
        identity: 'hardwareFinish',
        kind: 'field',
        previousValue: { state: 'selected', catalogueId: 'finish.chrome' },
        newValue: { state: 'selected', catalogueId: 'finish.matte-black' },
      }],
    }))
  })

  it('requires an approved reason for every later confirmed change and explanation for Other', () => {
    const confirmed = parseProductionSpecification(confirmedSpecificationInput())
    const changed = {
      ...confirmed,
      hardwareFinish: { state: 'selected' as const, catalogueId: 'finish.matte-black' },
    }
    const transition = {
      specificationId: 'specification-1',
      workOrderItemId: 'item-1',
      draft: changed,
      previousConfirmed: confirmed,
      existingItemLabel: 'Existing item label',
      actorId: 'user-1',
      confirmedAt: new Date('2026-07-17T03:30:00.000Z'),
    }

    expect(() => confirmProductionSpecificationDraft(transition)).toThrow(
      'Choose an approved change reason before confirming this revision.',
    )
    expect(() => confirmProductionSpecificationDraft({
      ...transition,
      changeReason: { code: 'other' },
    })).toThrow('Explain the Other change reason before confirming this revision.')
    expect(() => confirmProductionSpecificationDraft({
      ...transition,
      changeReason: { code: 'not-approved' as 'other' },
    })).toThrow('Choose an approved change reason before confirming this revision.')
  })

  it('allows an all-TBC confirmation while preserving the existing item label', () => {
    const draft = createEmptyProductionSpecification()
    const transition = unresolvedTransition(draft, 'Existing shower glass label')

    const result = confirmProductionSpecificationDraft(transition)

    expect(result.specification).toMatchObject({
      status: 'confirmed',
      confirmedData: { systemFinish: { state: 'tbc' } },
      productionLabel: 'Existing shower glass label',
    })
  })

  it('blocks confirmation while any dropdown remains Unmapped', () => {
    const resolved = parseProductionSpecification(confirmedSpecificationInput())

    expect(() => confirmProductionSpecificationDraft(unresolvedTransition({
      ...resolved,
      systemFinish: { state: 'unmapped', raw: 'Custom bronze' },
    }))).toThrow('Resolve all Unmapped values before confirming this specification.')
  })
})

function unresolvedTransition(
  draft: ReturnType<typeof createEmptyProductionSpecification>,
  existingItemLabel = 'Existing item label',
) {
  return {
    specificationId: 'specification-unresolved',
    workOrderItemId: 'item-unresolved',
    draft,
    previousConfirmed: null,
    existingItemLabel,
    actorId: 'user-1',
    confirmedAt: new Date('2026-07-17T03:30:00.000Z'),
  }
}

function confirmedSpecificationInput() {
  return {
    schemaVersion: 1,
    system: { state: 'selected', catalogueId: 'system.double-disc' },
    structureMaterial: { state: 'selected', catalogueId: 'structure_material.timber' },
    structureType: { state: 'selected', catalogueId: 'structure_type.balcony' },
    locationEnvironment: { state: 'selected', catalogueId: 'location.external' },
    locationDetail: { state: 'not_applicable' },
    structureBuilt: { state: 'selected', catalogueId: 'structure_built.new' },
    glassConstruction: { state: 'selected', catalogueId: 'glass_construction.toughened' },
    glassAppearance: { state: 'selected', catalogueId: 'glass_appearance.clear' },
    thickness: { state: 'selected', catalogueId: 'thickness.12mm' },
    gateRequired: { state: 'selected', catalogueId: 'gate_required.no' },
    doorOpeningType: { state: 'not_applicable' },
    fixingMethod: { state: 'selected', catalogueId: 'fixing_method.double-disc' },
    hardwareFinish: { state: 'selected', catalogueId: 'finish.chrome' },
    systemFinish: { state: 'not_applicable' },
    interlinkingRail: { state: 'selected', catalogueId: 'interlinking_rail.21x25mm' },
    deliveryScope: { state: 'selected', catalogueId: 'delivery_scope.supply-install' },
    measurements: [],
    additionalComponents: [],
    specialRequirements: [],
  }
}
