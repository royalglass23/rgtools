import { describe, expect, it } from 'vitest'
import { parseWorkOrderListFilters } from '../list-filters'

describe('parseWorkOrderListFilters', () => {
  it('pages the grouped dashboard by five parent Work Orders by default', () => {
    expect(parseWorkOrderListFilters({}).size).toBe(5)
    expect(parseWorkOrderListFilters({ size: '5' }).size).toBe(5)
    expect(parseWorkOrderListFilters({ size: '50' }).size).toBe(50)
    expect(parseWorkOrderListFilters({ size: '100' }).size).toBe(5)
  })

  it('supports prefixed dashboard params and admin defaults', () => {
    expect(parseWorkOrderListFilters(
      {
        wo_q: '  smith  ',
        wo_current: 'all',
        wo_risk: 'high',
        wo_page: '2',
      },
      {
        prefix: 'wo_',
        defaults: {
          importance: 'medium',
          sort: 'install_date_asc',
          size: '20',
        },
      },
    )).toMatchObject({
      q: 'smith',
      current: 'all',
      risk: 'high',
      importance: 'medium',
      sort: 'install_date_asc',
      page: 2,
      size: 20,
    })
  })

  it('normalizes legacy sort params to explicit directions', () => {
    expect(parseWorkOrderListFilters({ sort: 'lead_score' }).sort).toBe('lead_score_desc')
    expect(parseWorkOrderListFilters({ sort: 'importance' }).sort).toBe('importance_desc')
    expect(parseWorkOrderListFilters({ sort: 'risk' }).sort).toBe('risk_desc')
    expect(parseWorkOrderListFilters({ sort: 'install_date' }).sort).toBe('install_date_asc')
    expect(parseWorkOrderListFilters({ sort: 'job_number' }).sort).toBe('job_number_asc')
  })

  it('shows removed items only when the dashboard option is explicitly enabled', () => {
    expect(parseWorkOrderListFilters({}).showRemovedItems).toBe(false)
    expect(parseWorkOrderListFilters({ showRemovedItems: '1' }).showRemovedItems).toBe(true)
    expect(parseWorkOrderListFilters({ showRemovedItems: 'false' }).showRemovedItems).toBe(false)
  })

  it('parses canonical Production Specification option IDs by supported field', () => {
    expect(parseWorkOrderListFilters({
      spec_hardwareFinish: 'hardware_finish.matte-black',
      spec_unknownField: 'ignored.option',
    }).specification).toEqual({
      hardwareFinish: 'hardware_finish.matte-black',
    })

    expect(parseWorkOrderListFilters({
      wo_spec_glassConstruction: 'glass_construction.laminated',
    }, { prefix: 'wo_' }).specification).toEqual({
      glassConstruction: 'glass_construction.laminated',
    })
  })

  it('ignores stale filter params for globally disabled specification fields', () => {
    expect(parseWorkOrderListFilters({
      spec_hardwareFinish: 'hardware_finish.matte-black',
      spec_glassConstruction: 'glass_construction.laminated',
    }, {
      specificationFields: ['hardwareFinish'],
    }).specification).toEqual({
      hardwareFinish: 'hardware_finish.matte-black',
    })
  })
})
