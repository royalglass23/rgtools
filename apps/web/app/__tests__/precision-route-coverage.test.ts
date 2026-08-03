import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const productionPageFiles = [
  "app/(auth)/login/page.tsx",
  "app/(dashboard)/page.tsx",
  "app/(dashboard)/lead-intake/page.tsx",
  "app/(dashboard)/lead-intake/configuration/page.tsx",
  "app/(dashboard)/lead-intake/guide/page.tsx",
  "app/(dashboard)/leads/page.tsx",
  "app/(dashboard)/leads/[id]/page.tsx",
  "app/(dashboard)/quote-movement/page.tsx",
  "app/(dashboard)/quote-movement/[id]/page.tsx",
  "app/(dashboard)/quote-tracker/page.tsx",
  "app/(dashboard)/quote-tracker/guide/page.tsx",
  "app/(dashboard)/quote-tracker/[id]/page.tsx",
  "app/(dashboard)/work-orders/page.tsx",
  "app/(dashboard)/work-orders/guide/page.tsx",
  "app/(dashboard)/work-orders/[id]/page.tsx",
  "app/(dashboard)/clients/page.tsx",
  "app/(dashboard)/clients/configuration/page.tsx",
  "app/(dashboard)/clients/guide/page.tsx",
  "app/(dashboard)/clients/[id]/page.tsx",
  "app/(dashboard)/ps-generator/page.tsx",
  "app/(dashboard)/ps-generator/configuration/page.tsx",
  "app/(dashboard)/ps-generator/history/page.tsx",
  "app/(dashboard)/admin/page.tsx",
  "app/(dashboard)/admin/administration/page.tsx",
  "app/(dashboard)/admin/calculator-pricing/page.tsx",
  "app/(dashboard)/admin/client-merge-review/page.tsx",
  "app/(dashboard)/admin/dashboard-settings/page.tsx",
  "app/(dashboard)/admin/tracking/page.tsx",
  "app/(dashboard)/admin/work-orders/page.tsx",
] as const;

describe("Royal Glass Precision production route coverage", () => {
  it("keeps the expected 29 user-facing pages in the rollout", () => {
    expect(productionPageFiles).toHaveLength(29);

    for (const pageFile of productionPageFiles) {
      expect(existsSync(resolve(process.cwd(), pageFile)), pageFile).toBe(true);
    }
  });

  it("scopes the semantic compatibility layer to the authenticated shell", () => {
    const shellFile = resolve(
      process.cwd(),
      "components/dashboard-shell/DashboardShell.tsx",
    );

    expect(readFileSync(shellFile, "utf8")).toContain("data-precision-scope");
  });
});
