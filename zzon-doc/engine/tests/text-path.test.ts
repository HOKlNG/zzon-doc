import { expect, test } from "bun:test";
import { textToPathD } from "../src/text/metrics.ts";

// opentype.js wrote NaN into glyph paths when the origin carried float noise,
// which cut labels short in the static SVG and the PNG export ("estela-jobs" → "este")
test("text paths never contain NaN for float-noise origins", () => {
  for (const y of [231.00000000000003, 206.50000000000003, 225.5000000000001, 219.00000000000003]) {
    for (const weight of ["regular", "semibold"] as const) {
      const d = textToPathD("estela-jobs Aurora PostgreSQL 잡 14종", 1216.856, y, 12, weight);
      expect(d.includes("NaN")).toBe(false);
    }
  }
});
