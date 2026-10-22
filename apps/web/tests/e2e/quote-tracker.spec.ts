import { expect, test, type Page } from '@playwright/test'

const e2eUser = process.env.E2E_USERNAME ?? 'rgadmin'
const e2ePassword = process.env.E2E_PASSWORD ?? '*royalglass23'
const safeQuoteId = process.env.E2E_TEST_QUOTE_ID

async function gotoWithRetry(page: Page, path: string) {
  let lastError: unknown
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      await page.goto(path, { timeout: 5_000 })
      return
    } catch (error) {
      if (error instanceof Error && error.message.includes('ERR_ABORTED')) {
        return
      }
      if (!(error instanceof Error) || !error.message.includes('ERR_CONNECTION_REFUSED')) {
        throw error
      }
      lastError = error
      await page.waitForTimeout(1_000)
    }
  }
  throw lastError
}

async function login(page: Page) {
  await gotoWithRetry(page, '/login')
  await page.getByLabel('Username').fill(e2eUser)
  await page.getByLabel('Password').fill(e2ePassword)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000, waitUntil: 'commit' })
}

async function expectNoCriticalBrowserErrors(page: Page, action: () => Promise<void>) {
  const consoleErrors: string[] = []
  const failedCriticalRequests: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('response', (response) => {
    const request = response.request()
    if (
      response.status() >= 500 &&
      ['document', 'fetch', 'xhr'].includes(request.resourceType())
    ) {
      failedCriticalRequests.push(`${response.status()} ${request.method()} ${response.url()}`)
    }
  })

  await action()

  expect(failedCriticalRequests, 'failed critical network requests').toEqual([])
  expect(consoleErrors, 'browser console errors').toEqual([])
}

test.describe('quote tracker', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('Quotes opens tracked activity while its submenu remains accessible', async ({ page }) => {
    test.setTimeout(150_000)
    await page.goto('/quote-tracker')
    await page.getByRole('link', { name: 'Quotes', exact: true }).click()
    await expect(page).toHaveURL(/\/quote-tracker\/overview$/, { timeout: 60_000 })
    await expect(page.getByRole('heading', { name: 'Tracked quote activity' })).toBeVisible()
    await expect(page.getByText('Viewed in the last 30 days')).toBeVisible()
    const activitySize = page.getByRole('combobox', { name: 'Recent activity rows per page' })
    const attentionSize = page.getByRole('combobox', { name: 'Needs attention rows per page' })
    await expect(activitySize).toHaveValue('5')
    await expect(attentionSize).toHaveValue('5')
    await activitySize.selectOption('10')
    await activitySize.locator('xpath=ancestor::form').getByRole('button', { name: 'Apply' }).click()
    await expect(page).toHaveURL(/activitySize=10/)
    await attentionSize.selectOption('20')
    await attentionSize.locator('xpath=ancestor::form').getByRole('button', { name: 'Apply' }).click()
    await expect(page).toHaveURL(/activitySize=10.*attentionSize=20/)
    const activitySection = page.locator('details').filter({ has: page.getByRole('heading', { name: 'Recent activity' }) })
    const attentionSection = page.locator('details').filter({ has: page.getByRole('heading', { name: 'Needs attention' }) })
    await expect(activitySection).toHaveAttribute('open', '')
    await expect(attentionSection).toHaveAttribute('open', '')
    await activitySection.locator('summary').click()
    await expect(activitySection).not.toHaveAttribute('open')
    await expect(attentionSection).toHaveAttribute('open', '')
    await activitySection.locator('summary').press('Enter')
    await expect(activitySection).toHaveAttribute('open', '')
    const submenuToggle = page.getByRole('button', { name: /Quotes submenu/ })
    await expect(submenuToggle).toHaveAttribute('aria-expanded', 'true')
    await submenuToggle.click()
    await expect(submenuToggle).toHaveAttribute('aria-expanded', 'false')
    await submenuToggle.click()
    await expect(page.getByRole('link', { name: 'Quote Movement' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Track Quotes' }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Collapse navigation' }).click()
    await expect(page.getByRole('link', { name: 'Quotes', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Expand Quotes submenu' }).click()
    await expect(page.getByRole('link', { name: 'Quote Movement' })).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await expect(page.getByRole('link', { name: 'Quotes', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Quotes submenu/ })).toBeVisible()
  })

  test('loads with primary content and no critical browser errors', async ({ page }) => {
    await expectNoCriticalBrowserErrors(page, async () => {
      await page.goto('/quote-tracker')
      await expect(page.getByRole('heading', { name: 'Quote Tracker' })).toBeVisible()
    })

    await expect(page.getByText('Hot quotes')).toBeVisible()
    await expect(page.getByText('Warm quotes')).toBeVisible()
    await expect(page.getByText('Cold quotes')).toBeVisible()
    await expect(page.getByText('Total value')).toBeVisible()
    await expect(page.getByLabel('Search')).toBeVisible()
    await expect(page.getByLabel('Status', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Link status', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Sort')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Track Quote' })).toBeVisible()

    const table = page.getByRole('table')
    await expect(table).toBeVisible()
    for (const heading of [
      'Client',
      'Job address',
      'Value',
      'Status',
      'Interest',
      'Opens',
      'Last opened',
      'Link status',
      'Link',
    ]) {
      await expect(table.getByRole('columnheader', { name: heading, exact: true })).toBeVisible()
    }
  })

  test('search can show no-result state and reset back to defaults', async ({ page }) => {
    await page.goto('/quote-tracker')

    await page.getByLabel('Search').fill('__no_quote_tracker_result__')
    await page.getByRole('button', { name: 'Apply' }).click()

    await expect(page).toHaveURL(/search=__no_quote_tracker_result__/)
    await expect(page.getByText('No tracked quotes yet. Use the Track Quote button to create one.')).toBeVisible()

    await page.getByRole('link', { name: 'Reset' }).click()
    await expect(page).toHaveURL(/\/quote-tracker(?:\?|$)/)
    await expect(page.getByLabel('Search')).toHaveValue('')
  })

  test('filters and sorting update the route query string', async ({ page }) => {
    await page.goto('/quote-tracker')

    await page.getByLabel('Status', { exact: true }).selectOption('hot')
    await expect(page).toHaveURL(/status=hot/)
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Link status', { exact: true }).selectOption('all')
    await expect(page).toHaveURL(/linkStatus=all/)
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Sort').selectOption('value_desc')
    await expect(page).toHaveURL(/sort=value_desc/)
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Page size').selectOption('10')
    await expect(page).toHaveURL(/size=10/)
    await expect(page.getByRole('table')).toBeVisible()
  })

  test('opens and cancels the Track Quote dialog without creating data', async ({ page }) => {
    await page.goto('/quote-tracker')

    await page.getByRole('button', { name: 'Track Quote' }).click()
    await expect(page.getByRole('dialog', { name: 'Track a quote' })).toBeVisible()
    await expect(page.getByLabel('Job ID')).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog', { name: 'Track a quote' })).toBeHidden()
  })

  test('opens quote detail from the first visible row when data exists', async ({ page }) => {
    await page.goto('/quote-tracker?linkStatus=all&size=10')

    const emptyState = page.getByText('No tracked quotes yet. Use the Track Quote button to create one.')
    test.skip(await emptyState.isVisible(), 'No tracked quotes exist in this environment.')

    const firstClientLink = page.getByRole('table').getByRole('link').first()
    await firstClientLink.click()

    await expect(page).toHaveURL(/\/quote-tracker\/[0-9a-f-]+/i)
    await expect(page.getByRole('link', { name: 'Back to quote tracker' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Quote' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Engagement' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Viewers' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Manual Status Override' })).toBeVisible()
  })

  test('canceling Expire confirmation leaves the active quote unchanged', async ({ page }) => {
    await page.goto(safeQuoteId ? `/quote-tracker/${safeQuoteId}` : '/quote-tracker?linkStatus=all&size=10')

    if (!safeQuoteId) {
      const emptyState = page.getByText('No tracked quotes yet. Use the Track Quote button to create one.')
      test.skip(await emptyState.isVisible(), 'No tracked quotes exist in this environment.')
      await page.getByRole('table').getByRole('link').first().click()
    }

    const expireButton = page.getByRole('button', { name: /^Expire$/ })
    test.skip(!(await expireButton.isVisible()), 'No active expirable link is visible for this quote.')

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Expire this link?')
      await dialog.dismiss()
    })
    await expireButton.click()
    await expect(expireButton).toBeVisible()
  })

  test('shows email-gate validation for invalid recipient email on a safe test quote', async ({ page }) => {
    test.skip(!safeQuoteId, 'Set E2E_TEST_QUOTE_ID to run safe mutation/validation checks.')

    await page.goto(`/quote-tracker/${safeQuoteId}`)
    const emailGate = page.getByLabel('Email gate')
    if (!(await emailGate.isChecked())) {
      await emailGate.check()
    }

    await page.getByLabel('Recipient emails').fill('not-an-email')
    await page.getByRole('button', { name: 'Save gate' }).click()

    await expect(page.getByText('Enter valid recipient email addresses.')).toBeVisible()
  })

  test('manual status update persists and can be reverted on a safe test quote', async ({ page }) => {
    test.skip(!safeQuoteId, 'Set E2E_TEST_QUOTE_ID to run safe mutation checks.')

    await page.goto(`/quote-tracker/${safeQuoteId}`)
    const status = page.getByLabel('Status').last()
    const original = await status.inputValue()
    const next = original === 'hot' ? 'warm' : 'hot'

    await status.selectOption(next)
    await page.getByRole('button', { name: /^Save$/ }).click()
    await page.reload()
    await expect(status).toHaveValue(next)

    await status.selectOption(original)
    await page.getByRole('button', { name: /^Save$/ }).click()
    await page.reload()
    await expect(status).toHaveValue(original)
  })

  test('redirects logged-out users to login', async ({ page }) => {
    test.skip(true, 'Skipped locally: fresh logged-out contexts intermittently cannot reach the Next dev webServer. Verify manually or enable once webServer startup is stabilized.')

    await page.context().clearCookies()
    await gotoWithRetry(page, '/quote-tracker')

    await expect(page).toHaveURL(/\/login(?:\?|$)/)
    await expect(page.getByRole('heading', { name: 'rgtools' })).toBeVisible()
  })
})

test.describe('quote tracker responsive', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('mobile viewport keeps core controls usable without body overflow', async ({ page }) => {
    test.fail(true, 'Known bug: the quote tracker table/layout causes body-level horizontal overflow on mobile.')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/quote-tracker')

    await expect(page.getByRole('heading', { name: 'Quote Tracker' })).toBeVisible()
    await expect(page.getByLabel('Search')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Track Quote' })).toBeVisible()

    const hasBodyOverflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth)
    expect(hasBodyOverflow, 'body-level horizontal overflow').toBe(false)
  })
})
