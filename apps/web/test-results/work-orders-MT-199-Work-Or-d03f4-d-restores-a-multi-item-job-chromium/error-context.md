# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: work-orders.spec.ts >> MT-199 Work Order Items release acceptance >> refreshes, edits, filters, exports, removes and restores a multi-item job
- Location: tests\e2e\work-orders.spec.ts:172:7

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByText('Affected item: SHOWER-001 - Manual MT199 shower label')
Expected: 2
Received: 5
Timeout:  10000ms

Call log:
  - Expect "toHaveCount" with timeout 10000ms
  - waiting for getByText('Affected item: SHOWER-001 - Manual MT199 shower label')
    23 × locator resolved to 5 elements
       - unexpected value "5"

```

# Test source

```ts
  178 |     await expect(page.getByRole('group', { name: 'Work Order filter utilities' })).toBeVisible()
  179 |     const accessibilityScan = await new AxeBuilder({ page })
  180 |       .include('main')
  181 |       .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  182 |       .analyze()
  183 |     console.log(`MT199_A11Y violations=${accessibilityScan.violations.length}`)
  184 |     expect(
  185 |       accessibilityScan.violations,
  186 |       JSON.stringify(accessibilityScan.violations, null, 2),
  187 |     ).toEqual([])
  188 | 
  189 |     const primaryGroup = page.getByRole('group', { name: `Work Order ${primaryJobNumber}` })
  190 |     const secondaryGroup = page.getByRole('group', { name: `Work Order ${secondaryJobNumber}` })
  191 |     await expect(primaryGroup).toBeVisible()
  192 |     await expect(secondaryGroup).toBeVisible()
  193 |     const jobGroups = page.locator('section[aria-label^="Work Order MT199-"]')
  194 |     await expect(jobGroups.nth(0)).toHaveAttribute('aria-label', `Work Order ${primaryJobNumber}`)
  195 | 
  196 |     const primaryRows = primaryGroup.getByRole('row')
  197 |     await expect(primaryRows).toHaveCount(2)
  198 |     const firstItem = primaryRows.filter({ hasText: 'SHOWER-001' })
  199 |     await expect(firstItem).toContainText('Qty 2')
  200 |     await expect(firstItem).toContainText('SHOWER-001')
  201 |     await expect(firstItem.getByLabel('Short label for SHOWER-001')).toHaveValue(primaryShowerDescription)
  202 |     await expect(firstItem).toHaveAttribute('title', /Supply and install frameless shower screen[\s\S]*Line total excluding GST: \$2501\.00/)
  203 | 
  204 |     await prepareExistingItemRolloutFixture()
  205 |     await page.reload()
  206 |     const rolloutPanel = page.getByRole('region', { name: 'Existing-item enrichment' })
  207 |     await rolloutPanel.getByRole('button', { name: 'Start existing-item enrichment' }).click()
  208 |     await expect(rolloutPanel).toContainText('Rollout running.')
  209 |     await expect(rolloutPanel.locator('[data-count="total"]')).toHaveText('1')
  210 |     await expect(rolloutPanel.locator('[data-count="queued"]')).toHaveText('1')
  211 |     const rolloutRunId = await failLatestExistingItemRollout()
  212 |     createdRolloutRunIds.add(rolloutRunId)
  213 |     await expect(rolloutPanel).toContainText('Rollout failed.', { timeout: 15_000 })
  214 |     await expect(rolloutPanel.locator('[data-count="failed"]')).toHaveText('1')
  215 |     await rolloutPanel.getByRole('button', { name: 'Resume failed enrichment' }).click()
  216 |     await expect(rolloutPanel).toContainText('Rollout running.')
  217 |     await expect(rolloutPanel.locator('[data-count="queued"]')).toHaveText('1')
  218 |     await expect(rolloutPanel.locator('[data-count="retried"]')).toHaveText('1')
  219 | 
  220 |     await seedConfirmedChromeProductionSpecification()
  221 |     await page.reload()
  222 |     await openProductionSpecification(firstItem)
  223 |     await firstItem.getByRole('button', { name: 'Change specification' }).click()
  224 |     await firstItem.getByLabel('Hardware/Fittings Finish for SHOWER-001').selectOption('finish.matte-black')
  225 |     await firstItem.getByLabel('Change reason').selectOption('client_request')
  226 |     await firstItem.getByLabel('Change note (optional)').fill('Client approved Matte Black.')
  227 |     await firstItem.getByRole('button', { name: 'Confirm specification' }).click()
  228 |     await expect(firstItem.getByText('Specification confirmed')).toBeVisible({ timeout: 30_000 })
  229 | 
  230 |     await page.reload()
  231 |     await expect(firstItem.getByLabel('Short label for SHOWER-001')).toHaveValue(/Matte Black/)
  232 |     await openProductionSpecification(firstItem)
  233 |     await expect(firstItem.getByText(/Client request/)).toBeVisible()
  234 |     await expect(firstItem.getByText('Hardware/Fittings Finish: Chrome → Matte Black')).toBeVisible()
  235 | 
  236 |     primaryShowerDescription = 'ServiceM8 revised shower description with new Matte Black source wording'
  237 |     await refreshWorkOrders(page)
  238 |     await expect(firstItem.getByText('Source Changed')).toBeVisible()
  239 |     await openProductionSpecification(firstItem)
  240 |     await firstItem.getByText('Compare ServiceM8 source').click()
  241 |     await expect(
  242 |       firstItem.getByLabel('Current ServiceM8 source').getByText(primaryShowerDescription),
  243 |     ).toBeVisible()
  244 |     await firstItem.getByRole('button', { name: 'Ignore source change' }).click()
  245 |     await expect(firstItem.getByText('Source Changed')).toHaveCount(0)
  246 | 
  247 |     primaryShowerDescription = 'ServiceM8 second revision requiring a reviewable draft'
  248 |     await refreshWorkOrders(page)
  249 |     await expect(firstItem.getByText('Source Changed')).toBeVisible()
  250 |     await openProductionSpecification(firstItem)
  251 |     await firstItem.getByText('Compare ServiceM8 source').click()
  252 |     await firstItem.getByRole('button', { name: 'Create new draft' }).click()
  253 |     await expect(firstItem.getByText('Review and correct draft')).toBeVisible()
  254 |     await expect(firstItem.getByText('Confirmed', { exact: true })).toBeVisible()
  255 | 
  256 |     const manualLabel = 'Manual MT199 shower label'
  257 |     await firstItem.getByLabel('Short label for SHOWER-001').fill(manualLabel)
  258 |     await firstItem.getByRole('button', { name: 'Save label' }).click()
  259 |     await expect(firstItem.getByText('Saved')).toBeVisible()
  260 |     await firstItem.getByLabel('Risk for SHOWER-001').selectOption('high')
  261 |     await expect(firstItem.getByText('Saved')).toHaveCount(2)
  262 | 
  263 |     await page.reload()
  264 |     await expect(primaryGroup.getByLabel('Short label for SHOWER-001')).toHaveValue(manualLabel)
  265 |     await expect(primaryGroup.getByLabel('Risk for SHOWER-001')).toHaveValue('high')
  266 | 
  267 |     const detailLink = primaryGroup.getByRole('link', { name: primaryJobNumber })
  268 |     await detailLink.focus()
  269 |     await expect(detailLink).toBeFocused()
  270 |     const detailHref = await detailLink.getAttribute('href')
  271 |     expect(detailHref).toMatch(/^\/work-orders\/[0-9a-f-]+$/)
  272 |     const detailWarmup = await page.request.get(detailHref!)
  273 |     expect(detailWarmup.ok()).toBe(true)
  274 |     await detailLink.click()
  275 |     await expect(page).toHaveURL(/\/work-orders\/[0-9a-f-]+$/, { timeout: 30_000 })
  276 |     await expect(page.getByText('Item Label Manually Updated')).toBeVisible({ timeout: 30_000 })
  277 |     await expect(page.getByText('Item Risk Changed')).toBeVisible()
> 278 |     await expect(page.getByText(`Affected item: SHOWER-001 - ${manualLabel}`)).toHaveCount(2)
      |                                                                                ^ Error: expect(locator).toHaveCount(expected) failed
  279 |     await page.goto('/work-orders')
  280 | 
  281 |     await page.getByLabel('Risk', { exact: true }).selectOption('high')
  282 |     await expect(page).toHaveURL(/risk=high/)
  283 |     await expect(primaryGroup).toContainText('1 of 2 active items')
  284 |     await expect(primaryGroup.getByRole('row')).toHaveCount(1)
  285 |     await page.getByRole('link', { name: 'Reset' }).click()
  286 |     await expect(primaryGroup.getByRole('row')).toHaveCount(2)
  287 |     await expect(primaryGroup.getByText('Apply to all active items')).toHaveCount(0)
  288 | 
  289 |     const exportStartedAt = Date.now()
  290 |     const downloadPromise = page.waitForEvent('download')
  291 |     await page.getByRole('link', { name: 'Export CSV' }).click()
  292 |     const csv = await readDownload(await downloadPromise)
  293 |     const exportDurationMs = Date.now() - exportStartedAt
  294 |     console.log(`MT199_PERF export_csv_ms=${exportDurationMs}`)
  295 |     expect(exportDurationMs).toBeLessThan(10_000)
  296 |     expect(csv).toContain(`"${primaryJobNumber}"`)
  297 |     expect(csv).toContain(`"${manualLabel}"`)
  298 |     expect(csv.match(new RegExp(primaryJobNumber, 'g'))).toHaveLength(2)
  299 | 
  300 |     primaryJobIsCurrent = false
  301 |     await refreshWorkOrders(page)
  302 |     await expect(primaryGroup).toHaveCount(0)
  303 |     await expect(secondaryGroup).toBeVisible()
  304 | 
  305 |     primaryJobIsCurrent = true
  306 |     await refreshWorkOrders(page)
  307 |     await expect(primaryGroup.getByRole('row')).toHaveCount(2)
  308 |     await expect(primaryGroup.getByLabel('Short label for SHOWER-001')).toHaveValue(manualLabel)
  309 |     await expect(primaryGroup.getByLabel('Risk for SHOWER-001')).toHaveValue('high')
  310 |   })
  311 | })
  312 | 
  313 | async function login(page: Page) {
  314 |   await page.goto('/login')
  315 |   await page.getByLabel('Username').fill(username)
  316 |   await page.getByLabel('Password').fill(password)
  317 |   await page.getByRole('button', { name: /^sign in$/i }).click()
  318 |   await page.waitForURL((url) => !url.pathname.startsWith('/login'))
  319 | }
  320 | 
  321 | async function openProductionSpecification(item: Locator) {
  322 |   const details = item.locator('details').first()
  323 |   const isOpen = await details.evaluate((element) => (element as HTMLDetailsElement).open)
  324 |   if (!isOpen) {
  325 |     const summary = details.locator('summary').first()
  326 |     await summary.focus()
  327 |     await summary.press('Enter')
  328 |   }
  329 |   await expect(details).toHaveAttribute('open', '')
  330 | }
  331 | 
  332 | async function refreshWorkOrders(page: Page) {
  333 |   const refreshStartedAt = Date.now()
  334 |   await page.getByRole('button', { name: 'Refresh all jobs' }).click()
  335 |   await expect(page.getByRole('status').filter({ hasText: 'Last successful sync' })).toBeVisible()
  336 | 
  337 |   if (!isolatedDatabaseUrl) return
  338 |   const sql = neon(isolatedDatabaseUrl)
  339 |   let newRefreshRunIds: string[] = []
  340 |   await expect.poll(async () => {
  341 |     const refreshRuns = await sql`SELECT id FROM work_order_refresh_runs` as Array<{ id: string }>
  342 |     newRefreshRunIds = refreshRuns
  343 |       .map((refreshRun) => refreshRun.id)
  344 |       .filter((refreshRunId) => !knownRefreshRunIds.has(refreshRunId))
  345 |     return newRefreshRunIds.length
  346 |   }).toBeGreaterThan(0)
  347 | 
  348 |   for (const refreshRunId of newRefreshRunIds) {
  349 |     knownRefreshRunIds.add(refreshRunId)
  350 |     createdRefreshRunIds.add(refreshRunId)
  351 |   }
  352 |   await sql`
  353 |     DELETE FROM work_order_refresh_locks
  354 |     WHERE lock_name = ${`work-order-rate:refresh:${userId}`}
  355 |   `
  356 |   const refreshDurationMs = Date.now() - refreshStartedAt
  357 |   refreshMeasurementNumber += 1
  358 |   console.log(`MT199_PERF refresh_${refreshMeasurementNumber}_ms=${refreshDurationMs}`)
  359 |   expect(refreshDurationMs).toBeLessThan(30_000)
  360 | }
  361 | 
  362 | async function readDownload(download: Download) {
  363 |   const stream = await download.createReadStream()
  364 |   if (!stream) throw new Error('MT-199 CSV download did not provide a readable stream.')
  365 |   const chunks: Buffer[] = []
  366 |   for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  367 |   return Buffer.concat(chunks).toString('utf8')
  368 | }
  369 | 
  370 | async function prepareExistingItemRolloutFixture() {
  371 |   if (!isolatedDatabaseUrl) return
  372 |   const sql = neon(isolatedDatabaseUrl)
  373 |   await sql`
  374 |     DELETE FROM work_order_item_production_specifications
  375 |     WHERE work_order_item_id = (
  376 |       SELECT id FROM work_order_items WHERE servicem8_item_uuid = ${secondaryItemUuid} LIMIT 1
  377 |     )
  378 |   `
```