import { describe, expect, it, vi } from 'vitest'
import { buildJobProgressSnapshot, readAllServiceM8Rows } from '../registry'
import type { ServiceM8FetchRequest } from '@/lib/servicem8/client'

function response(rows: unknown, next: string | null = null, status = 200) {
  return {
    ok: status === 200,
    status,
    headers: { get: (name: string) => name === 'x-next-cursor' ? next : null },
    json: async () => rows,
  }
}

function requestFor(pages: Record<string, ReturnType<typeof response>>): ServiceM8FetchRequest {
  return vi.fn(async (path: string) => {
    const page = pages[path]
    if (!page) throw new Error(`Unexpected request: ${path}`)
    return page
  })
}

describe('job progress ServiceM8 inventory', () => {
  const activityPath = `/jobactivity.json?$filter=${encodeURIComponent("start_date gt '2026-10-23 00:00:00' and active eq 1")}`
  const materialPath = `/jobmaterial.json?$filter=${encodeURIComponent('active eq 1')}`
  it('reads every cursor page and matches the nearest future staff booking by job UUID', async () => {
    const request = requestFor({
      '/job.json?cursor=-1': response([
        { uuid: 'job-a', generated_job_id: 'R100', status: 'Quote', active: 1, company_uuid: 'company-a', job_address: 'A St', total_invoice_amount: '0', edit_date: '2026-10-22 10:00:00' },
      ], 'page-2'),
      '/job.json?cursor=page-2': response([
        { uuid: 'job-b', generated_job_id: 'R101', status: 'Work Order', active: 1, company_uuid: 'company-b', job_address: 'B St', total_invoice_amount: '150.00', edit_date: '2026-10-21 10:00:00' },
        { uuid: 'job-c', generated_job_id: 'R099', status: 'Quote', active: 1, edit_date: '2026-08-01 10:00:00' },
      ]),
      '/company.json?cursor=-1': response([{ uuid: 'company-a', name: 'Customer A' }, { uuid: 'company-b', name: 'Customer B' }]),
      '/staff.json?cursor=-1': response([{ uuid: 'staff-a', first: 'Alex', last: 'Smith' }]),
      [`${materialPath}&cursor=-1`]: response([{ job_uuid: 'job-a', price: '100', quantity: '2', active: 1 }]),
      [`${activityPath}&cursor=-1`]: response([
        { uuid: 'past', job_uuid: 'job-a', staff_uuid: 'staff-a', start_date: '2026-10-22 09:00:00', active: 1, activity_was_scheduled: '1' },
        { uuid: 'later', job_uuid: 'job-b', staff_uuid: 'staff-a', start_date: '2026-10-27 11:00:00', active: 1, activity_was_scheduled: '1' },
      ], 'schedule-2'),
      [`${activityPath}&cursor=schedule-2`]: response([
        { uuid: 'sooner', job_uuid: 'job-b', staff_uuid: 'staff-a', start_date: '2026-10-26 09:00:00', active: 1, activity_was_scheduled: '1' },
        { uuid: 'deleted', job_uuid: 'job-a', staff_uuid: 'staff-a', start_date: '2026-10-26 09:00:00', active: 0, activity_was_scheduled: '1' },
      ]),
    })
    const snapshot = await buildJobProgressSnapshot(request, new Date('2026-10-23T00:00:00Z'))
    expect(snapshot.rows).toHaveLength(3)
    expect(snapshot.rows.find((row) => row.jobNumber === 'R100')).toMatchObject({
      customer: 'Customer A', recordedAmount: 230, amountSource: 'line items', nextBooking: null, reviewCandidate: true,
    })
    expect(snapshot.rows.find((row) => row.jobNumber === 'R101')).toMatchObject({
      customer: 'Customer B', recordedAmount: 150, amountSource: 'invoice', reviewCandidate: false,
      nextBooking: { start: '2026-10-26 09:00:00', staff: 'Alex Smith' },
    })
    expect(snapshot.rows.find((row) => row.jobNumber === 'R099')?.reviewCandidate).toBe(true)
    expect(snapshot.missingValue).toBe(1)
  })

  it('rejects incomplete schedule pagination instead of claiming no booking', async () => {
    const request = requestFor({
      '/job.json?cursor=-1': response([{ uuid: 'job-a', generated_job_id: 'R100' }]),
      '/company.json?cursor=-1': response([]),
      '/staff.json?cursor=-1': response([]),
      [`${materialPath}&cursor=-1`]: response([]),
      [`${activityPath}&cursor=-1`]: response([], 'page-2'),
      [`${activityPath}&cursor=page-2`]: response([], null, 403),
    })
    await expect(buildJobProgressSnapshot(request, new Date('2026-10-23T00:00:00Z'))).rejects.toThrow('HTTP 403')
  })

  it('rejects repeated cursors and keeps distinct jobs that share a number', async () => {
    const repeated = requestFor({ '/job.json?cursor=-1': response([], '-1') })
    await expect(readAllServiceM8Rows('/job.json', repeated)).rejects.toThrow('pagination did not complete')

    const duplicates = requestFor({
      '/job.json?cursor=-1': response([
        { uuid: 'a', generated_job_id: 'R100', active: 0 }, { uuid: 'b', generated_job_id: 'R100', active: 0 },
      ]),
      '/company.json?cursor=-1': response([]),
      '/staff.json?cursor=-1': response([]),
      [`${materialPath}&cursor=-1`]: response([]),
      [`${activityPath}&cursor=-1`]: response([]),
    })
    const snapshot = await buildJobProgressSnapshot(duplicates, new Date('2026-10-23T00:00:00Z'))
    expect(snapshot.rows).toHaveLength(2)
    expect(snapshot.duplicateNumberJobs).toBe(2)
    expect(snapshot.rows.every((row) => row.duplicateNumber && !row.reviewCandidate)).toBe(true)
  })
})
