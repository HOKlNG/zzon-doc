/**
 * Vocabulary-mixing enforcement: a diagram may not mix category-card nodes
 * with icon nodes (AWS/lucide `icon:`) unless it opts out via
 * diagram(id, { allowMixedVocabulary: true }). Actors, band members, and
 * rail items count as icon vocabulary; ERD table nodes are exempt.
 */
import { describe, expect, test } from "bun:test";
import { diagram } from "../src/dsl/index.ts";
import { validate, formatIssues } from "../src/model/validate.ts";
import type { ValidationIssue } from "../src/model/types.ts";

const vocabIssues = (issues: ValidationIssue[]): ValidationIssue[] =>
  issues.filter((i) => i.message.includes("allowMixedVocabulary"));

describe("vocabulary mixing", () => {
  test("pure category-card diagram validates", () => {
    const model = diagram("pure-card", (d) => {
      const api = d.node("api", { category: "gateway", label: "API" });
      const svc = d.node("svc", { category: "service", label: "Svc", tech: "NestJS" });
      const db = d.node("db", { category: "db", label: "DB" });
      d.edge(api, svc);
      d.edge(svc, db);
    });
    const r = validate(model);
    expect(formatIssues(r.issues.filter((i) => i.severity === "error"))).toBe("");
    expect(r.ok).toBe(true);
  });

  test("pure icon diagram (incl. actor, band, rail) validates", () => {
    const model = diagram("pure-icon", (d) => {
      d.actor("user", { icon: "users", label: "User" });
      const vpc = d.group("vpc", { kind: "vpc" });
      const web = vpc.node("web", { icon: "ec2", label: "Web" });
      vpc.rail("W", [{ id: "ecr", icon: "ecr", label: "ECR" }]);
      d.band("bottom", (b) => {
        b.node("bucket", { icon: "s3", label: "Bucket" });
      });
      d.edge(web, "bucket");
    });
    const r = validate(model);
    expect(formatIssues(r.issues.filter((i) => i.severity === "error"))).toBe("");
    expect(r.ok).toBe(true);
  });

  test("mixed vocabularies -> error naming minority paths, call sites, and the opt-out flag", () => {
    const model = diagram("mixed", (d) => {
      d.node("web", { icon: "ec2", label: "Web" });
      d.node("bucket", { icon: "s3", label: "Bucket" });
      d.node("orders", { category: "service", label: "Orders" });
    });
    const r = validate(model);
    expect(r.ok).toBe(false);
    const errs = vocabIssues(r.issues);
    expect(errs.length).toBe(1);
    const issue = errs[0]!;
    expect(issue.severity).toBe("error");
    // minority = the single card node, listed with its DSL call site
    expect(issue.message).toContain("orders");
    expect(issue.message).toMatch(/vocab\.test\.ts:\d+/);
    expect(issue.message).toContain("category-card");
    // exact opt-out is named
    expect(issue.message).toContain("diagram(id, { allowMixedVocabulary: true })");
    // the issue itself carries a call site through the ValidationIssue flow
    expect(issue.site).toMatch(/vocab\.test\.ts:\d+/);
  });

  test("mixed + allowMixedVocabulary: true -> ok", () => {
    const model = diagram("mixed-ok", { allowMixedVocabulary: true }, (d) => {
      d.node("web", { icon: "ec2", label: "Web" });
      d.node("orders", { category: "service", label: "Orders" });
    });
    const r = validate(model);
    expect(vocabIssues(r.issues).length).toBe(0);
    expect(formatIssues(r.issues.filter((i) => i.severity === "error"))).toBe("");
    expect(r.ok).toBe(true);
  });

  test("table nodes + icon nodes -> ok (tables are exempt)", () => {
    const model = diagram("erd-plus-icons", (d) => {
      const users = d.node("users", {
        label: "users",
        table: { columns: [{ name: "id", type: "uuid", pk: true }] },
      });
      d.node("db", { icon: "rds", label: "RDS" });
      d.edge(users, "db");
    });
    const r = validate(model);
    expect(vocabIssues(r.issues).length).toBe(0);
    expect(r.ok).toBe(true);
  });

  test("actors count as icon vocabulary against card nodes", () => {
    const model = diagram("card-plus-actor", (d) => {
      d.actor("user", { icon: "users", label: "User" });
      d.node("api", { category: "gateway", label: "API" });
    });
    const r = validate(model);
    expect(r.ok).toBe(false);
    const errs = vocabIssues(r.issues);
    expect(errs.length).toBe(1);
    // minority side is the card node here (1 card vs 1 icon -> card listed on tie)
    expect(errs[0]!.message).toContain("api");
  });

  test("minority list is capped at 5 offending paths", () => {
    const model = diagram("mixed-many", (d) => {
      d.node("solo", { category: "service", label: "Solo" });
      for (let i = 0; i < 7; i++) d.node(`n${i}`, { icon: "ec2", label: `N${i}` });
      // flip the minority to the icon side
      for (let i = 0; i < 8; i++) d.node(`c${i}`, { category: "service", label: `C${i}` });
    });
    const r = validate(model);
    const errs = vocabIssues(r.issues);
    expect(errs.length).toBe(1);
    const msg = errs[0]!.message;
    expect(msg).toContain("n0");
    expect(msg).toContain("n4");
    expect(msg).not.toContain("n5");
    expect(msg).toContain("+2 more");
  });
});
