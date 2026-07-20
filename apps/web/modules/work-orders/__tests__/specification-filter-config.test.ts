import { describe, expect, it } from 'vitest'

import { PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS } from '../production-specifications'
import {
  normalizeWorkOrderSpecificationFilterConfig,
  serializeWorkOrderSpecificationFilterConfig,
} from '../specification-filter-config'

describe('Work Order Production Specification filter configuration', () => {
  it('retains every enabled field in global order without a fixed count limit', () => {
    const saved = [...PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS]
      .reverse()
      .map(({ field }, index) => ({ field, enabled: true, order: index + 1 }))

    const normalized = normalizeWorkOrderSpecificationFilterConfig(JSON.stringify(saved))

    expect(normalized.filter((field) => field.enabled)).toHaveLength(PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS.length)
    expect(normalized.map((field) => field.field)).toEqual(saved.map((field) => field.field))
    expect(normalizeWorkOrderSpecificationFilterConfig(
      serializeWorkOrderSpecificationFilterConfig(normalized),
    )).toEqual(normalized)
  })

  it('ignores unknown fields and appends newly supported fields as disabled', () => {
    const normalized = normalizeWorkOrderSpecificationFilterConfig(JSON.stringify([
      { field: 'hardwareFinish', enabled: true, order: 1 },
      { field: 'providerSecret', enabled: true, order: 2 },
    ]))

    expect(normalized[0]).toMatchObject({ field: 'hardwareFinish', enabled: true, order: 1 })
    expect(normalized.map((field) => String(field.field))).not.toContain('providerSecret')
    expect(normalized).toHaveLength(PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS.length)
    expect(normalized.slice(1).every((field) => field.enabled === false)).toBe(true)
  })
})
