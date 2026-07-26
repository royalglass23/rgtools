import { createServer, type Server } from "node:http";
import { hash } from "bcryptjs";
import { neon } from "@neondatabase/serverless";
import { expect, test, type Page } from "@playwright/test";
import {
  readE2eDatabaseProof,
  verifyIsolatedE2eDatabase,
} from "./e2e-database-safety";

const isolatedDatabaseUrl = process.env.E2E_DATABASE_URL;
const expectedDatabaseSentinel = process.env.E2E_DATABASE_SENTINEL;
const enabled = process.env.E2E_QUOTE_MOVEMENT === "true";
const adapterPort = Number(process.env.E2E_ADAPTER_PORT ?? 32199);
const runId = crypto.randomUUID();
const userId = crypto.randomUUID();
const recordId = crypto.randomUUID();
const username = `mt224-${runId.slice(0, 8)}`;
const loginSecret = crypto.randomUUID();
const jobNumber = `MT224-${runId.slice(0, 8)}`;
const rawProviderBody = ["provider", "cursor", runId].join("-");
let adapterServer: Server | null = null;
let previousQuoteTrackerModule: {
  name: string;
  adminOnly: boolean;
  isActive: boolean;
} | null = null;

test.describe("MT-224 Quote Movement refresh resilience", () => {
  test.skip(
    !enabled || !isolatedDatabaseUrl,
    "Set E2E_QUOTE_MOVEMENT=true and a sentinel-protected E2E_DATABASE_URL.",
  );
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    if (!isolatedDatabaseUrl) return;
    const sql = neon(isolatedDatabaseUrl);
    await verifyIsolatedE2eDatabase({
      expectedSentinel: expectedDatabaseSentinel,
      purpose: "MT-224 Quote Movement browser evidence",
      readProof: () =>
        readE2eDatabaseProof(
          (statement) =>
            sql.query(statement) as Promise<
              Array<{ databaseName: string; sentinel: string | null }>
            >,
        ),
    });

    const modules = (await sql`
      SELECT name, admin_only AS "adminOnly", is_active AS "isActive"
      FROM modules
      WHERE slug = 'quote-tracker'
      LIMIT 1
    `) as typeof previousQuoteTrackerModule[];
    previousQuoteTrackerModule = modules[0] ?? null;

    await sql`
      INSERT INTO users (id, username, password_hash, role, is_protected)
      VALUES (${userId}::uuid, ${username}, ${await hash(loginSecret, 12)}, 'admin', true)
    `;
    await sql`
      INSERT INTO modules (slug, name, admin_only, is_active)
      VALUES ('quote-tracker', 'Quote Tracker', false, true)
      ON CONFLICT (slug) DO UPDATE SET is_active = true
    `;
    await sql`DELETE FROM quote_movement_refresh_locks WHERE lock_name = 'quote-movement-refresh'`;
    await sql`
      INSERT INTO quote_movement_records (
        id,
        servicem8_job_uuid,
        servicem8_status,
        servicem8_active,
        job_number,
        customer_name,
        job_address,
        quote_value_excluding_gst,
        source_coverage,
        source_discovered_count,
        source_unread_count,
        source_failed_count,
        source_coverage_details,
        summary_last_attempted_at,
        summary_last_error,
        last_servicem8_synced_at
      ) VALUES (
        ${recordId}::uuid,
        ${`job-${runId}`},
        'Quote',
        true,
        ${jobNumber},
        'MT-224 Cached Customer',
        '24 Glass Lane, Auckland',
        '2400.00',
        'incomplete',
        1,
        1,
        1,
        '["1 source could not be interpreted."]'::jsonb,
        now(),
        'What Matters Now could not update. No summary is available yet; cached quote data was kept.',
        now() - interval '30 minutes'
      )
    `;

    adapterServer = createControlledFailureServer();
    await new Promise<void>((resolve, reject) => {
      adapterServer?.once("error", reject);
      adapterServer?.listen(adapterPort, "127.0.0.1", resolve);
    });
  });

  test.afterAll(async () => {
    if (adapterServer) {
      await new Promise<void>((resolve, reject) =>
        adapterServer?.close((error) => (error ? reject(error) : resolve())),
      );
    }
    if (!isolatedDatabaseUrl) return;
    const sql = neon(isolatedDatabaseUrl);
    await sql`DELETE FROM quote_movement_records WHERE id = ${recordId}::uuid`;
    await sql`DELETE FROM quote_movement_refresh_runs WHERE actor_id = ${userId}::uuid`;
    await sql`DELETE FROM quote_movement_refresh_locks WHERE lock_name = 'quote-movement-refresh'`;
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`;
    if (previousQuoteTrackerModule) {
      await sql`
        UPDATE modules
        SET
          name = ${previousQuoteTrackerModule.name},
          admin_only = ${previousQuoteTrackerModule.adminOnly},
          is_active = ${previousQuoteTrackerModule.isActive}
        WHERE slug = 'quote-tracker'
      `;
    } else {
      await sql`DELETE FROM modules WHERE slug = 'quote-tracker'`;
    }
  });

  test("keeps cached list and detail usable through pending and provider failure states", async ({
    page,
  }) => {
    await login(page);

    const listStartedAt = Date.now();
    await page.goto("/quote-movement");
    await expect(page.getByRole("heading", { name: "Quote Movement" })).toBeVisible();
    await expect(page.getByText("MT-224 Cached Customer")).toBeVisible();
    expect(Date.now() - listStartedAt).toBeLessThan(10_000);

    await page.getByLabel("Job number to fetch").fill(jobNumber);
    await page.getByRole("button", { name: "Fetch jobs" }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: "Fetch jobs" })).toBeVisible();
    await expect(page.getByText("MT-224 Cached Customer")).toBeVisible();
    await expect(page.getByText(/Cached data may be out of date/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("MT-224 Cached Customer")).toBeVisible();
    await expect(page.getByText(rawProviderBody)).toHaveCount(0);

    await page.getByRole("link", { name: jobNumber }).click();
    await expect(page).toHaveURL(new RegExp(`/quote-movement/${recordId}$`));
    await expect(page.getByText("MT-224 Cached Customer")).toBeVisible();
    await expect(page.getByText("Incomplete Source Coverage")).toBeVisible();
    await expect(page.getByText("1 unread source")).toBeVisible();
    await expect(page.getByText(/What Matters Now could not update/)).toBeVisible();
    await expect(page.getByText(/Not yet summarised/)).toBeVisible();
    await expect(page.getByText(rawProviderBody)).toHaveCount(0);
  });
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(loginSecret);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

function createControlledFailureServer() {
  return createServer(async (request, response) => {
    const path = new URL(
      request.url ?? "/",
      `http://127.0.0.1:${adapterPort}`,
    ).pathname;
    if (path === "/api_1.0/job.json") {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: rawProviderBody }));
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end("[]");
  });
}
