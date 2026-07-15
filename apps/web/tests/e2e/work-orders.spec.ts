import { createServer, type Server } from 'node:http'
import { hash } from 'bcryptjs'
import { neon } from '@neondatabase/serverless'
import { expect, test, type Download, type Page } from '@playwright/test'
import {
  createWorkOrderAcceptanceCredentials,
  verifyWorkOrderAcceptanceDatabase,
} from './work-order-acceptance-safety'

const isolatedDatabaseUrl = process.env.E2E_DATABASE_URL
const expectedDatabaseSentinel = process.env.E2E_DATABASE_SENTINEL
const adapterPort = Number(process.env.E2E_ADAPTER_PORT ?? 32199)
const runId = crypto.randomUUID()
const { username, password } = createWorkOrderAcceptanceCredentials()
const userId = crypto.randomUUID()
const primaryClientId = crypto.randomUUID()
const secondaryClientId = crypto.randomUUID()
const primaryLeadId = crypto.randomUUID()
const secondaryLeadId = crypto.randomUUID()
const primaryJobUuid = `mt199-primary-${runId}`
const secondaryJobUuid = `mt199-secondary-${runId}`
const primaryJobNumber = `MT199-${runId.slice(0, 8)}`
const secondaryJobNumber = `MT199-${runId.slice(9, 17)}`
const primaryItemUuids = [`mt199-item-a-${runId}`, `mt199-item-b-${runId}`]
const secondaryItemUuid = `mt199-item-c-${runId}`
const workOrderModules = [
  { slug: 'work-orders', name: 'Work Orders', adminOnly: false },
  { slug: 'work-orders/manage', name: 'Work Orders Manage', adminOnly: false },
  { slug: 'admin/work-orders', name: 'Work Order Configuration', adminOnly: true },
]
let primaryJobIsCurrent = true
let adapterServer: Server | null = null
let databaseVerified = false
let previousSummaryConfig: {
  value: string
  updatedBy: string | null
  updatedAt: string
} | null = null
let previousModuleStates: Array<{
  slug: string
  name: string
  adminOnly: boolean
  isActive: boolean
}> = []
const createdRefreshRunIds = new Set<string>()
const knownRefreshRunIds = new Set<string>()

test.describe('MT-199 Work Order Items release acceptance', () => {
  test.skip(!isolatedDatabaseUrl, 'Set a dedicated E2E_DATABASE_URL to run the mutating Work Orders acceptance journey.')
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    if (!isolatedDatabaseUrl) return
    const sql = neon(isolatedDatabaseUrl)
    await verifyWorkOrderAcceptanceDatabase({
      expectedSentinel: expectedDatabaseSentinel,
      readProof: async () => {
        const [proof] = await sql`
          SELECT
            current_database() AS "databaseName",
            current_setting('rgtools.e2e_database_sentinel', true) AS sentinel
        ` as Array<{ databaseName: string; sentinel: string | null }>

        return proof ?? { databaseName: 'unknown', sentinel: null }
      },
    })
    databaseVerified = true
    const existingRefreshRuns = await sql`SELECT id FROM work_order_refresh_runs` as Array<{ id: string }>
    for (const refreshRun of existingRefreshRuns) knownRefreshRunIds.add(refreshRun.id)

    const existingSettings = await sql`
      SELECT value, updated_by AS "updatedBy", updated_at AS "updatedAt"
      FROM settings WHERE key = 'work_orders.summary_fields' LIMIT 1
    ` as Array<NonNullable<typeof previousSummaryConfig>>
    previousSummaryConfig = existingSettings[0] ?? null
    previousModuleStates = await sql`
      SELECT slug, name, admin_only AS "adminOnly", is_active AS "isActive"
      FROM modules
      WHERE slug IN ('work-orders', 'work-orders/manage', 'admin/work-orders')
    ` as typeof previousModuleStates

    await sql`
      INSERT INTO users (id, username, password_hash, role, is_protected)
      VALUES (${userId}::uuid, ${username}, ${await hash(password, 12)}, 'admin', true)
    `
    for (const workOrderModule of workOrderModules) {
      await sql`
        INSERT INTO modules (slug, name, admin_only, is_active)
        VALUES (${workOrderModule.slug}, ${workOrderModule.name}, ${workOrderModule.adminOnly}, true)
        ON CONFLICT (slug) DO UPDATE SET is_active = true
      `
    }
    await sql`
      INSERT INTO clients (id, name, company_name)
      VALUES
        (${primaryClientId}::uuid, 'MT199 Primary Client', 'Primary Glass Ltd'),
        (${secondaryClientId}::uuid, 'MT199 Secondary Client', 'Secondary Glass Ltd')
    `
    await sql`
      INSERT INTO leads (id, client_id, channel, servicem8_job_uuid, servicem8_job_number, seed_score)
      VALUES
        (${primaryLeadId}::uuid, ${primaryClientId}::uuid, 'other', ${primaryJobUuid}, ${primaryJobNumber}, 91),
        (${secondaryLeadId}::uuid, ${secondaryClientId}::uuid, 'other', ${secondaryJobUuid}, ${secondaryJobNumber}, 40)
    `
    await sql`
      INSERT INTO settings (key, value, updated_by)
      VALUES ('work_orders.summary_fields', ${JSON.stringify([
        { id: 'jobNumber', visible: true, filterable: false, editable: false, order: 1 },
        { id: 'client', visible: true, filterable: false, editable: false, order: 2 },
        { id: 'jobAddress', visible: true, filterable: false, editable: false, order: 3 },
        { id: 'leadScore', visible: true, filterable: false, editable: false, order: 4 },
        { id: 'item', visible: true, filterable: false, editable: true, order: 5 },
        { id: 'risk', visible: true, filterable: true, editable: true, order: 6 },
      ])}, ${userId}::uuid)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by
    `

    adapterServer = createControlledAdapterServer()
    await new Promise<void>((resolve, reject) => {
      adapterServer?.once('error', reject)
      adapterServer?.listen(adapterPort, '127.0.0.1', resolve)
    })
  })

  test.afterAll(async () => {
    if (adapterServer) {
      await new Promise<void>((resolve, reject) => adapterServer?.close((error) => error ? reject(error) : resolve()))
    }
    if (!isolatedDatabaseUrl || !databaseVerified) return
    const sql = neon(isolatedDatabaseUrl)
    await sql`DELETE FROM work_orders WHERE identity_value IN (${primaryJobUuid}, ${secondaryJobUuid})`
    await sql`DELETE FROM leads WHERE id IN (${primaryLeadId}::uuid, ${secondaryLeadId}::uuid)`
    await sql`DELETE FROM clients WHERE id IN (${primaryClientId}::uuid, ${secondaryClientId}::uuid)`
    for (const refreshRunId of createdRefreshRunIds) {
      await sql`DELETE FROM work_order_refresh_runs WHERE id = ${refreshRunId}::uuid`
    }
    if (previousSummaryConfig === null) {
      await sql`DELETE FROM settings WHERE key = 'work_orders.summary_fields'`
    } else {
      await sql`
        UPDATE settings
        SET
          value = ${previousSummaryConfig.value},
          updated_by = ${previousSummaryConfig.updatedBy}::uuid,
          updated_at = ${previousSummaryConfig.updatedAt}
        WHERE key = 'work_orders.summary_fields'
      `
    }
    for (const workOrderModule of workOrderModules) {
      const previous = previousModuleStates.find((moduleState) => moduleState.slug === workOrderModule.slug)
      if (!previous) {
        await sql`DELETE FROM modules WHERE slug = ${workOrderModule.slug}`
        continue
      }

      await sql`
        UPDATE modules
        SET name = ${previous.name}, admin_only = ${previous.adminOnly}, is_active = ${previous.isActive}
        WHERE slug = ${previous.slug}
      `
    }
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
  })

  test('refreshes, edits, filters, exports, removes and restores a multi-item job', async ({ page }) => {
    await login(page)
    await page.goto('/work-orders')
    await refreshWorkOrders(page)

    const primaryGroup = page.getByRole('group', { name: `Work Order ${primaryJobNumber}` })
    const secondaryGroup = page.getByRole('group', { name: `Work Order ${secondaryJobNumber}` })
    await expect(primaryGroup).toBeVisible()
    await expect(secondaryGroup).toBeVisible()
    const jobGroups = page.locator('section[aria-label^="Work Order MT199-"]')
    await expect(jobGroups.nth(0)).toHaveAttribute('aria-label', `Work Order ${primaryJobNumber}`)

    const primaryRows = primaryGroup.getByRole('row')
    await expect(primaryRows).toHaveCount(2)
    const firstItem = primaryRows.filter({ hasText: 'SHOWER-001' })
    await expect(firstItem).toContainText('Qty 2')
    await expect(firstItem).toContainText('SHOWER-001')
    await expect(firstItem.getByLabel('Short label for SHOWER-001')).toHaveValue('Frameless shower screen, 1200 x 2100, matte black')
    await expect(firstItem).toHaveAttribute('title', /Supply and install frameless shower screen[\s\S]*Line total excluding GST: \$2501\.00/)

    const manualLabel = 'Manual MT199 shower label'
    await firstItem.getByLabel('Short label for SHOWER-001').fill(manualLabel)
    await firstItem.getByRole('button', { name: 'Save label' }).click()
    await expect(firstItem.getByText('Saved')).toBeVisible()
    await firstItem.getByLabel('Risk for SHOWER-001').selectOption('high')
    await expect(firstItem.getByText('Saved')).toHaveCount(2)

    await page.reload()
    await expect(primaryGroup.getByLabel('Short label for SHOWER-001')).toHaveValue(manualLabel)
    await expect(primaryGroup.getByLabel('Risk for SHOWER-001')).toHaveValue('high')

    await primaryGroup.getByRole('link', { name: primaryJobNumber }).click()
    await expect(page.getByText('Item Label Manually Updated')).toBeVisible()
    await expect(page.getByText('Item Risk Changed')).toBeVisible()
    await expect(page.getByText(`Affected item: SHOWER-001 - ${manualLabel}`)).toBeVisible()
    await page.goto('/work-orders')

    await page.getByRole('combobox', { name: 'Risk' }).selectOption('high')
    await expect(page).toHaveURL(/risk=high/)
    await expect(primaryGroup).toContainText('1 of 2 active items')
    await expect(primaryGroup.getByRole('row')).toHaveCount(1)
    await page.getByRole('link', { name: 'Reset' }).click()
    await expect(primaryGroup.getByRole('row')).toHaveCount(2)
    await expect(primaryGroup.getByText('Apply to all active items')).toHaveCount(0)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Export CSV' }).click()
    const csv = await readDownload(await downloadPromise)
    expect(csv).toContain(`"${primaryJobNumber}"`)
    expect(csv).toContain(`"${manualLabel}"`)
    expect(csv.match(new RegExp(primaryJobNumber, 'g'))).toHaveLength(2)

    primaryJobIsCurrent = false
    await refreshWorkOrders(page)
    await expect(primaryGroup).toHaveCount(0)
    await expect(secondaryGroup).toBeVisible()

    primaryJobIsCurrent = true
    await refreshWorkOrders(page)
    await expect(primaryGroup.getByRole('row')).toHaveCount(2)
    await expect(primaryGroup.getByLabel('Short label for SHOWER-001')).toHaveValue(manualLabel)
    await expect(primaryGroup.getByLabel('Risk for SHOWER-001')).toHaveValue('high')
  })
})

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

async function refreshWorkOrders(page: Page) {
  await page.getByRole('button', { name: 'Refresh from ServiceM8' }).click()
  await expect(page.getByRole('status')).toContainText('Last successful sync')

  if (!isolatedDatabaseUrl) return
  const sql = neon(isolatedDatabaseUrl)
  let newRefreshRunIds: string[] = []
  await expect.poll(async () => {
    const refreshRuns = await sql`SELECT id FROM work_order_refresh_runs` as Array<{ id: string }>
    newRefreshRunIds = refreshRuns
      .map((refreshRun) => refreshRun.id)
      .filter((refreshRunId) => !knownRefreshRunIds.has(refreshRunId))
    return newRefreshRunIds.length
  }).toBeGreaterThan(0)

  for (const refreshRunId of newRefreshRunIds) {
    knownRefreshRunIds.add(refreshRunId)
    createdRefreshRunIds.add(refreshRunId)
  }
}

async function readDownload(download: Download) {
  const stream = await download.createReadStream()
  if (!stream) throw new Error('MT-199 CSV download did not provide a readable stream.')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

function createControlledAdapterServer() {
  return createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', `http://127.0.0.1:${adapterPort}`).pathname
    if (path === '/api_1.0/job.json') {
      return sendJson(response, [
        ...(primaryJobIsCurrent ? [{
          uuid: primaryJobUuid,
          active: 1,
          status: 'Work Order',
          generated_job_id: primaryJobNumber,
          job_address: '19 Glass Lane, Auckland',
          job_description: 'MT-199 primary glazing job',
        }] : []),
        {
          uuid: secondaryJobUuid,
          active: 1,
          status: 'Work Order',
          generated_job_id: secondaryJobNumber,
          job_address: '20 Glass Lane, Auckland',
          job_description: 'MT-199 secondary glazing job',
        },
      ])
    }
    if (path === '/api_1.0/company.json') return sendJson(response, [])
    if (path === '/api_1.0/jobmaterial.json') {
      return sendJson(response, [
        {
          uuid: primaryItemUuids[0],
          active: 1,
          job_uuid: primaryJobUuid,
          material_uuid: 'mt199-material-shower',
          name: 'Supply and install frameless shower screen 1200 x 2100 matte black',
          quantity: '2',
          price: '1250.50',
          sort_order: '1',
        },
        {
          uuid: primaryItemUuids[1],
          active: 1,
          job_uuid: primaryJobUuid,
          material_uuid: 'mt199-material-hardware',
          name: 'Shower hardware pack matte black',
          quantity: '1',
          price: '300.00',
          sort_order: '2',
        },
        {
          uuid: secondaryItemUuid,
          active: 1,
          job_uuid: secondaryJobUuid,
          material_uuid: 'mt199-material-secondary',
          name: 'Secondary glass panel',
          quantity: '1',
          price: '500.00',
          sort_order: '1',
        },
      ])
    }
    if (path === '/api_1.0/material.json') {
      return sendJson(response, [
        { uuid: 'mt199-material-shower', item_number: 'SHOWER-001' },
        { uuid: 'mt199-material-hardware', item_number: 'HARDWARE-001' },
        { uuid: 'mt199-material-secondary', item_number: 'GLASS-SECONDARY' },
      ])
    }
    if (path === '/v1/responses') {
      const body = await readRequestBody(request)
      const input = String((JSON.parse(body) as { input?: unknown }).input ?? '')
      const label = input.includes('frameless shower')
        ? 'Frameless shower screen, 1200 x 2100, matte black'
        : input.includes('hardware') ? 'Shower hardware pack, matte black' : 'Secondary glass panel'
      return sendJson(response, { output_text: label })
    }

    response.writeHead(404).end()
  })
}

function sendJson(response: import('node:http').ServerResponse, value: unknown) {
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(value))
}

async function readRequestBody(request: import('node:http').IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}
