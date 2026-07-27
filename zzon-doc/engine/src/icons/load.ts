import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ICON_PATHS, type IconKey } from "./manifest.gen.ts";
import { resolveIcon, type IconRef } from "./aliases.ts";

const ROOT = join(import.meta.dir, "..", "..");

export interface IconSvg {
  key: IconKey;
  viewBox: string;
  /** inner SVG markup (everything inside the root <svg>, <title> stripped) */
  body: string;
}

const cache = new Map<IconKey, IconSvg>();

export function loadIcon(ref: IconRef): IconSvg {
  const key = resolveIcon(ref);
  const hit = cache.get(key);
  if (hit) return hit;

  const rel = ICON_PATHS[key];
  if (!rel) throw new Error(`unknown icon key: ${String(ref)}`);
  const raw = readFileSync(join(ROOT, rel), "utf8");

  const svgOpen = raw.match(/<svg\b[^>]*>/);
  if (!svgOpen) throw new Error(`malformed SVG for icon ${key}: no <svg> tag`);
  const viewBox = svgOpen[0].match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 64 64";

  const start = raw.indexOf(svgOpen[0]) + svgOpen[0].length;
  const end = raw.lastIndexOf("</svg>");
  let body = raw.slice(start, end);
  body = body.replace(/<title>[\s\S]*?<\/title>/g, "").trim();

  const icon: IconSvg = { key, viewBox, body };
  cache.set(key, icon);
  return icon;
}

/** Renders the set of used icons as <symbol> defs; reference via <use href="#i-<key>">. */
export function iconSymbolDefs(keys: Iterable<IconRef>): string {
  const seen = new Set<IconKey>();
  const parts: string[] = [];
  for (const ref of keys) {
    const icon = loadIcon(ref);
    if (seen.has(icon.key)) continue;
    seen.add(icon.key);
    parts.push(
      `<symbol id="i-${cssId(icon.key)}" viewBox="${icon.viewBox}">${icon.body}</symbol>`,
    );
  }
  return parts.join("\n");
}

export const cssId = (key: string) => key.replace(/[^a-z0-9-]/gi, "_");
