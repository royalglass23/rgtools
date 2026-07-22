# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: calculator-second-estimate.spec.mjs >> a customer can begin a second estimate after one successful submission
- Location: scratch\calculator-second-estimate.spec.mjs:3:1

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - heading "Get a Glass Estimate" [level=1] [ref=e5]
    - paragraph [ref=e6]: Answer a few questions, enter your details, and then view your indicative estimate.
  - generic [ref=e8]:
    - generic [ref=e9]: Step 1 of 8
    - generic [ref=e10]: 13%
  - generic [ref=e13]:
    - generic [ref=e14]:
      - generic [ref=e15]: "1"
      - heading "What's your project?" [level=2] [ref=e16]
    - generic [ref=e17]:
      - button "Ground Level Fence Ground Level Fence Outdoor area or pool — height ≤1m — standard residential" [ref=e18] [cursor=pointer]:
        - img "Ground Level Fence" [ref=e20]
        - generic [ref=e21]:
          - generic [ref=e23]: Ground Level Fence
          - paragraph [ref=e24]: Outdoor area or pool — height ≤1m — standard residential
      - button "Balcony / Patio Balustrade Balcony / Patio Balustrade Elevated deck, balcony or patio — height >1m (NZBC 1m minimum)" [ref=e25] [cursor=pointer]:
        - img "Balcony / Patio Balustrade" [ref=e27]
        - generic [ref=e28]:
          - generic [ref=e30]: Balcony / Patio Balustrade
          - paragraph [ref=e31]: Elevated deck, balcony or patio — height >1m (NZBC 1m minimum)
      - button "Premium Pool Fence Premium Pool Fence Pool barrier — NZ Pool Safety Act — 1.2m minimum height" [ref=e32] [cursor=pointer]:
        - img "Premium Pool Fence" [ref=e34]
        - generic [ref=e35]:
          - generic [ref=e37]: Premium Pool Fence
          - paragraph [ref=e38]: Pool barrier — NZ Pool Safety Act — 1.2m minimum height
      - button "Stair Balustrade Stair Balustrade Glass panels along stairs — NZBC stair safety code" [ref=e39] [cursor=pointer]:
        - img "Stair Balustrade" [ref=e41]
        - generic [ref=e42]:
          - generic [ref=e44]: Stair Balustrade
          - paragraph [ref=e45]: Glass panels along stairs — NZBC stair safety code
  - generic [ref=e46]:
    - button "Back" [disabled] [ref=e47]
    - button "Continue" [disabled] [ref=e48]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('a customer can begin a second estimate after one successful submission', async ({ page }) => {
  4  |   let leadRequests = 0;
  5  |   await page.route('**/wp-json/royal-glass/v1/pricing', (route) => route.fulfill({
  6  |     status: 200,
  7  |     contentType: 'application/json',
  8  |     body: JSON.stringify({}),
  9  |   }));
  10 | 
  11 |   await page.route('**/wp-json/royal-glass/v1/leads', (route) => {
  12 |     leadRequests += 1;
  13 |     return route.fulfill({
  14 |       status: 201,
  15 |       contentType: 'application/json',
  16 |       body: JSON.stringify({ ok: true, leadId: 999004 }),
  17 |     });
  18 |   });
  19 | 
  20 |   await page.goto('/');
  21 |   await page.getByText('Premium Pool Fence').first().click();
  22 |   for (let step = 0; step < 5; step += 1) {
  23 |     await page.getByRole('button', { name: /Continue/i }).click();
  24 |   }
  25 |   await page.getByText('Spigot Round').first().click();
  26 |   await page.getByRole('button', { name: /Continue/i }).click();
  27 |   await page.getByText('Concrete').first().click();
  28 |   await page.getByRole('button', { name: /Continue/i }).click();
  29 |   await page.getByText('Chrome').first().click();
  30 |   await page.getByRole('button', { name: /Continue/i }).click();
  31 | 
  32 |   await page.getByPlaceholder(/Sarah Johnson|Smith Builders/i).fill('Second Estimate Repro');
  33 |   await page.getByPlaceholder(/sarah@example.com/i).fill('repro@example.com');
  34 |   await page.getByPlaceholder(/021 123 4567/i).fill('021 123 4567');
  35 |   await page.getByText('Homeowner').first().click();
  36 |   await page.getByText('Just planning').first().click();
  37 |   await page.getByLabel('Project address').fill('123 Repro Street, Auckland');
  38 |   await page.getByLabel(/I agree Royal Glass may contact me/i).check();
  39 | 
  40 |   await page.waitForTimeout(3_100);
  41 |   await page.getByRole('button', { name: /Show my estimate/i }).click();
  42 |   await expect(page.getByText(/Your indicative estimate|Royal Glass estimate/i)).toBeVisible();
  43 |   expect(leadRequests).toBe(1);
  44 | 
  45 |   const startAgain = page.getByRole('button', { name: /new estimate|start again|another estimate/i });
  46 |   const startAgainCount = await startAgain.count();
  47 | 
  48 |   await page.reload();
  49 |   await expect(page.getByText('Premium Pool Fence').first()).toBeVisible();
> 50 |   expect(startAgainCount).toBeGreaterThan(0);
     |                           ^ Error: expect(received).toBeGreaterThan(expected)
  51 | });
  52 | 
```