import { describe, expect, it } from 'vitest'

import {
  mapServiceM8JobMaterialsToWorkOrderItemInputs,
  mapServiceM8JobsToWorkOrderInputs,
  normalizeServiceM8JobMaterials,
} from '../servicem8-sync'

describe('mapServiceM8JobMaterialsToWorkOrderItemInputs', () => {
  it('maps one active ServiceM8 line to its stable parent and item identities', () => {
    const rows = mapServiceM8JobMaterialsToWorkOrderItemInputs(
      [{
        uuid: 'item-1',
        active: 1,
        job_uuid: 'job-1',
        material_uuid: 'material-1',
        name: 'Frameless shower enclosure, 1200 x 2100, matte black',
        quantity: '2',
        price: '1250.50',
        sort_order: '3',
      }],
      [{ uuid: 'material-1', item_number: 'SHOWER-001' }],
    )

    expect(rows).toEqual([{
      servicem8ItemUuid: 'item-1',
      servicem8JobUuid: 'job-1',
      itemCode: 'SHOWER-001',
      quantity: '2',
      originalDescription: 'Frameless shower enclosure, 1200 x 2100, matte black',
      lineTotalExcludingGst: '2501.00',
      sortOrder: 3,
    }])
  })

  it('emits one child when ServiceM8 repeats the same item UUID', () => {
    const repeatedLine = {
      uuid: 'item-1',
      active: 1,
      job_uuid: 'job-1',
      name: 'Shower glass',
      quantity: '1',
      price: '900',
    }

    const rows = mapServiceM8JobMaterialsToWorkOrderItemInputs(
      [repeatedLine, { ...repeatedLine }],
      [],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(expect.objectContaining({
      servicem8ItemUuid: 'item-1',
      servicem8JobUuid: 'job-1',
    }))
  })
})

describe('normalizeServiceM8JobMaterials', () => {
  it('excludes ServiceM8 lines whose quantity is negative', () => {
    const result = normalizeServiceM8JobMaterials(
      [
        { uuid: 'removed-1', active: 1, job_uuid: 'job-1', name: 'Removed glass', quantity: '-1' },
        { uuid: 'reversed-2', active: 1, job_uuid: 'job-1', name: 'Reversed hardware', quantity: '-2.5' },
        { uuid: 'glass-1', active: 1, job_uuid: 'job-1', name: 'Current glass', quantity: '1' },
      ],
      [],
      [],
    )

    expect(result).toEqual({
      inputs: [expect.objectContaining({ servicem8ItemUuid: 'glass-1' })],
      excludedLineCount: 2,
    })
  })

  it('excludes configured billing lines case-insensitively and reports the excluded count', () => {
    const result = normalizeServiceM8JobMaterials(
      [
        { uuid: 'invoice-1', active: 1, job_uuid: 'job-1', name: 'Partial INVOICE claim', quantity: '1' },
        { uuid: 'deposit-1', active: 1, job_uuid: 'job-1', material_uuid: 'deposit-material', name: 'Progress payment', quantity: '1' },
        { uuid: 'glass-1', active: 1, job_uuid: 'job-1', name: 'Frameless shower glass', quantity: '1' },
      ],
      [{ uuid: 'deposit-material', item_number: 'DEPOSIT' }],
      ['invoice', 'deposit'],
    )

    expect(result).toEqual({
      inputs: [expect.objectContaining({ servicem8ItemUuid: 'glass-1' })],
      excludedLineCount: 2,
    })
  })

  it('rejects an incomplete active item line instead of silently dropping it', () => {
    expect(() => normalizeServiceM8JobMaterials(
      [{ uuid: 'item-1', active: 1, job_uuid: null, name: 'Shower glass', quantity: '1' }],
      [],
      [],
    )).toThrow('ServiceM8 item item-1 is invalid: job UUID is required.')
  })

  it('still rejects malformed quantities', () => {
    expect(() => normalizeServiceM8JobMaterials(
      [{ uuid: 'item-1', active: 1, job_uuid: 'job-1', name: 'Shower glass', quantity: 'not-a-number' }],
      [],
      [],
    )).toThrow('ServiceM8 item item-1 is invalid: quantity must be a non-negative number.')
  })
})

describe('mapServiceM8JobsToWorkOrderInputs', () => {
  it('keeps active ServiceM8 Work Order jobs after normalized status matching', () => {
    const rows = mapServiceM8JobsToWorkOrderInputs([
      {
        uuid: 'job-1',
        active: 1,
        status: ' work order ',
        generated_job_id: 'R260210',
        job_address: '1 Queen Street',
        company_uuid: 'company-1',
        job_description: 'Install shower',
        approximate_description: 'Frameless shower',
        system_name: 'Metro',
        length: '1200',
        color: 'Matte black',
        items_services: 'Glass, hinges',
        glass_status: 'Ready',
        design_status: 'Approved',
        site_condition: 'Clear',
        remarks: 'Mind the driveway',
      },
      {
        uuid: 'job-2',
        active: 1,
        status: 'Quote',
        generated_job_id: 'Q123',
        job_address: '2 King Street',
      },
      {
        uuid: 'job-3',
        active: 0,
        status: 'Work Order',
        generated_job_id: 'R260211',
        job_address: '3 Shortland Street',
      },
      {
        uuid: 'job-4',
        active: true,
        status: 'Completed',
        generated_job_id: 'R260212',
      },
    ])

    expect(rows).toEqual([
      {
        servicem8JobUuid: 'job-1',
        servicem8CompanyUuid: 'company-1',
        servicem8Status: 'work order',
        servicem8Active: true,
        jobNumber: 'R260210',
        jobAddress: '1 Queen Street',
        jobDescription: 'Install shower',
        identityKind: 'servicem8_uuid',
        identityValue: 'job-1',
        approximateDescription: 'Frameless shower',
        systemName: 'Metro',
        length: '1200',
        color: 'Matte black',
        itemsServices: 'Glass, hinges',
        glassStatus: 'Ready',
        designStatus: 'Approved',
        siteCondition: 'Clear',
        remarks: 'Mind the driveway',
        rawServiceM8Snapshot: expect.objectContaining({ uuid: 'job-1' }),
      },
    ])
  })

  it('rejects an active Work Order when its stable ServiceM8 UUID is missing', () => {
    expect(() => mapServiceM8JobsToWorkOrderInputs([
      {
        uuid: null,
        active: '1',
        status: 'WORK ORDER',
        generated_job_id: ' R260210 ',
      },
    ])).toThrow('ServiceM8 Work Order at row 1 is invalid: job UUID is required.')
  })

  it('rejects an active Work Order without a stable identity', () => {
    expect(() => mapServiceM8JobsToWorkOrderInputs([{
      active: 1,
      status: 'Work Order',
      generated_job_id: null,
    }])).toThrow('ServiceM8 Work Order at row 1 is invalid: job UUID is required.')
  })
})
