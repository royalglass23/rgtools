import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { verifyIsolatedE2eDatabase } from './e2e-database-safety'

const fixtureUrl = 'http://127.0.0.1:3058'
const adapterUrl = process.env.RG408_ADAPTER_URL ?? 'http://127.0.0.1:3059'
const databaseUrl = 'postgresql://rg408@127.0.0.1:55442/rg408_production_e2e?sslmode=disable'
const enabled = process.env.RG408_PUBLICATION_E2E_URL === fixtureUrl && process.env.E2E_BASE_URL === fixtureUrl
const root = path.resolve(process.cwd(), '../../tmp/rg408-production-e2e')
type Fixture = { databaseUrl: string; baseUrl: string; sentinel: string; password: string; publishSecret: string }
let fixture: Fixture
const headersA = ['WO', 'Customer', 'Short address', 'Approx install date', 'Within 3 weeks?']
const headersB = ['WO / client / address', 'Materials (per product)', 'Client waiting for', 'Site ready', 'Glass ready', 'Hardware ready', 'Design Y/N/?', 'PS1 / PS3', 'Bottle strut', 'BC?', 'Minor var?']
const material = 'Fictional shower – 10 mm\nKeep every source line visible. <b>literal source</b>\nGlass café / 工程 ✓'
let timestamp = Date.now() - 60_000
function publication() {
  timestamp = Math.max(timestamp + 1, Date.now() - 1000)
  const sourceAsOf = new Date(timestamp).toISOString()
  return { schemaVersion: 1, board: 'work-orders', publicationId: randomUUID(), complete: true, sourceAsOf, generatedAt: sourceAsOf, tables: {
    jobs: Array.from({ length: 12 }, (_, i) => ({ id: `fictional-job-${i + 1}`, cells: [`WO408${String(i + 1).padStart(2, '0')}`, `Fictional customer ${i + 1}`, i ? `Fictional site ${i + 1}` : 'Fictional site\nUnit café 工程', i ? 'Bot source date?' : '', i % 2 ? 'No' : '?'] })),
    products: Array.from({ length: 12 }, (_, i) => ({ id: `fictional-job-${i + 1}`, cells: [`WO408${String(i + 1).padStart(2, '0')}\nFictional customer ${i + 1}`, i ? `Fictional material ${i + 1}` : material, 'Client source says ?', '', 'Unknown', 'No', '?', 'PS1 / PS3 source', '', 'N/A', '?'] })),
  } }
}
// Every reset is confined to the owned synthetic database and guarded in that connection.
function localSql(statement: string) {
  if (!enabled || fixture.databaseUrl !== databaseUrl || fixture.baseUrl !== fixtureUrl || !/^[a-f0-9]{64}$/.test(fixture.sentinel)) throw new Error('Refusing unsafe fixture SQL')
  const guard = `DO $$ BEGIN IF current_database() <> 'rg408_production_e2e' OR inet_server_addr() <> '127.0.0.1'::inet OR inet_server_port() <> 55442 OR (SELECT sentinel FROM rgtools_e2e.database_sentinel WHERE id=1) IS DISTINCT FROM '${fixture.sentinel}' THEN RAISE EXCEPTION 'Unsafe E2E fixture'; END IF; END $$;`
  return execFileSync(process.env.RG408_PSQL ?? (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe' : 'psql'), ['-X', '-w', '-h', '127.0.0.1', '-p', '55442', '-U', 'rg408', '-d', 'rg408_production_e2e', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-q'], { input: `${guard}\n${statement}`, encoding: 'utf8', env: Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]!])) }).trim()
}
async function send(request: APIRequestContext, body: ReturnType<typeof publication>) {
  // Stringify once: caller reuses the same envelope for an identical retry.
  return request.post('/api/kanban/publish', { headers: { Authorization: `Bearer ${fixture.publishSecret}`, 'Content-Type': 'application/json' }, data: JSON.stringify(body) })
}
async function login(page: Page, username = 'rg408-staff') {
  await page.goto('/login')
  await page.getByLabel('Username', { exact: true }).fill(username)
  await page.getByLabel('Password', { exact: true }).fill(fixture.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(`${fixtureUrl}/`, { timeout: 120_000 })
}
const jobs = (page: Page) => page.getByRole('region', { name: 'All Work Order rows', exact: true })
const products = (page: Page) => page.getByRole('region', { name: 'Due product rows', exact: true })
const history = (page: Page) => page.getByRole('region', { name: 'Publication history', exact: true })
const metrics = async (request: APIRequestContext) => (await (await request.get(`${adapterUrl}/__metrics`, { ignoreHTTPSErrors: adapterUrl === 'https://127.0.0.1:3059' })).json()) as { reads: number; writes: number; aiCalls: number }

test.describe('RG-408 isolated direct Kanban publication acceptance', () => {
  test.skip(!enabled, 'Run only with the exact guarded local Kanban publication fixture')
  test.describe.configure({ mode: 'default' })
  test.setTimeout(180_000)
  test.beforeAll(async () => {
    if (!['http://127.0.0.1:3059', 'https://127.0.0.1:3059'].includes(adapterUrl)) throw new Error('Exact loopback adapter required')
    const file = process.env.RG408_FIXTURE_FILE
    if (!file || path.resolve(file) !== path.join(root, 'fixture.json')) throw new Error('Exact owned fixture file required')
    fixture = JSON.parse(readFileSync(file, 'utf8'))
    await verifyIsolatedE2eDatabase({ expectedSentinel: process.env.E2E_DATABASE_SENTINEL, purpose: 'RG-408 direct publication acceptance', readProof: async () => JSON.parse(localSql(`SELECT json_build_object('databaseName',current_database(),'sentinel',sentinel) FROM rgtools_e2e.database_sentinel WHERE id=1;`)) })
  })
  test.beforeEach(async ({ request, page }) => {
    page.on('pageerror', error => console.error('Fixture browser error:', error.message))
    localSql("DELETE FROM settings WHERE key='kanban.work-orders.latest.v1'; DELETE FROM audit_log WHERE entity_type='kanban.work-orders.publication';")
    expect((await send(request, publication())).status()).toBe(200)
  })

  test('receiver requires publisher authentication, rejects incomplete/conflicting delivery, and deduplicates identical retry', async ({ request, page }) => {
    const body = publication(), serialized = JSON.stringify(body)
    expect((await request.post('/api/kanban/publish', { data: body })).status()).toBe(401)
    expect((await request.post('/api/kanban/publish', { headers: { Authorization: 'Bearer fictional-wrong' }, data: body })).status()).toBe(401)
    const first = await send(request, body)
    expect(first.status()).toBe(200)
    expect(await first.json()).toEqual({ outcome: 'no_change', publicationId: body.publicationId, duplicate: false })
    const retry = await request.post('/api/kanban/publish', { headers: { Authorization: `Bearer ${fixture.publishSecret}`, 'Content-Type': 'application/json' }, data: serialized })
    expect(await retry.json()).toEqual({ outcome: 'no_change', publicationId: body.publicationId, duplicate: true })
    expect(localSql(`SELECT count(*) FROM audit_log WHERE id='${body.publicationId}';`)).toBe('1')
    const conflict = structuredClone(body); conflict.tables.jobs[0].cells[1] = 'Different fictional delivery'
    expect((await send(request, conflict)).status()).toBe(409)
    const incomplete = { ...publication(), complete: false }
    expect((await request.post('/api/kanban/publish', { headers: { Authorization: `Bearer ${fixture.publishSecret}` }, data: incomplete })).status()).toBe(400)
    await page.goto('/dashboard/work-orders'); await expect(page).toHaveURL(/\/login/)
    const sibling = await request.post('/api/kanban/publish-unrelated', { maxRedirects: 0 })
    expect(sibling.status()).toBeGreaterThanOrEqual(300); expect(sibling.status()).toBeLessThan(400)
  })

  test('read-only dashboard preserves exact columns/source strings, searches all rows before paging, and makes no source/AI calls', async ({ page, request }) => {
    const before = await metrics(request)
    await login(page)
    const nav = page.locator('#navigation-group-dashboard')
    await expect(nav.getByRole('link', { name: 'Roxy Dashboard' })).toHaveCount(0)
    await nav.getByRole('link', { name: 'Work Orders', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Work Orders dashboard' })).toBeVisible()
    await expect(jobs(page).getByRole('columnheader')).toHaveText(headersA)
    await expect(products(page).getByRole('columnheader')).toHaveText(headersB)
    await expect(jobs(page).locator('tbody tr')).toHaveCount(5)
    await expect(products(page).locator('tbody tr')).toHaveCount(5)
    expect(await jobs(page).locator('tbody tr').first().locator('td').allTextContents()).toEqual(publication().tables.jobs[0].cells)
    const sourceCells = await products(page).locator('tbody tr').first().locator('td').allTextContents()
    expect(sourceCells).toHaveLength(11)
    expect([sourceCells[0], ...sourceCells.slice(2)]).toEqual([publication().tables.products[0].cells[0], ...publication().tables.products[0].cells.slice(2)])
    expect(sourceCells[1]).toMatch(/^Fictional shower – 10 mm/); expect(sourceCells[1].length).toBeLessThanOrEqual(80)
    await expect(page.getByRole('button', { name: /Save product|Refresh from ServiceM8/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Edit product', exact: true })).toHaveCount(0)
    await page.getByRole('searchbox', { name: 'Find a job or product' }).fill('WO40812')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(jobs(page).locator('tbody tr')).toHaveCount(1)
    await expect(products(page).locator('tbody tr')).toHaveCount(1)
    await expect(jobs(page).getByRole('cell', { name: 'WO40812', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Clear search', exact: true }).click()
    await expect(page.getByText('12 work orders', { exact: true })).toBeVisible()
    await expect(page.getByText('12 products', { exact: true })).toBeVisible()
    // Wait for the search/clear navigation and its client assets to settle before activation.
    await expect(page).toHaveURL(`${fixtureUrl}/dashboard/work-orders`)
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Request update', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status')).toHaveText('Kanban update requests are not configured. Ask an administrator to check the webhook.')
    await expect(page.getByRole('button', { name: 'Request update', exact: true })).toBeEnabled()
    expect(await metrics(request)).toEqual(before)
  })

  test('table pages and sizes remain independent and search resets both page positions', async ({ page }) => {
    await login(page); await page.goto('/dashboard/work-orders')
    await page.getByRole('navigation', { name: 'Work Order pages' }).getByRole('link', { name: 'Next', exact: true }).click()
    await expect(jobs(page).locator('tbody tr').first()).toContainText('WO40806')
    await expect(products(page).locator('tbody tr').first()).toContainText('WO40801')
    await page.getByRole('navigation', { name: 'Product pages' }).getByRole('link', { name: 'Next', exact: true }).click()
    await expect(products(page).locator('tbody tr').first()).toContainText('WO40806')
    const a = page.getByRole('region', { name: 'Table A - Every work order', exact: true })
    await a.getByRole('combobox', { name: 'Page size' }).selectOption('10')
    await a.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(jobs(page).locator('tbody tr')).toHaveCount(10)
    await expect(jobs(page).locator('tbody tr').first()).toContainText('WO40801')
    await expect(products(page).locator('tbody tr').first()).toContainText('WO40806')
    await page.getByRole('searchbox').fill('WO40812'); await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.getByRole('navigation', { name: 'Work Order pages' })).toContainText('Page 1 of 1')
    await expect(page.getByRole('navigation', { name: 'Product pages' })).toContainText('Page 1 of 1')
    await expect(a.getByRole('combobox', { name: 'Page size' })).toHaveValue('10')
  })

  test('materials retain full literal source with keyboard, hover and touch access without editing', async ({ page, browser }) => {
    await login(page); await page.goto('/dashboard/work-orders')
    const trigger = products(page).getByRole('button', { name: /View material description:/ }).first()
    await trigger.hover()
    const dialog = page.getByRole('dialog', { name: 'Materials · WO40801', exact: true })
    await expect(dialog).toBeVisible()
    expect(await dialog.locator('p').textContent()).toBe(material)
    await expect(dialog.locator('b')).toHaveCount(0)
    await dialog.hover(); await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)
    await trigger.focus(); await page.keyboard.press('Enter'); await expect(dialog).toBeFocused()
    await expect(dialog.getByRole('link', { name: 'Edit product' })).toHaveCount(0)
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme })
      expect((await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
    }
    await page.screenshot({ path: path.join(root, 'materials-desktop.png'), animations: 'disabled' })
    await dialog.getByRole('button', { name: 'Close materials preview' }).click()
    await expect(trigger).toBeFocused(); await expect(dialog).toHaveCount(0)
    const context = await browser.newContext({ baseURL: fixtureUrl, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: await page.context().storageState() })
    try {
      const mobile = await context.newPage(); await mobile.goto('/dashboard/work-orders')
      await products(mobile).getByRole('button', { name: /View material description:/ }).first().tap()
      const preview = mobile.getByRole('dialog', { name: 'Materials · WO40801', exact: true })
      await expect(preview).toBeVisible()
      expect(await preview.locator('p').textContent()).toBe(material)
      const bounds = await preview.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
      await preview.getByRole('button', { name: 'Close materials preview' }).tap(); await expect(preview).toHaveCount(0)
      expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(await products(mobile).evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
      await mobile.screenshot({ path: path.join(root, 'work-orders-mobile.png'), fullPage: true, animations: 'disabled' })
    } finally { await context.close() }
  })

  test('visible page loads a later publication automatically, history shows exact changes and records no_change once per delivery', async ({ page, request }) => {
    await login(page); await page.goto('/dashboard/work-orders')
    const changed = publication(); changed.tables.jobs[0].cells[1] = 'Updated fictional customer'
    const accepted = await send(request, changed); expect(accepted.status()).toBe(200)
    expect(await accepted.json()).toEqual({ outcome: 'published', publicationId: changed.publicationId, duplicate: false })
    // Observe the production 30-second visible-page version check, without navigation/reload.
    await expect(jobs(page).getByRole('cell', { name: 'Updated fictional customer', exact: true })).toBeVisible({ timeout: 45_000 })
    await expect(history(page)).toContainText('0 rows added, 0 removed, 1 fields changed')
    const changedLink = history(page).locator(`a[href*="publication=${changed.publicationId}"]`)
    await changedLink.click()
    const changes = page.getByRole('region', { name: 'Publication changes' })
    await expect(changes).toContainText('Table A · fictional-job-1 · Customer')
    await expect(changes.locator('dd')).toHaveText(['Fictional customer 1', 'Updated fictional customer'])
    const noChange = { ...publication(), tables: structuredClone(changed.tables) }
    expect(await (await send(request, noChange)).json()).toEqual({ outcome: 'no_change', publicationId: noChange.publicationId, duplicate: false })
    expect(await (await send(request, noChange)).json()).toEqual({ outcome: 'no_change', publicationId: noChange.publicationId, duplicate: true })
    await page.reload(); await expect(history(page).locator('ol > li')).toHaveCount(3)
    await expect(history(page)).toContainText('No changes')
    await history(page).locator(`a[href*="publication=${noChange.publicationId}"]`).click()
    await expect(page.getByRole('region', { name: 'Publication changes' })).toContainText('No row or field changes.')
    const counters = await metrics(request); expect(counters.writes).toBe(0); expect(counters.aiCalls).toBe(0)
  })

  test('staff cannot open Roxy Dashboard directly, while the configured Roxy staff account can', async ({ page }) => {
    await page.goto('/dashboard/roxy'); await expect(page).toHaveURL(/\/login/)
    await login(page); await page.goto('/dashboard/roxy'); await expect(page).toHaveURL(/denied=roxy-dashboard/)
    await page.context().clearCookies(); await login(page, 'rg408-roxy'); await page.goto('/dashboard/roxy')
    await expect(page.getByRole('heading', { name: 'Roxy Dashboard' })).toBeVisible()
    await expect(page.locator('#navigation-group-dashboard').getByRole('link', { name: 'Roxy Dashboard' })).toHaveAttribute('aria-current', 'page')
    await page.goto('/admin/job-progress?days=30'); await expect(page).toHaveURL(/\/dashboard\/roxy\?days=30/)
  })

  test('Admin access and old quote overview URLs retain their destination and filters', async ({ page, request }) => {
    await login(page, 'rg408-admin'); await page.goto('/dashboard/roxy')
    await expect(page.getByRole('heading', { name: 'Roxy Dashboard' })).toBeVisible()
    await page.goto('/quote-tracker/overview?trackedIn=14&activityPage=2')
    await expect(page).toHaveURL(/\/dashboard\/quotes\?trackedIn=14&activityPage=2/)
    await expect(page.getByRole('heading', { name: 'Tracked quote activity' })).toBeVisible()
    const counters = await metrics(request); expect(counters.writes).toBe(0); expect(counters.aiCalls).toBe(0)
  })
})
