import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Quote Movement E2E credential fixtures", () => {
  it("does not assign credential-like literals in the browser journey", () => {
    const source = readFileSync(
      resolve(process.cwd(), "tests/e2e/quote-movement.spec.ts"),
      "utf8",
    );

    expect(source).not.toMatch(
      /\b(?:password|token|secret)\s*=\s*(?:["'`])/i,
    );
  });
});
