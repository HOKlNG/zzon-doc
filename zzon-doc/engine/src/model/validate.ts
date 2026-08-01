/**
 * Model validation: builds the path index and collects ALL issues before
 * reporting (never fails on the first error). Every issue carries the DSL
 * call site captured by the builder.
 */
import type {
  ActorEl,
  BandEl,
  DiagramIndex,
  DiagramModel,
  Element,
  GroupEl,
  RailItem,
  ValidationIssue,
} from "./types.ts";
import { ICON_PATHS } from "../icons/manifest.gen.ts";
import { ICON_ALIASES } from "../icons/aliases.ts";
import type { IconRef } from "../icons/aliases.ts";

export interface ValidationResult {
  index: DiagramIndex;
  issues: ValidationIssue[];
  ok: boolean;
}

const iconExists = (ref: IconRef): boolean =>
  ref in ICON_PATHS || ref in ICON_ALIASES;

export function validate(model: DiagramModel): ValidationResult {
  const issues: ValidationIssue[] = [];
  const byPath: DiagramIndex["byPath"] = new Map();
  const parentOf: DiagramIndex["parentOf"] = new Map();

  const err = (message: string, site?: string) =>
    issues.push({ severity: "error", message, site });
  const warn = (message: string, site?: string) =>
    issues.push({ severity: "warning", message, site });

  // vocabulary tracking: category-card visuals vs icon visuals (AWS/lucide).
  // Table nodes are exempt; actors, band members, and rail items all count.
  const cardVocab: { path: string; site?: string }[] = [];
  const iconVocab: { path: string; site?: string }[] = [];

  function register(path: string, entity: Element | ActorEl | RailItem | BandEl, parent: string | null, site?: string) {
    if (byPath.has(path)) {
      err(`duplicate path "${path}" — sibling ids must be unique`, site);
      return;
    }
    byPath.set(path, entity);
    parentOf.set(path, parent);
  }

  function visitElement(el: Element, parent: string | null) {
    register(el.path, el, parent, el.site);
    if ("icon" in el && el.icon !== undefined && !iconExists(el.icon)) {
      err(`unknown icon "${String(el.icon)}" on ${el.path}`, el.site);
    }
    for (const badge of el.badges ?? []) {
      if (!iconExists(badge)) err(`unknown badge icon "${String(badge)}" on ${el.path}`, el.site);
    }
    if (el.type === "node") {
      // mirror the renderer's precedence: table > category (card) > icon
      if (el.table) {
        // ERD table nodes are vocabulary-exempt
      } else if (el.category) {
        cardVocab.push({ path: el.path, site: el.site });
      } else if (el.icon !== undefined) {
        iconVocab.push({ path: el.path, site: el.site });
      }
    }
    if (el.type === "group") visitGroup(el);
  }

  function visitGroup(group: GroupEl) {
    if (group.layout === "grid") {
      if (!group.grid) {
        err(`group ${group.path} declared grid layout but has no grid spec`, group.site);
      } else {
        const colIds = new Set(group.grid.columns.map((c) => c.id));
        const rowIds = new Set(group.grid.rows.map((r) => r.id));
        if (colIds.size !== group.grid.columns.length)
          err(`grid ${group.path} has duplicate column ids`, group.site);
        if (rowIds.size !== group.grid.rows.length)
          err(`grid ${group.path} has duplicate row ids`, group.site);
        for (const [key, cell] of Object.entries(group.grid.cells)) {
          const [col, row] = key.split("/");
          if (!colIds.has(col!)) err(`cell "${key}" references unknown column "${col}"`, cell.site);
          if (!rowIds.has(row!)) err(`cell "${key}" references unknown row "${row}"`, cell.site);
          const span = cell.hints ?? {};
          if (span.colSpan && span.colSpan < 1) err(`cell "${key}" colSpan must be >= 1`, cell.site);
          if (span.rowSpan && span.rowSpan < 1) err(`cell "${key}" rowSpan must be >= 1`, cell.site);
          register(cell.path, cell, group.path, cell.site);
          for (const child of cell.children) visitElement(child, cell.path);
        }
      }
      if (group.children.length > 0)
        err(`grid group ${group.path} must not have direct children — use cell()`, group.site);
    } else {
      for (const child of group.children) visitElement(child, group.path);
    }
    for (const rail of group.rails) {
      for (const item of rail.items) {
        register(item.path, item, group.path, item.site);
        if (!iconExists(item.icon)) err(`unknown icon "${String(item.icon)}" on rail item ${item.path}`, item.site);
        iconVocab.push({ path: item.path, site: item.site });
      }
    }
    if (group.hints?.pin) warn(`group ${group.path} uses pin — layout cannot guarantee no overlaps`, group.site);
  }

  for (const el of model.children) visitElement(el, null);
  for (const actor of model.actors) {
    register(actor.path, actor, null, actor.site);
    if (!iconExists(actor.icon)) err(`unknown icon "${String(actor.icon)}" on actor ${actor.path}`, actor.site);
    iconVocab.push({ path: actor.path, site: actor.site });
  }
  for (const band of model.bands) {
    register(band.path, band, null, band.site);
    for (const child of band.children) visitElement(child, band.path);
  }

  // ---- vocabulary mixing: card nodes and icon nodes may not coexist unless
  // the diagram opts out explicitly (table nodes never count either way)
  if (cardVocab.length > 0 && iconVocab.length > 0 && !model.allowMixedVocabulary) {
    const [minority, minorityName] =
      cardVocab.length <= iconVocab.length
        ? ([cardVocab, "category-card"] as const)
        : ([iconVocab, "icon"] as const);
    const listed = minority
      .slice(0, 5)
      .map((v) => (v.site ? `${v.path} (${v.site})` : v.path))
      .join(", ");
    const more = minority.length > 5 ? ` … +${minority.length - 5} more` : "";
    err(
      `diagram mixes node vocabularies: ${cardVocab.length} category-card node(s) vs ${iconVocab.length} icon node(s). ` +
        `Minority ${minorityName} nodes: ${listed}${more}. ` +
        `Use a single vocabulary, or opt out with diagram(id, { allowMixedVocabulary: true })`,
      minority[0]?.site,
    );
  }

  /**
   * Resolve a reference path: exact absolute match first, then unique-suffix
   * match ("vpc/az-b/eni-b" -> "aws-cloud/region/vpc/az-b/eni-b"). Rewrites
   * are applied to the model so downstream stages only see absolute paths.
   */
  function resolvePath(p: string, what: string, site?: string): string | null {
    if (byPath.has(p)) return p;
    const suffix = `/${p}`;
    const candidates = [...byPath.keys()].filter((k) => k.endsWith(suffix));
    if (candidates.length === 1) return candidates[0]!;
    if (candidates.length > 1) {
      err(`${what} "${p}" is ambiguous — candidates: ${candidates.join(", ")}`, site);
      return null;
    }
    err(`${what} "${p}" does not resolve to any element`, site);
    return null;
  }

  // ---- edges
  for (const edge of model.edges) {
    const from = resolvePath(edge.from, `edge ${edge.id} from`, edge.site);
    const to = resolvePath(edge.to, `edge ${edge.id} to`, edge.site);
    if (from) edge.from = from;
    if (to) edge.to = to;
    if (from && to && from === to) warn(`edge ${edge.id} is a self-loop`, edge.site);
  }

  // ---- overlays
  for (const overlay of model.overlays) {
    if (overlay.members.length === 0) {
      err(`overlay ${overlay.path} has no members`, overlay.site);
      continue;
    }
    overlay.members = overlay.members.map((m) => resolvePath(m, `overlay ${overlay.path} member`, overlay.site) ?? m);
  }
  // overlays sharing members in the same cell must nest, not cross
  for (let i = 0; i < model.overlays.length; i++) {
    for (let j = i + 1; j < model.overlays.length; j++) {
      const a = model.overlays[i]!;
      const b = model.overlays[j]!;
      const setB = new Set(b.members);
      const shared = a.members.filter((m) => setB.has(m));
      if (shared.length > 0 && shared.length !== a.members.length && shared.length !== b.members.length) {
        err(
          `overlays ${a.path} and ${b.path} partially share members (${shared.join(", ")}) — members must be disjoint or nested`,
          b.site,
        );
      }
    }
  }

  // ---- markers
  const seen = new Set<number>();
  for (const marker of model.markers) {
    const at = resolvePath(marker.at, `step ${marker.n} at`, marker.site);
    if (at) marker.at = at;
    if (seen.has(marker.n)) warn(`duplicate step number ${marker.n}`, marker.site);
    seen.add(marker.n);
  }

  return { index: { byPath, parentOf }, issues, ok: !issues.some((i) => i.severity === "error") };
}

export function formatIssues(issues: ValidationIssue[]): string {
  return issues
    .map((i) => `${i.severity === "error" ? "✖" : "⚠"} ${i.message}${i.site ? `  (${i.site})` : ""}`)
    .join("\n");
}
