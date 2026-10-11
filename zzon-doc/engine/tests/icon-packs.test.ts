/**
 * Extra official icon sets bundled next to the AWS icons (Azure V24,
 * Kubernetes community icons, SAP BTP solution diagrams) — see NOTICE.
 */
import { describe, expect, test } from "bun:test";
import { ICON_PATHS } from "../src/icons/manifest.gen.ts";
import { ICON_ALIASES, resolveIcon, type IconRef } from "../src/icons/aliases.ts";
import { iconSymbolDefs, loadIcon } from "../src/icons/load.ts";

const keys = Object.keys(ICON_PATHS);
const count = (prefix: string) => keys.filter((k) => k.startsWith(prefix)).length;

describe("bundled icon sets", () => {
  test("Azure, Kubernetes and SAP sets are registered", () => {
    expect(count("azure.")).toBeGreaterThan(600);
    expect(count("k8s.")).toBe(39);
    expect(count("sap.")).toBeGreaterThan(100);
  });

  test("every short alias resolves to a real icon", () => {
    for (const [alias, key] of Object.entries(ICON_ALIASES)) {
      expect(ICON_PATHS[key as keyof typeof ICON_PATHS], alias).toBeDefined();
    }
    expect(resolveIcon("azure.aks" as IconRef)).toBe("azure.kubernetes-services");
    expect(resolveIcon("k8s.deployment" as IconRef)).toBe("k8s.deploy");
  });

  test("icons keep their artwork and get per-icon ids (no collisions in one document)", () => {
    const vm = loadIcon("azure.virtual-machine" as IconRef);
    expect(vm.body).toContain("linearGradient");
    expect(vm.body).not.toContain("<title>");
    // gradient ids are prefixed with the icon key, and references follow
    const ids = [...vm.body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id.startsWith("azure_virtual-machine-")).toBe(true);
    const defs = iconSymbolDefs(["azure.virtual-machine", "azure.sql-database", "k8s.pod", "sap.sap-datasphere"] as IconRef[]);
    const all = [...defs.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(all).size).toBe(all.length);
  });
});
