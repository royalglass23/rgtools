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
const enabled = process.env.E2E_QUOTE_MOVEMENT_V1 === "true";
const adapterPort = Number(process.env.E2E_ADAPTER_PORT ?? 32199);
const runId = crypto.randomUUID();
const grantedUserId = crypto.randomUUID();
const ungrantedUserId = crypto.randomUUID();
const completeRecordId = crypto.randomUUID();
const incompleteRecordId = crypto.randomUUID();
const convertedRecordId = crypto.randomUUID();
const workOrderId = crypto.randomUUID();
const grantedUsername = `mt225-granted-${runId.slice(0, 8)}`;
const ungrantedUsername = `mt225-ungranted-${runId.slice(0, 8)}`;
const grantedPassword = crypto.randomUUID();
const ungrantedPassword = crypto.randomUUID();
const completeJobNumber = `MT225-A-${runId.slice(0, 6)}`;
const incompleteJobNumber = `MT225-B-${runId.slice(0, 6)}`;
const convertedJobNumber = `MT225-C-${runId.slice(0, 6)}`;
const completeJobUuid = `mt225-complete-${runId}`;
const convertedJobUuid = `mt225-converted-${runId}`;
let adapterServer: Server | null = null;
let previousQuoteTrackerModule: {
  name: string;
  adminOnly: boolean;
  isActive: boolean;
} | null = null;

test.describe("MT-225 secured Quote Movement V1 journey", () => {
  test.skip(
    !enabled || !isolatedDatabaseUrl,
    "Set E2E_QUOTE_MOVEMENT_V1=true and a sentinel-protected E2E_DATABASE_URL.",
  );
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    if (!isolatedDatabaseUrl) return;
    const sql = neon(isolatedDatabaseUrl);
    await verifyIsolatedE2eDatabase({
      expectedSentinel: expectedDatabaseSentinel,
      purpose: "MT-225 Quote Movement V1 browser acceptance",
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
    `) as (typeof previousQuoteTrackerModule)[];
    previousQuoteTrackerModule = modules[0] ?? null;

    await sql`
      INSERT INTO users (id, username, password_hash, role, is_protected)
      VALUES
        (${grantedUserId}::uuid, ${grantedUsername}, ${await hash(grantedPassword, 12)}, 'staff', true),
        (${ungrantedUserId}::uuid, ${ungrantedUsername}, ${await hash(ungrantedPassword, 12)}, 'staff', true)
    `;
    await sql`
      INSERT INTO modules (slug, name, admin_only, is_active)
      VALUES ('quote-tracker', 'Quote Tracker', false, true)
      ON CONFLICT (slug) DO UPDATE SET admin_only = false, is_active = true
    `;
    await sql`
      INSERT INTO user_module_access (user_id, module_id, granted_by)
      SELECT ${grantedUserId}::uuid, id, ${grantedUserId}::uuid
      FROM modules
      WHERE slug = 'quote-tracker'
    `;
    await sql`
      DELETE FROM quote_movement_source_enrichment
      WHERE source_id IN (
        SELECT qms.id
        FROM quote_movement_sources qms
        INNER JOIN quote_movement_records qmr
          ON qmr.id = qms.quote_movement_record_id
        WHERE qmr.job_number LIKE 'MT225-%'
      )
    `;
    await sql`
      DELETE FROM quote_movement_sources
      WHERE quote_movement_record_id IN (
        SELECT id FROM quote_movement_records WHERE job_number LIKE 'MT225-%'
      )
    `;
    await sql`
      DELETE FROM quote_movement_records WHERE job_number LIKE 'MT225-%'
    `;
    await sql`
      DELETE FROM work_orders WHERE job_number LIKE 'MT225-%'
    `;
    await sql`
      INSERT INTO work_orders (
        id, identity_kind, identity_value, servicem8_job_uuid,
        servicem8_status, servicem8_active, is_current, job_number, client_name
      ) VALUES (
        ${workOrderId}::uuid, 'job', ${convertedJobUuid}, ${convertedJobUuid},
        'Work Order', true, true, ${convertedJobNumber}, 'Converted Customer'
      )
    `;
    await sql`
      INSERT INTO quote_movement_records (
        id, servicem8_job_uuid, servicem8_status, servicem8_active, job_number,
        customer_name, job_address, quote_value_excluding_gst, project_complexity,
        latest_activity_at, converted_at, source_coverage, source_discovered_count,
        source_unread_count, source_failed_count, source_coverage_details,
        important_details_summary, summary_source_fingerprint, summary_generated_at,
        last_servicem8_synced_at
      ) VALUES
      (
        ${completeRecordId}::uuid, ${completeJobUuid}, 'Quote', true, ${completeJobNumber},
        'Complete Coverage Customer', '25 Evidence Lane, Auckland', '7250.00', 'unassessed',
        now() - interval '2 minutes', null, 'complete', 5, 0, 0, '[]'::jsonb,
        ${JSON.stringify(completeSummary())}::jsonb, 'mt225-complete', now(), now()
      ),
      (
        ${incompleteRecordId}::uuid, ${`mt225-incomplete-${runId}`}, 'Quote', true, ${incompleteJobNumber},
        'Incomplete Coverage Customer', '26 Evidence Lane, Auckland', '8300.00', 'normal',
        now() - interval '20 minutes', null, 'incomplete', 2, 1, 1,
        '["1 attachment could not be interpreted; review ServiceM8 manually."]'::jsonb,
        ${JSON.stringify(incompleteSummary())}::jsonb, 'mt225-incomplete', now(), now()
      ),
      (
        ${convertedRecordId}::uuid, ${convertedJobUuid}, 'Work Order', true, ${convertedJobNumber},
        'Converted Customer', '27 Evidence Lane, Auckland', '9800.00', 'tight',
        now() - interval '1 hour', now() - interval '30 minutes', 'complete', 1, 0, 0, '[]'::jsonb,
        ${JSON.stringify(convertedSummary())}::jsonb, 'mt225-converted', now(), now()
      )
    `;
    await sql`
      INSERT INTO quote_movement_sources (
        quote_movement_record_id, source_type, source_identity, occurred_at,
        content, last_seen_at
      ) VALUES
        (${completeRecordId}::uuid, 'note', 'note-current', now() - interval '2 hours',
          '{"text":"Customer confirmed the latest pane selection."}'::jsonb, now()),
        (${completeRecordId}::uuid, 'email', 'email-conflict', now() - interval '90 minutes',
          '{"subject":"Opening direction still to confirm","body":"The two messages conflict; please confirm the final opening direction."}'::jsonb, now()),
        (${completeRecordId}::uuid, 'file', 'file-relevant', now() - interval '1 hour',
          '{"name":"Measured opening schedule.pdf"}'::jsonb, now()),
        (${completeRecordId}::uuid, 'photo', 'photo-routine', now() - interval '40 minutes',
          '{"name":"Routine framing photo.jpg"}'::jsonb, now()),
        (${completeRecordId}::uuid, 'tracked_open', 'tracked-open', now() - interval '2 minutes',
          '{"eventType":"open"}'::jsonb, now())
    `;
    await sql`
      INSERT INTO quote_movement_source_enrichment (
        source_id, interpretation_status, summary
      )
      SELECT id, 'interpreted',
        CASE source_identity
          WHEN 'file-relevant' THEN 'Measured dimensions affect the current scope.'
          WHEN 'photo-routine' THEN 'Routine site context retained but not material.'
          ELSE null
        END
      FROM quote_movement_sources
      WHERE quote_movement_record_id = ${completeRecordId}::uuid
    `;
    const fixtureUsers = (await sql`
      SELECT
        u.id,
        u.username,
        u.role,
        EXISTS (
          SELECT 1
          FROM user_module_access uma
          INNER JOIN modules m ON m.id = uma.module_id
          WHERE uma.user_id = u.id AND m.slug = 'quote-tracker'
        ) AS "hasQuoteTrackerGrant"
      FROM users u
      WHERE u.id IN (${grantedUserId}::uuid, ${ungrantedUserId}::uuid)
      ORDER BY u.username
    `) as Array<{
      id: string;
      username: string;
      role: string;
      hasQuoteTrackerGrant: boolean;
    }>;
    expect(fixtureUsers).toEqual([
      {
        id: grantedUserId,
        username: grantedUsername,
        role: "staff",
        hasQuoteTrackerGrant: true,
      },
      {
        id: ungrantedUserId,
        username: ungrantedUsername,
        role: "staff",
        hasQuoteTrackerGrant: false,
      },
    ]);
    const fixtureEvidence = await sql`
      SELECT 1
      FROM quote_movement_sources
      WHERE quote_movement_record_id = ${completeRecordId}::uuid
        AND source_identity = 'note-current'
      LIMIT 1
    `;
    expect(fixtureEvidence).toHaveLength(1);
    await sql`DELETE FROM quote_movement_refresh_locks WHERE lock_name = 'quote-movement-refresh'`;

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
    await sql`DELETE FROM quote_movement_refresh_runs WHERE actor_id IN (${grantedUserId}::uuid, ${ungrantedUserId}::uuid)`;
    await sql`DELETE FROM quote_movement_refresh_locks WHERE lock_name = 'quote-movement-refresh'`;
    await sql`DELETE FROM quote_movement_records WHERE id IN (${completeRecordId}::uuid, ${incompleteRecordId}::uuid, ${convertedRecordId}::uuid)`;
    await sql`DELETE FROM work_orders WHERE id = ${workOrderId}::uuid`;
    await sql`DELETE FROM users WHERE id IN (${grantedUserId}::uuid, ${ungrantedUserId}::uuid)`;
    if (previousQuoteTrackerModule) {
      await sql`
        UPDATE modules
        SET name = ${previousQuoteTrackerModule.name},
            admin_only = ${previousQuoteTrackerModule.adminOnly},
            is_active = ${previousQuoteTrackerModule.isActive}
        WHERE slug = 'quote-tracker'
      `;
    } else {
      await sql`DELETE FROM modules WHERE slug = 'quote-tracker'`;
    }
  });

  test("denies logged-out and ungranted staff from retained Quote Movement routes", async ({
    page,
  }) => {
    for (const path of protectedPaths()) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login(?:\?|$)/);
    }

    await login(page, ungrantedUsername, ungrantedPassword);
    for (const path of protectedPaths()) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/?denied=quote-tracker$/);
    }
  });

  test("lets granted staff understand and operate the representative V1 journey within ten seconds", async ({
    page,
  }, testInfo) => {
    await login(page, grantedUsername, grantedPassword);

    const listStartedAt = Date.now();
    await page.goto("/quote-movement");
    await expect(
      page.getByRole("heading", { name: "Quote Movement" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: completeJobNumber }),
    ).toBeVisible();
    const listUsableMs = Date.now() - listStartedAt;
    expect(listUsableMs).toBeLessThan(10_000);

    await page.getByLabel("Job number to fetch").fill(completeJobNumber);
    await page.getByRole("button", { name: "Fetch jobs" }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: "Fetch jobs" })).toBeVisible();
    await expect(page.getByText(/Cached data may be out of date/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("link", { name: completeJobNumber }),
    ).toBeVisible();

    const controls = page.getByRole("form", {
      name: "Quote Movement controls",
    });
    await expect(controls.getByLabel("Search")).toBeVisible();
    await expect(controls.getByLabel("Complexity")).toHaveValue("all");
    await expect(controls.getByLabel("Active/Converted")).toHaveValue("active");
    await expect(controls.getByLabel("Sort")).toHaveValue("latest_activity");
    const activeJobs = await page
      .locator("tbody a[href^='/quote-movement/']")
      .allTextContents();
    expect(activeJobs.slice(0, 2)).toEqual([
      completeJobNumber,
      incompleteJobNumber,
    ]);

    await controls.getByLabel("Complexity").selectOption("normal");
    await expect(
      page.getByRole("link", { name: incompleteJobNumber }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: completeJobNumber }),
    ).toHaveCount(0);

    await page.goto("/quote-movement?sort=quote_value");
    await expect(page.getByLabel("Sort")).toHaveValue("quote_value");
    const valueSortedJobs = await page
      .locator("tbody a[href^='/quote-movement/']")
      .allTextContents();
    expect(valueSortedJobs.slice(0, 2)).toEqual([
      incompleteJobNumber,
      completeJobNumber,
    ]);

    await page.getByLabel("Search").fill("Incomplete Coverage Customer");
    await page.getByLabel("Search").press("Enter");
    await expect(
      page.getByRole("link", { name: incompleteJobNumber }),
    ).toBeVisible();
    await expect(
      page.getByText(/Incomplete Source Coverage.*1 unread source/),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: completeJobNumber }),
    ).toHaveCount(0);

    await page.goto("/quote-movement");
    const complexity = page.getByLabel(
      `Project Complexity for ${completeJobNumber}`,
    );
    await expect(complexity).toHaveValue("unassessed");
    await complexity.selectOption("tight");
    await expect(complexity).toHaveValue("tight");
    await page.reload();
    await expect(
      page.getByLabel(`Project Complexity for ${completeJobNumber}`),
    ).toHaveValue("tight");

    const detailStartedAt = Date.now();
    await page.getByRole("link", { name: completeJobNumber }).click();
    await expect(
      page.getByRole("heading", { name: completeJobNumber }),
    ).toBeVisible();
    await expect(
      page.getByText("Latest confirmed pane selection is the current scope."),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Opening direction remains unresolved because retained messages conflict.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Customer opened the tracked quote after the last staff email.",
      ),
    ).toBeVisible();
    await expect(page.getByText("Complete Source Coverage")).toBeVisible();
    const detailUsableMs = Date.now() - detailStartedAt;
    expect(detailUsableMs).toBeLessThan(10_000);
    await expect(page.getByText("Routine framing photo.jpg")).toHaveCount(0);

    await page
      .getByRole("link", { name: "View supporting evidence" })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Supporting evidence" }),
    ).toBeVisible();
    await expect(
      page.getByText("Customer confirmed the latest pane selection."),
    ).toBeVisible();
    await page.getByRole("link", { name: "Back to What Matters Now" }).click();
    await expect(page.getByText("Complete Coverage Customer")).toBeVisible();

    await page.goto("/quote-movement?lifecycle=converted");
    await expect(
      page.getByRole("link", { name: convertedJobNumber }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open Work Order" }),
    ).toHaveAttribute("href", `/work-orders/${workOrderId}`);
    await expect(
      page.getByRole("link", { name: completeJobNumber }),
    ).toHaveCount(0);
    await testInfo.attach("mt225-ten-second-evidence", {
      body: Buffer.from(
        JSON.stringify({ listUsableMs, detailUsableMs }, null, 2),
      ),
      contentType: "application/json",
    });
  });
});

function protectedPaths() {
  return [
    "/quote-movement",
    `/quote-movement/${completeRecordId}`,
    `/quote-movement/${completeRecordId}/evidence/note-current`,
  ];
}

async function login(page: Page, username: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await expect(page.getByText(username, { exact: true })).toBeVisible();
}

function completeSummary() {
  return {
    currentPosition: {
      text: "Latest confirmed pane selection is the current scope.",
      evidenceSourceIdentities: ["note-current"],
    },
    materialFacts: [
      {
        text: "The measured opening schedule changes the required glass dimensions.",
        evidenceSourceIdentities: ["file-relevant"],
      },
    ],
    importantDates: [],
    participants: [],
    unresolvedMatters: [
      {
        text: "Opening direction remains unresolved because retained messages conflict.",
        evidenceSourceIdentities: ["email-conflict"],
      },
    ],
    latestMeaningfulMovement: {
      text: "Customer opened the tracked quote after the last staff email.",
      evidenceSourceIdentities: ["tracked-open"],
    },
    consentState: null,
  };
}

function incompleteSummary() {
  return {
    currentPosition: {
      text: "Manual ServiceM8 review is required before relying on this summary.",
      evidenceSourceIdentities: [],
    },
    materialFacts: [],
    importantDates: [],
    participants: [],
    unresolvedMatters: [],
    latestMeaningfulMovement: null,
    consentState: null,
  };
}

function convertedSummary() {
  return {
    currentPosition: {
      text: "Converted to Work Order with retained Quote evidence.",
      evidenceSourceIdentities: [],
    },
    materialFacts: [],
    importantDates: [],
    participants: [],
    unresolvedMatters: [],
    latestMeaningfulMovement: null,
    consentState: null,
  };
}

function createControlledFailureServer() {
  return createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", `http://127.0.0.1:${adapterPort}`)
      .pathname;
    if (path === "/api_1.0/job.json") {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ error: "controlled MT-225 provider failure" }),
      );
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end("[]");
  });
}
