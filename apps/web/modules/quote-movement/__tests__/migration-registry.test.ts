import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(process.cwd(), "../..");

describe("Quote Movement migration registry", () => {
  it("registers the source checkpoint migration after refresh coordination", () => {
    const journal = JSON.parse(
      readFileSync(resolve(repositoryRoot, "drizzle/migrations/meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ idx: number; tag: string }> };
    const entries = journal.entries;

    expect(entries.slice(-2)).toMatchObject([
      { idx: 70, tag: "0070_quote_movement_batch_outcomes" },
      { idx: 71, tag: "0071_quote_movement_source_checkpoint" },
    ]);
    expect(existsSync(resolve(repositoryRoot, "drizzle/migrations/0070_quote_movement_batch_outcomes.sql"))).toBe(true);
    expect(existsSync(resolve(repositoryRoot, "drizzle/migrations/0071_quote_movement_source_checkpoint.sql"))).toBe(true);
    expect(existsSync(resolve(repositoryRoot, "drizzle/migrations/0069_quote_movement_job_outcomes.sql"))).toBe(true);
  });
});
