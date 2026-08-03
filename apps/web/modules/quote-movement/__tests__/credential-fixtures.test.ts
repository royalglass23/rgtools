import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Quote Movement E2E credential fixtures", () => {
  it.each(["quote-movement.spec.ts", "quote-movement-v1.spec.ts"])(
    "does not assign credential-like literals in %s",
    (filename) => {
      const source = readFileSync(
        resolve(process.cwd(), "tests/e2e", filename),
        "utf8",
      );

      expect(source).not.toMatch(
        /\b(?:password|token|secret)\s*=\s*(?:["'`])/i,
      );
    },
  );
});
