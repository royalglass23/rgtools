import { createServer, type Server } from 'node:http'
import { createHash } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { hash } from 'bcryptjs'
import { neon } from '@neondatabase/serverless'
import { expect, test, type Download, type Locator, type Page } from '@playwright/test'
import {
  createWorkOrderAcceptanceCredentials,
  readWorkOrderAcceptanceDatabaseProof,
  verifyWorkOrderAcceptanceDatabase,
} from './work-order-acceptance-safety'

const isolatedDatabaseUrl = process.env.E2E_DATABASE_URL
const expectedDatabaseSentinel = process.env.E2E_DATABASE_SENTINEL
const adapterPort = Number(process.env.E2E_ADAPTER_PORT ?? 32199)
const runId = crypto.randomUUID()
const { username, password } = createWorkOrderAcceptanceCredentials()
const { username: viewerUsername, password: viewerPassword } = createWorkOrderAcceptanceCredentials()
const userId = crypto.randomUUID()
const viewerUserId = crypto.randomUUID()
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
let primaryShowerDescription = 'Supply and install frameless shower screen 1200 x 2100 matte black'
let adapterServer: Server | null = null
let databaseVerified = false
let previousSummaryConfig: {
  value: string
  updatedBy: string | null
  updatedAt: string
} | null = null
let previousSpecificationFilterConfig: {
  value: string
  updatedBy: string | null
  updatedAt: string
} | null = null
let previousChromeProductionLabel: string | null = null
let previousModuleStates: Array<{
  slug: string
  name: string
  adminOnly: boolean
  isActive: boolean
}> = []
const createdRefreshRunIds = new Set<string>()
const knownRefreshRunIds = new Set<string>()
const createdRolloutRunIds = new Set<string>()
let refreshMeasurementNumber = 0

test.describe('MT-199 Work Order Items release acceptance', () => {
  test.skip(!isolatedDatabaseUrl, 'Set a dedicated E2E_DATABASE_URL to run the mutating Work Orders acceptance journey.')
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(360_000)

  test.beforeAll(async () => {
    if (!isolatedDatabaseUrl) return
    const sql = neon(isolatedDatabaseUrl)
    await verifyWorkOrderAcceptanceDatabase({
      expectedSentinel: expectedDatabaseSentinel,
      readProof: () => readWorkOrderAcceptanceDatabaseProof((statement) =>
        sql.query(statement) as Promise<Array<{ databaseName: string; sentinel: string | null }>>),
    })
    databaseVerified = true
    const existingRefreshRuns = await sql`SELECT id FROM work_order_refresh_runs` as Array<{ id: string }>
    for (const refreshRun of existingRefreshRuns) knownRefreshRunIds.add(refreshRun.id)

    const existingSettings = await sql`
      SELECT value, updated_by AS "updatedBy", updated_at AS "updatedAt"
      FROM settings WHERE key = 'work_orders.summary_fields' LIMIT 1
    ` as Array<NonNullable<typeof previousSummaryConfig>>
    previousSummaryConfig = existingSettings[0] ?? null
    const existingSpecificationFilterSettings = await sql`
      SELECT value, updated_by AS "updatedBy", updated_at AS "updatedAt"
      FROM settings WHERE key = 'work_orders.production_specification_filters' LIMIT 1
    ` as Array<NonNullable<typeof previousSpecificationFilterConfig>>
    previousSpecificationFilterConfig = existingSpecificationFilterSettings[0] ?? null
    const chromeOptions = await sql`
      SELECT production_label AS "productionLabel"
      FROM work_order_specification_catalogue_options
      WHERE id = 'finish.chrome'
      LIMIT 1
    ` as Array<{ productionLabel: string }>
    previousChromeProductionLabel = chromeOptions[0]?.productionLabel ?? null
    if (!previousChromeProductionLabel) {
      throw new Error('MT-208 acceptance requires the finish.chrome catalogue option.')
    }
    previousModuleStates = await sql`
      SELECT slug, name, admin_only AS "adminOnly", is_active AS "isActive"
      FROM modules
      WHERE slug IN ('work-orders', 'work-orders/manage', 'admin/work-orders')
    ` as typeof previousModuleStates

    await sql`
      INSERT INTO users (id, username, password_hash, role, is_protected)
      VALUES
        (${userId}::uuid, ${username}, ${await hash(password, 12)}, 'admin', true),
        (${viewerUserId}::uuid, ${viewerUsername}, ${await hash(viewerPassword, 12)}, 'staff', false)
    `
    for (const workOrderModule of workOrderModules) {
      await sql`
        INSERT INTO modules (slug, name, admin_only, is_active)
        VALUES (${workOrderModule.slug}, ${workOrderModule.name}, ${workOrderModule.adminOnly}, true)
        ON CONFLICT (slug) DO UPDATE SET is_active = true
      `
    }
    await sql`
      INSERT INTO user_module_access (user_id, module_id, granted_by)
      SELECT ${viewerUserId}::uuid, id, ${userId}::uuid
      FROM modules
      WHERE slug = 'work-orders'
    `
    if (previousChromeProductionLabel) {
      await sql`
        UPDATE work_order_specification_catalogue_options
        SET production_label = ${previousChromeProductionLabel}, updated_at = now()
        WHERE id = 'finish.chrome'
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
    await sql`
      INSERT INTO settings (key, value, updated_by)
      VALUES ('work_orders.production_specification_filters', ${JSON.stringify([
        { field: 'hardwareFinish', enabled: true, order: 1 },
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
    for (const rolloutRunId of createdRolloutRunIds) {
      await sql`DELETE FROM work_order_existing_item_rollout_runs WHERE id = ${rolloutRunId}::uuid`
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
    if (previousSpecificationFilterConfig === null) {
      await sql`DELETE FROM settings WHERE key = 'work_orders.production_specification_filters'`
    } else {
      await sql`
        UPDATE settings
        SET
          value = ${previousSpecificationFilterConfig.value},
          updated_by = ${previousSpecificationFilterConfig.updatedBy}::uuid,
          updated_at = ${previousSpecificationFilterConfig.updatedAt}
        WHERE key = 'work_orders.production_specification_filters'
      `
    }
    if (previousChromeProductionLabel) {
      await sql`
        UPDATE work_order_specification_catalogue_options
        SET production_label = ${previousChromeProductionLabel}, updated_at = now()
        WHERE id = 'finish.chrome'
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
    await sql`
      DELETE FROM work_order_refresh_locks
      WHERE lock_name = ${`work-order-rate:refresh:${userId}`}
    `
    await sql`DELETE FROM users WHERE id IN (${userId}::uuid, ${viewerUserId}::uuid)`
  })

  test('refreshes, edits, filters, exports, removes and restores a multi-item job', async ({ page }) => {
    await login(page)
    await page.goto('/work-orders')
    await refreshWorkOrders(page)

    await expect(page.getByRole('heading', { name: 'Work Orders' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Work Order filter utilities' })).toBeVisible()
    const accessibilityScan = await new AxeBuilder({ page })
      .include('main')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    console.log(`MT199_A11Y violations=${accessibilityScan.violations.length}`)
    expect(
      accessibilityScan.violations,
      JSON.stringify(accessibilityScan.violations, null, 2),
    ).toEqual([])

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
    await expect(firstItem.getByLabel('Short label for SHOWER-001')).toHaveValue(primaryShowerDescription)
    await expect(firstItem).toHaveAttribute('title', /Supply and install frameless shower screen[\s\S]*Line total excluding GST: \$2501\.00/)

    await prepareExistingItemRolloutFixture()
    await page.reload()
    const rolloutPanel = page.getByRole('region', { name: 'Existing-item enrichment' })
    await rolloutPanel.getByRole('button', { name: 'Start existing-item enrichment' }).click()
    await expect(rolloutPanel).toContainText('Rollout running.')
    await expect(rolloutPanel.locator('[data-count="total"]')).toHaveText('1')
    await expect(rolloutPanel.locator('[data-count="queued"]')).toHaveText('1')
    const rolloutRunId = await failLatestExistingItemRollout()
    createdRolloutRunIds.add(rolloutRunId)
    await expect(rolloutPanel).toContainText('Rollout failed.', { timeout: 15_000 })
    await expect(rolloutPanel.locator('[data-count="failed"]')).toHaveText('1')
    await rolloutPanel.getByRole('button', { name: 'Resume failed enrichment' }).click()
    await expect(rolloutPanel).toContainText('Rollout running.')
    await expect(rolloutPanel.locator('[data-count="queued"]')).toHaveText('1')
    await expect(rolloutPanel.locator('[data-count="retried"]')).toHaveText('1')
    await completeExistingItemRollout(rolloutRunId)
    await expect(rolloutPanel).toContainText('Rollout completed.', { timeout: 15_000 })
    await expect(rolloutPanel.locator('[data-count="drafted"]')).toHaveText('1')
    await expect(rolloutPanel.locator('[data-count="needs-review"]')).toHaveText('1')

    await page.reload()
    const secondaryItem = secondaryGroup.getByRole('row').filter({ hasText: 'GLASS-SECONDARY' })
    await openProductionSpecification(secondaryItem)
    await expect(secondaryItem.getByText('Review and correct draft')).toBeVisible()
    await secondaryItem.getByRole('button', { name: 'Confirm specification' }).click()
    await expect.poll(readSecondarySpecificationStatus, { timeout: 30_000 }).toBe('confirmed')
    await page.reload()
    const confirmedSecondaryItem = secondaryGroup.getByRole('row').filter({ hasText: 'GLASS-SECONDARY' })
    await openProductionSpecification(confirmedSecondaryItem)
    await expect(confirmedSecondaryItem.getByText('Confirmed', { exact: true })).toBeVisible()

    await seedConfirmedChromeProductionSpecification()
    await page.reload()
    const acceptanceChromeLabel = `Chrome acceptance ${runId.slice(0, 8)}`
    await updateChromeCatalogueProductionLabel(page, acceptanceChromeLabel)
    await page.goto('/work-orders')
    await expect(firstItem.getByLabel('Short label for SHOWER-001')).toHaveValue(
      new RegExp(acceptanceChromeLabel),
    )
    await updateChromeCatalogueProductionLabel(page, previousChromeProductionLabel!)
    await page.goto('/work-orders')
    await expect(firstItem.getByLabel('Short label for SHOWER-001')).toHaveValue(/Chrome/)
    await openProductionSpecification(firstItem)
    await firstItem.getByRole('button', { name: 'Change specification' }).click()
    await firstItem.getByLabel('Hardware/Fittings Finish for SHOWER-001').selectOption('finish.matte-black')
    await firstItem.getByRole('button', { name: 'Confirm specification' }).click()
    const changeReason = firstItem.getByLabel('Change reason')
    const changeReasonError = firstItem.getByRole('alert').filter({ hasText: 'Choose an approved change reason' })
    await expect(changeReason).toHaveAttribute('aria-invalid', 'true')
    const changeReasonErrorId = await changeReasonError.getAttribute('id')
    expect(changeReasonErrorId).toBeTruthy()
    await expect(changeReason).toHaveAttribute('aria-describedby', changeReasonErrorId!)
    await changeReason.selectOption('client_request')
    await firstItem.getByLabel('Change note (optional)').fill('Client approved Matte Black.')
    await firstItem.getByRole('button', { name: 'Confirm specification' }).click()
    await expect(firstItem.getByText('Specification confirmed')).toBeVisible({ timeout: 30_000 })

    await page.reload()
    await expect(firstItem.getByLabel('Short label for SHOWER-001')).toHaveValue(/Matte Black/)
    await openProductionSpecification(firstItem)
    await expect(firstItem.getByText(/Client request/)).toBeVisible()
    await expect(firstItem.getByText('Hardware/Fittings Finish: Chrome → Matte Black')).toBeVisible()

    primaryShowerDescription = 'ServiceM8 revised shower description with new Matte Black source wording'
    await refreshWorkOrders(page)
    await expect(firstItem.getByText('Source Changed')).toBeVisible()
    await openProductionSpecification(firstItem)
    await firstItem.getByText('Compare ServiceM8 source').click()
    await expect(
      firstItem.getByLabel('Current ServiceM8 source').getByText(primaryShowerDescription),
    ).toBeVisible()
    await firstItem.getByRole('button', { name: 'Ignore source change' }).click()
    await expect(firstItem.getByText('Source Changed')).toHaveCount(0)
    await expect(firstItem.getByText('View specification')).toBeFocused()

    primaryShowerDescription = 'ServiceM8 second revision requiring a reviewable draft'
    await refreshWorkOrders(page)
    await expect(firstItem.getByText('Source Changed')).toBeVisible()
    await openProductionSpecification(firstItem)
    await firstItem.getByText('Compare ServiceM8 source').click()
    await firstItem.getByRole('button', { name: 'Create new draft' }).click()
    await expect(firstItem.getByText('Review and correct draft')).toBeVisible()
    await expect(firstItem.getByText('Confirmed', { exact: true })).toBeVisible()

    const manualLabel = 'Manual MT199 shower label'
    await firstItem.getByLabel('Short label for SHOWER-001').fill(manualLabel)
    await firstItem.getByRole('button', { name: 'Save label' }).click()
    await expect(firstItem.getByText('Saved')).toBeVisible()
    await firstItem.getByLabel('Risk for SHOWER-001').selectOption('high')
    await expect(firstItem.getByText('Saved')).toHaveCount(2)

    await page.reload()
    await expect(primaryGroup.getByLabel('Short label for SHOWER-001')).toHaveValue(manualLabel)
    await expect(primaryGroup.getByLabel('Risk for SHOWER-001')).toHaveValue('high')

    const detailLink = primaryGroup.getByRole('link', { name: primaryJobNumber })
    await detailLink.focus()
    await expect(detailLink).toBeFocused()
    const detailHref = await detailLink.getAttribute('href')
    expect(detailHref).toMatch(/^\/work-orders\/[0-9a-f-]+$/)
    const detailWarmup = await page.request.get(detailHref!)
    expect(detailWarmup.ok()).toBe(true)
    await detailLink.click()
    await expect(page).toHaveURL(/\/work-orders\/[0-9a-f-]+$/, { timeout: 30_000 })
    await expect(page.getByText('Item Label Manually Updated')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Item Risk Changed')).toBeVisible()
    await expect(page.getByText(`Affected item: SHOWER-001 - ${manualLabel}`).first()).toBeVisible()
    await page.goto('/work-orders')

    await page.getByLabel('Risk', { exact: true }).selectOption('high')
    await expect(page).toHaveURL(/risk=high/)
    await expect(primaryGroup).toContainText('1 of 2 active items')
    await expect(primaryGroup.getByRole('row')).toHaveCount(1)
    await page.getByRole('link', { name: 'Reset' }).click()
    await expect(primaryGroup.getByRole('row')).toHaveCount(2)
    await expect(primaryGroup.getByText('Apply to all active items')).toHaveCount(0)

    await page.getByLabel('Search').fill('Matte Black')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page).toHaveURL(/q=Matte\+Black/)
    await expect(primaryGroup).toBeVisible()
    await page.getByRole('link', { name: 'Reset' }).click()
    await page.getByLabel('Hardware/Fittings Finish', { exact: true }).selectOption('finish.matte-black')
    await expect(page).toHaveURL(/spec_hardwareFinish=finish\.matte-black/)
    await expect(primaryGroup).toBeVisible()
    await page.getByRole('link', { name: 'Reset' }).click()

    const exportHref = await page.getByRole('link', { name: 'Export CSV' }).getAttribute('href')
    expect(exportHref).toBeTruthy()
    const exportWarmup = await page.request.get(exportHref!)
    expect(exportWarmup.ok()).toBe(true)
    const exportStartedAt = Date.now()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Export CSV' }).click()
    const csv = await readDownload(await downloadPromise)
    const exportDurationMs = Date.now() - exportStartedAt
    console.log(`MT199_PERF export_csv_ms=${exportDurationMs}`)
    expect(exportDurationMs).toBeLessThan(10_000)
    expect(csv).toContain(`"${primaryJobNumber}"`)
    expect(csv).toContain(`"${manualLabel}"`)
    expect(csv).toContain('"Specification Review Status"')
    expect(csv).toContain('"Production Label"')
    expect(csv).toContain('"Confirmed Hardware/Fittings Finish"')
    expect(csv).toContain('"Matte Black"')
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

  test('keeps the View-only Work Orders journey read-only', async ({ page }) => {
    await login(page, viewerUsername, viewerPassword)
    await page.goto('/work-orders')

    const primaryGroup = page.getByRole('group', { name: `Work Order ${primaryJobNumber}` })
    const firstItem = primaryGroup.getByRole('row').filter({ hasText: 'SHOWER-001' })
    await expect(primaryGroup).toBeVisible()
    await expect(page.getByRole('button', { name: 'Refresh all jobs', exact: true })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Existing-item enrichment' })).toHaveAttribute('aria-readonly', 'true')
    await expect(firstItem.getByLabel('Short label for SHOWER-001')).toHaveCount(0)
    await openProductionSpecification(firstItem)
    await expect(firstItem.getByRole('button', { name: 'Change specification' })).toHaveCount(0)
    await expect(firstItem.getByRole('button', { name: 'Save draft' })).toHaveCount(0)
  })
})

async function login(page: Page, loginUsername = username, loginPassword = password) {
  await page.goto('/login')
  await page.getByLabel('Username').fill(loginUsername)
  await page.getByLabel('Password').fill(loginPassword)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

async function openProductionSpecification(item: Locator) {
  const details = item.locator('details').first()
  const isOpen = await details.evaluate((element) => (element as HTMLDetailsElement).open)
  if (!isOpen) {
    const summary = details.locator('summary').first()
    await summary.focus()
    await summary.press('Enter')
  }
  await expect(details).toHaveAttribute('open', '')
}

async function updateChromeCatalogueProductionLabel(page: Page, productionLabel: string) {
  await page.goto('/admin/work-orders')
  await expect(page.getByRole('heading', { name: 'Work Order Configuration' })).toBeVisible()
  const chromeForm = page.locator('form').filter({
    has: page.locator('input[name="id"][value="finish.chrome"]'),
  })
  await expect(chromeForm.getByText('Affected confirmed items: 2')).toBeVisible()
  await chromeForm.getByLabel('Production Label wording').fill(productionLabel)
  await chromeForm.getByLabel(/Confirm this rename or deactivation/).check()
  await chromeForm.getByRole('button', { name: 'Save catalogue option' }).click()
  await expect(
    chromeForm.getByRole('status').filter({ hasText: 'Catalogue option saved.' }),
  ).toContainText(
    '2 confirmed item labels were rebuilt with system history.',
    { timeout: 30_000 },
  )
}

async function refreshWorkOrders(page: Page) {
  const refreshStartedAt = Date.now()
  const refreshButton = page.getByRole('button', { name: 'Refresh all jobs', exact: true })
  const refreshInProgress = page.getByRole('status').filter({ hasText: 'Refreshing all jobs...' })
  await expect(refreshButton).toBeEnabled()
  await refreshButton.click()
  await expect(refreshInProgress).toBeVisible()

  if (!isolatedDatabaseUrl) return
  const sql = neon(isolatedDatabaseUrl)
  let newRefreshRunIds: string[] = []
  await expect.poll(async () => {
    const refreshRuns = await sql`SELECT id FROM work_order_refresh_runs` as Array<{ id: string }>
    newRefreshRunIds = refreshRuns
      .map((refreshRun) => refreshRun.id)
      .filter((refreshRunId) => !knownRefreshRunIds.has(refreshRunId))
    return newRefreshRunIds.length
  }, { timeout: 30_000 }).toBeGreaterThan(0)

  await expect(refreshInProgress).toHaveCount(0, { timeout: 30_000 })
  await expect(refreshButton).toBeEnabled()

  for (const refreshRunId of newRefreshRunIds) {
    knownRefreshRunIds.add(refreshRunId)
    createdRefreshRunIds.add(refreshRunId)
  }
  await sql`
    DELETE FROM work_order_refresh_locks
    WHERE lock_name = ${`work-order-rate:refresh:${userId}`}
  `
  const refreshDurationMs = Date.now() - refreshStartedAt
  refreshMeasurementNumber += 1
  console.log(`MT199_PERF refresh_${refreshMeasurementNumber}_ms=${refreshDurationMs}`)
  expect(refreshDurationMs).toBeLessThan(30_000)
}

async function readDownload(download: Download) {
  const stream = await download.createReadStream()
  if (!stream) throw new Error('MT-199 CSV download did not provide a readable stream.')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

async function prepareExistingItemRolloutFixture() {
  if (!isolatedDatabaseUrl) return
  const sql = neon(isolatedDatabaseUrl)
  await sql`
    DELETE FROM work_order_existing_item_rollout_runs
    WHERE actor_id IN (
      SELECT id FROM users WHERE username LIKE 'mt199-%'
    )
  `

  await sql`
    DELETE FROM work_order_item_production_specifications
    WHERE work_order_item_id = (
      SELECT id FROM work_order_items WHERE servicem8_item_uuid = ${secondaryItemUuid} LIMIT 1
    )
  `
  await sql`
    DELETE FROM work_order_item_enrichment_jobs
    WHERE work_order_item_id = (
      SELECT id FROM work_order_items WHERE servicem8_item_uuid = ${secondaryItemUuid} LIMIT 1
    )
  `
}

async function failLatestExistingItemRollout() {
  if (!isolatedDatabaseUrl) throw new Error('The isolated Work Orders database is required.')
  const sql = neon(isolatedDatabaseUrl)
  const runs = await sql`
    SELECT id
    FROM work_order_existing_item_rollout_runs
    WHERE actor_id = ${userId}::uuid
    ORDER BY started_at DESC
    LIMIT 1
  ` as Array<{ id: string }>
  const rolloutRunId = runs[0]?.id
  if (!rolloutRunId) throw new Error('The browser did not create an existing-item rollout run.')
  await sql`
    UPDATE work_order_item_enrichment_jobs
    SET status = 'failed', last_safe_error = 'Controlled E2E provider failure.'
    WHERE rollout_run_id = ${rolloutRunId}::uuid
  `
  return rolloutRunId
}

async function completeExistingItemRollout(rolloutRunId: string) {
  if (!isolatedDatabaseUrl) throw new Error('The isolated Work Orders database is required.')
  const sql = neon(isolatedDatabaseUrl)
  const jobs = await sql`
    SELECT
      jobs.id,
      jobs.work_order_item_id AS "workOrderItemId",
      jobs.source_description AS "sourceDescription",
      jobs.source_description_fingerprint AS "sourceDescriptionFingerprint"
    FROM work_order_item_enrichment_jobs jobs
    WHERE jobs.rollout_run_id = ${rolloutRunId}::uuid
    LIMIT 1
  ` as Array<{
    id: string
    workOrderItemId: string
    sourceDescription: string
    sourceDescriptionFingerprint: string
  }>
  const job = jobs[0]
  if (!job) throw new Error('The rollout job could not be completed for browser acceptance.')
  const draft = confirmedChromeProductionSpecification()

  await sql`
    INSERT INTO work_order_item_production_specifications (
      work_order_item_id,
      status,
      schema_version,
      draft_data,
      source_description,
      source_description_fingerprint,
      draft_source_description,
      draft_source_description_fingerprint,
      generated_at,
      draft_revision,
      draft_base_revision,
      updated_at
    ) VALUES (
      ${job.workOrderItemId}::uuid,
      'needs_review',
      1,
      ${JSON.stringify(draft)}::jsonb,
      ${job.sourceDescription},
      ${job.sourceDescriptionFingerprint},
      ${job.sourceDescription},
      ${job.sourceDescriptionFingerprint},
      now(),
      1,
      0,
      now()
    )
  `
  await sql`
    UPDATE work_order_item_enrichment_jobs
    SET status = 'completed', generated_at = now(), last_safe_error = NULL, updated_at = now()
    WHERE id = ${job.id}::uuid
  `
}

async function readSecondarySpecificationStatus() {
  if (!isolatedDatabaseUrl) throw new Error('The isolated Work Orders database is required.')
  const sql = neon(isolatedDatabaseUrl)
  const specifications = await sql`
    SELECT specifications.status
    FROM work_order_item_production_specifications specifications
    JOIN work_order_items items ON items.id = specifications.work_order_item_id
    WHERE items.servicem8_item_uuid = ${secondaryItemUuid}
    LIMIT 1
  ` as Array<{ status: string }>
  return specifications[0]?.status ?? null
}

async function seedConfirmedChromeProductionSpecification() {
  if (!isolatedDatabaseUrl) return
  const sql = neon(isolatedDatabaseUrl)
  const items = await sql`
    SELECT id, work_order_id AS "workOrderId"
    FROM work_order_items
    WHERE servicem8_item_uuid = ${primaryItemUuids[0]}
    LIMIT 1
  ` as Array<{ id: string; workOrderId: string }>
  const item = items[0]
  if (!item) throw new Error('MT-205 acceptance item was not created by the controlled refresh.')

  const confirmedData = confirmedChromeProductionSpecification()
  const sourceDescriptionFingerprint = createHash('sha256').update(primaryShowerDescription).digest('hex')
  const specifications = await sql`
    INSERT INTO work_order_item_production_specifications (
      work_order_item_id,
      status,
      schema_version,
      confirmed_data,
      source_description,
      source_description_fingerprint,
      production_label,
      confirmed_by,
      confirmed_at,
      confirmed_revision,
      draft_revision,
      updated_at
    ) VALUES (
      ${item.id}::uuid,
      'confirmed',
      1,
      ${JSON.stringify(confirmedData)}::jsonb,
      ${primaryShowerDescription},
      ${sourceDescriptionFingerprint},
      'Shower Glass | Int Bathroom | 10 mm Toughened Clear | Hinged | Chrome | Supply & Install',
      ${userId}::uuid,
      now(),
      1,
      0,
      now()
    )
    RETURNING id
  ` as Array<{ id: string }>
  const specification = specifications[0]
  if (!specification) throw new Error('MT-205 acceptance specification could not be seeded.')

  await sql`
    INSERT INTO work_order_item_production_specification_revisions (
      specification_id,
      work_order_item_id,
      actor_id,
      revision_type,
      previous_snapshot,
      new_snapshot,
      reason_code,
      note,
      changes
    ) VALUES (
      ${specification.id}::uuid,
      ${item.id}::uuid,
      ${userId}::uuid,
      'baseline_confirmed',
      NULL,
      ${JSON.stringify(confirmedData)}::jsonb,
      NULL,
      NULL,
      '[]'::jsonb
    )
  `
}

function confirmedChromeProductionSpecification() {
  return {
    schemaVersion: 1,
    system: { state: 'selected', catalogueId: 'system.shower-glass' },
    structureMaterial: { state: 'tbc' },
    structureType: { state: 'tbc' },
    locationEnvironment: { state: 'selected', catalogueId: 'location.internal' },
    locationDetail: { state: 'selected', catalogueId: 'location_detail.bathroom' },
    structureBuilt: { state: 'tbc' },
    glassConstruction: { state: 'selected', catalogueId: 'glass_construction.toughened' },
    glassAppearance: { state: 'selected', catalogueId: 'glass_appearance.clear' },
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
  }
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
          name: primaryShowerDescription,
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
