import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildProductionLabel,
  createEmptyProductionSpecification,
  INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
  type ProductionSpecification,
} from '../production-specifications'
import { generateWorkOrderProductionSpecificationDraft } from '../production-specification-enrichment'

type GoldenCase = {
  name: string
  sourceDescription: string
  values: Partial<ProductionSpecification>
  evidence: Array<{ field: string; sourceText: string }>
  expectedLabel: string
}

const previousApiKey = process.env.OPENAI_API_KEY

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-key'
})

afterAll(() => {
  process.env.OPENAI_API_KEY = previousApiKey
})

const goldenCases: GoldenCase[] = [
  {
    name: 'shower glass, five pieces',
    sourceDescription: 'Five pieces 10mm toughened clear shower glass for bathroom, 1960H, hinged, polished chrome, AS/NZS 2208:1996.',
    values: {
      system: selected('system.shower-glass'),
      locationDetail: selected('location_detail.bathroom'),
      glassConstruction: selected('glass_construction.toughened'),
      glassAppearance: selected('glass_appearance.clear'),
      thickness: selected('thickness.10mm'),
      doorOpeningType: selected('door_opening_type.hinged'),
      hardwareFinish: selected('finish.chrome'),
      measurements: [otherMeasurement('5 pcs'), otherMeasurement('1960H')],
    },
    evidence: [
      evidence('system', 'shower glass'),
      evidence('locationDetail', 'bathroom'),
      evidence('glassConstruction', 'toughened'),
      evidence('glassAppearance', 'clear'),
      evidence('thickness', '10mm'),
      evidence('doorOpeningType', 'hinged'),
      evidence('hardwareFinish', 'polished chrome'),
      evidence('measurements', 'Five pieces'),
    ],
    expectedLabel: 'Shower Glass | Location TBC - Bathroom | 5 pcs | 1960H | 10 mm Toughened Clear | Hinged | Chrome',
  },
  {
    name: 'round stainless rail',
    sourceDescription: 'Internal stair area round stainless rail, 22m, 50.8mm diameter, chrome, supply and install.',
    values: {
      system: selected('system.round-ss-rail'),
      locationEnvironment: selected('location.internal'),
      structureType: selected('structure_type.stair'),
      hardwareFinish: selected('finish.chrome'),
      deliveryScope: selected('delivery_scope.supply-install'),
      measurements: [measurement('length', '22', 'm'), measurement('diameter', '50.8', 'mm')],
    },
    evidence: [
      evidence('system', 'round stainless rail'),
      evidence('locationEnvironment', 'Internal'),
      evidence('structureType', 'stair area'),
      evidence('hardwareFinish', 'chrome'),
      evidence('deliveryScope', 'supply and install'),
      evidence('measurements', '22m'),
    ],
    expectedLabel: 'Round SS Rail | Int Stair Area | 22 m | 50.8 mm | Chrome | Supply & Install',
  },
  {
    name: 'Double Disc balustrade',
    sourceDescription: 'External balcony Double Disc balustrade, 14.9m x 1.0m, 12mm toughened clear, timber, 21x25 interlinking rail, chrome and 316 stainless.',
    values: {
      system: selected('system.double-disc-balustrade'),
      locationEnvironment: selected('location.external'),
      structureType: selected('structure_type.balcony'),
      structureMaterial: selected('structure_material.timber'),
      glassConstruction: selected('glass_construction.toughened'),
      glassAppearance: selected('glass_appearance.clear'),
      thickness: selected('thickness.12mm'),
      hardwareFinish: selected('finish.chrome'),
      systemFinish: selected('system_finish.316-ss'),
      interlinkingRail: selected('interlinking_rail.21x25mm'),
      measurements: [otherMeasurement('14.9 m x 1.0 m')],
    },
    evidence: [
      evidence('system', 'Double Disc balustrade'),
      evidence('locationEnvironment', 'External'),
      evidence('structureType', 'balcony'),
      evidence('structureMaterial', 'timber'),
      evidence('glassConstruction', 'toughened'),
      evidence('glassAppearance', 'clear'),
      evidence('thickness', '12mm'),
      evidence('hardwareFinish', 'chrome'),
      evidence('systemFinish', '316 stainless'),
      evidence('interlinkingRail', '21x25 interlinking rail'),
      evidence('measurements', '14.9m x 1.0m'),
    ],
    expectedLabel: 'Double Disc Balustrade | Ext Balcony | 14.9 m x 1.0 m | 12 mm Toughened Clear | Timber | Chrome/316 SS | IL Rail 21 x 25 mm',
  },
  {
    name: 'EdgeTec PosiGlaze pool fence',
    sourceDescription: 'EdgeTec PosiGlaze pool fence, pool area, 16.5m x 1200H, 12mm toughened clear, timber top mount, one gate, black hardware, Ironsand channel.',
    values: {
      system: selected('system.edgetec-posiglaze-pool-fence'),
      locationDetail: selected('location_detail.pool-area'),
      glassConstruction: selected('glass_construction.toughened'),
      glassAppearance: selected('glass_appearance.clear'),
      thickness: selected('thickness.12mm'),
      fixingMethod: selected('fixing_method.timber-top-mount'),
      hardwareFinish: selected('finish.black'),
      systemFinish: selected('system_finish.ironsand'),
      gateRequired: selected('gate_required.one'),
      measurements: [otherMeasurement('16.5 m x 1200H')],
    },
    evidence: [
      evidence('system', 'EdgeTec PosiGlaze pool fence'),
      evidence('locationDetail', 'pool area'),
      evidence('glassConstruction', 'toughened'),
      evidence('glassAppearance', 'clear'),
      evidence('thickness', '12mm'),
      evidence('fixingMethod', 'timber top mount'),
      evidence('hardwareFinish', 'black hardware'),
      evidence('systemFinish', 'Ironsand channel'),
      evidence('gateRequired', 'one gate'),
      evidence('measurements', '16.5m x 1200H'),
    ],
    expectedLabel: 'EdgeTec PosiGlaze Pool Fence | Location TBC - Pool Area | 16.5 m x 1200H | 12 mm Toughened Clear | Timber Top-Mount | Black/Ironsand | 1 Gate',
  },
  {
    name: 'supply-only handrail brackets',
    sourceDescription: 'Seven chrome handrail brackets for internal stair area, supply only: one glass mount, two hollow and four standard.',
    values: {
      system: selected('system.handrail-brackets'),
      locationEnvironment: selected('location.internal'),
      structureType: selected('structure_type.stair'),
      hardwareFinish: selected('finish.chrome'),
      deliveryScope: selected('delivery_scope.supply-only'),
      measurements: [otherMeasurement('7 pcs')],
    },
    evidence: [
      evidence('system', 'handrail brackets'),
      evidence('locationEnvironment', 'internal'),
      evidence('structureType', 'stair area'),
      evidence('hardwareFinish', 'chrome'),
      evidence('deliveryScope', 'supply only'),
      evidence('measurements', 'Seven'),
    ],
    expectedLabel: 'Handrail Brackets | Int Stair Area | 7 pcs | Chrome | Supply Only',
  },
  {
    name: 'pool-fence variation',
    sourceDescription: 'Pool fence variation for two boundary panels with custom anti-toe-hold design at 1200H.',
    values: {
      system: selected('system.pool-fence-variation'),
      fixingMethod: selected('fixing_method.custom-anti-toe-hold'),
      measurements: [otherMeasurement('Boundary Panels'), otherMeasurement('1200H')],
    },
    evidence: [
      evidence('system', 'Pool fence variation'),
      evidence('fixingMethod', 'custom anti-toe-hold design'),
      evidence('measurements', 'two boundary panels'),
    ],
    expectedLabel: 'Pool Fence Variation | Location TBC | Boundary Panels | 1200H | Custom Anti-Toe-Hold Design',
  },
  {
    name: 'hinged shower over bathtub',
    sourceDescription: 'One set shower glass over bathtub, bathroom, 800W x 1380H, 10mm toughened clear, hinged and fixed panel, brushed nickel.',
    values: {
      system: selected('system.shower-glass'),
      locationDetail: selected('location_detail.bathroom'),
      glassConstruction: selected('glass_construction.toughened'),
      glassAppearance: selected('glass_appearance.clear'),
      thickness: selected('thickness.10mm'),
      doorOpeningType: selected('door_opening_type.hinged-fixed-panel'),
      hardwareFinish: selected('finish.brushed-nickel'),
      measurements: [otherMeasurement('1 Set'), otherMeasurement('800W x 1380H')],
    },
    evidence: [
      evidence('system', 'shower glass'),
      evidence('locationDetail', 'bathroom'),
      evidence('glassConstruction', 'toughened'),
      evidence('glassAppearance', 'clear'),
      evidence('thickness', '10mm'),
      evidence('doorOpeningType', 'hinged and fixed panel'),
      evidence('hardwareFinish', 'brushed nickel'),
      evidence('measurements', 'One set'),
    ],
    expectedLabel: 'Shower Glass | Location TBC - Bathroom | 1 Set | 800W x 1380H | 10 mm Toughened Clear | Hinged + Fixed Panel | Brushed Nickel',
  },
  {
    name: 'multi-screen shower item',
    sourceDescription: 'Four sets 10mm toughened clear shower screens: two single, one corner and one diamond, chrome, installation included.',
    values: {
      system: selected('system.shower-screens'),
      glassConstruction: selected('glass_construction.toughened'),
      glassAppearance: selected('glass_appearance.clear'),
      thickness: selected('thickness.10mm'),
      doorOpeningType: selected('door_opening_type.multi-screen'),
      hardwareFinish: selected('finish.chrome'),
      deliveryScope: selected('delivery_scope.install-included'),
      measurements: [otherMeasurement('4 Sets')],
    },
    evidence: [
      evidence('system', 'shower screens'),
      evidence('glassConstruction', 'toughened'),
      evidence('glassAppearance', 'clear'),
      evidence('thickness', '10mm'),
      evidence('doorOpeningType', 'two single, one corner and one diamond'),
      evidence('hardwareFinish', 'chrome'),
      evidence('deliveryScope', 'installation included'),
      evidence('measurements', 'Four sets'),
    ],
    expectedLabel: 'Shower Screens | Location TBC | 4 Sets | 10 mm Toughened Clear | 2 Single + Corner + Diamond | Chrome | Install Included',
  },
]

describe('Production Specification golden corpus', () => {
  it.each(goldenCases)('$name preserves approved meaning through the provider boundary', async ({
    sourceDescription,
    values,
    evidence: sourceEvidence,
    expectedLabel,
  }) => {
    let providerInput: unknown
    const request = vi.fn(async (
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      providerInput = body.input
      return Response.json({
        output_text: JSON.stringify({
          schemaVersion: 1,
          specification: { ...createEmptyProductionSpecification(), ...values },
          evidence: sourceEvidence,
          ambiguityFlags: [],
        }),
      })
    })

    const result = await generateWorkOrderProductionSpecificationDraft(
      sourceDescription,
      request,
      async () => [...INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE],
    )

    expect({
      providerInput,
      productionLabel: buildProductionLabel(result.specification),
    }).toEqual({
      providerInput: sourceDescription,
      productionLabel: expectedLabel,
    })
  })
})

function evidence(field: string, sourceText: string) {
  return { field, sourceText }
}

function selected(catalogueId: string) {
  return { state: 'selected' as const, catalogueId }
}

function measurement(kind: 'length' | 'diameter', value: string, unit: 'm' | 'mm') {
  return { kind, value, unit }
}

function otherMeasurement(value: string) {
  return { kind: 'other' as const, value, unit: 'other' as const }
}
