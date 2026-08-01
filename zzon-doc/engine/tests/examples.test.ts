/**
 * Acceptance smoke test: the three reference examples (S1/S2/S3) build via the
 * DSL and validate cleanly — no error-severity issues, and each is substantial
 * enough to exercise layout (>= 15 indexed elements, >= 5 edges).
 */
import { describe, expect, test } from "bun:test";
import { validate, formatIssues } from "../src/model/validate.ts";
import type { DiagramModel } from "../src/model/types.ts";
import eksCluster from "../examples/eks-cluster.ts";
import multiAccountLz from "../examples/multi-account-lz.ts";
import multiRegionCicd from "../examples/multi-region-cicd.ts";

const examples: [string, DiagramModel][] = [
  ["eks-cluster", eksCluster],
  ["multi-account-lz", multiAccountLz],
  ["multi-region-cicd", multiRegionCicd],
];

for (const [name, model] of examples) {
  describe(name, () => {
    const result = validate(model);

    test("validates with zero errors", () => {
      const errors = result.issues.filter((i) => i.severity === "error");
      // formatIssues in the assertion so failures print the actual messages
      expect(formatIssues(errors)).toBe("");
      expect(result.ok).toBe(true);
    });

    test("indexes >= 15 elements", () => {
      expect(result.index.byPath.size).toBeGreaterThanOrEqual(15);
    });

    test("declares >= 5 edges", () => {
      expect(model.edges.length).toBeGreaterThanOrEqual(5);
    });
  });
}
