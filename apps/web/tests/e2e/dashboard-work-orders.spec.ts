import { test, expect, type Page } from '@playwright/test'
import { readFileSync, unlinkSync, existsSync } from 'node:fs'
import path from 'node:path'
const fixtureUrl = process.env.RG406_ACCEPTANCE_URL
const enabled = fixtureUrl === 'http://127.0.0.1:55443'
const root = path.resolve(process.cwd(), '../../tmp/rg406')
async function login(page: Page, username: string) {
  const credentials = JSON.parse(readFileSync(path.join(root, 'credentials.json'), 'utf8'))
  await page.goto('/login')
  await page.getByLabel('Username', { exact: true }).fill(username)
  await page.getByLabel('Password', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('http://127.0.0.1:55443/', { timeout: 120000 })
}

test.describe('Work Orders dashboard on the named disposable fixture without a Google connection', () => {
  test.skip(!enabled, 'Requires the explicit disposable localhost RG406 acceptance URL; never a live target.')
  test('keeps exact columns and Refresh available when the source is not connected', async ({ page }) => {
    await login(page, 'rg406-staff')
    await page.goto('/dashboard/work-orders')
    const a = page.getByRole('region', { name: 'All Work Order rows', exact: true })
    const b = page.getByRole('region', { name: 'Due product rows', exact: true })
    await expect(page.getByRole('heading', { name: 'Table A - Every work order' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Table B - Due within 3 weeks' })).toBeVisible()
    await expect(a.getByRole('columnheader')).toHaveText(['WO', 'Customer', 'Short address', 'Approx install date', 'Within 3 weeks?'])
    await expect(b.getByRole('columnheader')).toHaveText(['WO / client / address', 'Materials (per product)', 'Client waiting for', 'Site ready', 'Glass ready', 'Hardware ready', 'Design Y/N/?', 'PS1 / PS3', 'Bottle strut', 'BC?', 'Minor var?'])
    await expect(a.locator('tbody tr')).toHaveCount(0)
    await expect(b.locator('tbody tr')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Save product/ })).toHaveCount(0)
    await expect(page.getByText('Kanban output could not load.', { exact: false })).toBeVisible()
    await expect(page.locator('details')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /View material description/ })).toHaveCount(0)
  })
  test('retains search and independent page-size controls', async ({ page }) => {
    await login(page, 'rg406-staff')
    await page.goto('/dashboard/work-orders?jobsSize=10&itemsSize=20')
    const sizes = page.getByRole('combobox', { name: 'Page size' })
    await expect(sizes.nth(0)).toHaveValue('10'); await expect(sizes.nth(1)).toHaveValue('20')
    await page.getByRole('searchbox').fill('COLUMN_RESET_NO_MATCH')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.getByText('No rows to display.')).toHaveCount(2)
    await expect(sizes.nth(0)).toHaveValue('10'); await expect(sizes.nth(1)).toHaveValue('20')
    await page.getByRole('link', { name: 'Clear search' }).click()
    await expect(page.getByRole('searchbox')).toHaveValue('')
    await expect(page.getByRole('table')).toHaveCount(2)
  })
  test('staff cannot open Roxy Dashboard directly, while the configured Roxy staff account can', async ({ page }) => {
    if (existsSync(path.join(root, 'source-fail'))) unlinkSync(path.join(root, 'source-fail'))
    await page.goto('/dashboard/roxy'); await expect(page).toHaveURL(/\/login/)
    await login(page, 'rg406-staff')
    await page.goto('/dashboard/roxy'); await expect(page).toHaveURL(/denied=roxy-dashboard/)
    await page.context().clearCookies(); await login(page, 'rg406-roxy')
    await page.goto('/dashboard/roxy')
    await expect(page.getByRole('heading', { name: 'Roxy Dashboard' })).toBeVisible()
    await expect(page.locator('#navigation-group-dashboard').getByRole('link', { name: 'Roxy Dashboard' })).toHaveAttribute('aria-current', 'page')
    await page.goto('/admin/job-progress?days=30')
    await expect(page).toHaveURL(/\/dashboard\/roxy\?days=30/)
  })
  test('Admin access and old quote overview URLs retain their destination and filters', async ({ page }) => {
    await login(page, 'rg406-admin')
    await page.goto('/dashboard/roxy'); await expect(page.getByRole('heading', { name: 'Roxy Dashboard' })).toBeVisible()
    await page.goto('/quote-tracker/overview?trackedIn=14&activityPage=2')
    await expect(page).toHaveURL(/\/dashboard\/quotes\?trackedIn=14&activityPage=2/)
    await expect(page.getByRole('heading', { name: 'Tracked quote activity' })).toBeVisible()
  })
})
