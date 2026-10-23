import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'

test('status callback rejects unauthorized and malformed input, and safely ignores an untracked job', async ({ request }) => {
  const body = { type: 'job.status_changed', data: { uuid: randomUUID(), status: 'Work Order' } }
  const unauthorized = await request.post('/api/servicem8/job', { data: body })
  expect(unauthorized.status()).toBe(401)
  const secret = process.env.SERVICEM8_JOB_WEBHOOK_SECRET
  expect(secret, 'controlled local webhook secret must be configured').toBeTruthy()
  const headers = { 'x-servicem8-webhook-secret': secret! }
  const malformed = await request.post('/api/servicem8/job', { headers, data: { ...body, data: { uuid: '../job' } } })
  expect(malformed.status()).toBe(422)
  const untracked = await request.post('/api/servicem8/job', { headers, data: body })
  expect(untracked.status()).toBe(200)
  expect(await untracked.json()).toEqual({ ok: true, processed: 0 })
})
