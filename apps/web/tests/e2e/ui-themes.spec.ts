import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const e2eUser = process.env.E2E_USERNAME;
const e2ePassword = process.env.E2E_PASSWORD;
const screenshotDirectory = path.resolve(
  process.cwd(),
  "output/playwright/mt-200",
);

test.skip(
  !e2eUser || !e2ePassword,
  "MT-200 theme screenshots require E2E_USERNAME and E2E_PASSWORD.",
);

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(e2eUser!);
  await page.getByLabel("Password").fill(e2ePassword!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 45_000 });
  await expect(page.getByRole("button", { name: /^sign out$/i })).toBeVisible({
    timeout: 15_000,
  });
}

async function chooseTheme(page: Page, theme: "Light" | "Dark") {
  await page.getByRole("button", { name: theme, exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    theme.toLowerCase(),
  );
}

async function findWorkOrderDetailPath(page: Page) {
  await page.goto("/work-orders");
  const detailLink = page
    .locator('main a[href^="/work-orders/"]:not([href="/work-orders/guide"])')
    .first();
  if (!(await detailLink.count())) return undefined;
  return detailLink.getAttribute("href");
}

test.describe("Royal Glass Precision themes", () => {
  test.beforeEach(async ({ page }) => {
    mkdirSync(screenshotDirectory, { recursive: true });
    await login(page);
  });

  test("captures matching Light and Dark reference screens", async ({
    page,
  }) => {
    const workOrderPath = await findWorkOrderDetailPath(page);
    test.skip(
      !workOrderPath,
      "MT-200 Work Order detail screenshot requires at least one visible work order.",
    );

    const screens = [
      { name: "dashboard", path: "/" },
      { name: "leads", path: "/leads" },
      { name: "work-order-detail", path: workOrderPath! },
    ];

    for (const theme of ["Light", "Dark"] as const) {
      for (const screen of screens) {
        await page.goto(screen.path);
        await chooseTheme(page, theme);
        await expect(page.locator("main")).toBeVisible();
        await page.screenshot({
          path: path.join(
            screenshotDirectory,
            `${screen.name}-${theme.toLowerCase()}.png`,
          ),
          fullPage: true,
        });
      }
    }
  });

  test("keeps the mobile shell navigable without viewport overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const openNavigation = page.getByRole("button", {
      name: "Open navigation",
    });
    await openNavigation.click();
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
    await chooseTheme(page, "Dark");

    const leadsLink = page.getByRole("link", { name: "Leads", exact: true });
    await expect(leadsLink).toBeVisible();
    await leadsLink.click();
    await expect(page).toHaveURL(/\/leads(?:\?|$)/);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);

    await openNavigation.click();
    await page.keyboard.press("Escape");
    await expect(openNavigation).toHaveAttribute("aria-expanded", "false");
    await page.screenshot({
      path: path.join(screenshotDirectory, "leads-dark-mobile.png"),
      fullPage: true,
    });
  });

  test("shows keyboard focus and honours reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.keyboard.press("Tab");

    const focusedElement = page.locator(":focus");
    await expect(focusedElement).toBeVisible();
    const focusStyle = await focusedElement.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    expect(focusStyle.outlineStyle).not.toBe("none");
    expect(focusStyle.outlineWidth).not.toBe("0px");

    const transitionDuration = await page
      .locator("aside")
      .evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.00001);
  });
});
