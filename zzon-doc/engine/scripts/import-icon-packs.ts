/**
 * Maintainer-run import of the extra official icon sets that may be
 * redistributed in this repository (see the root NOTICE for each set's terms).
 *
 *   bun scripts/import-icon-packs.ts --azure <dir> --k8s <dir> --sap <dir>
 *
 *   --azure  unzipped Azure_Public_Service_Icons_V*.zip (…/Icons/<category>/*.svg)
 *            https://learn.microsoft.com/azure/architecture/icons/
 *   --k8s    flat folder of Kubernetes community icons, named
 *            res-<name>.svg / infra-<name>.svg / cp-<name>.svg
 *            https://github.com/kubernetes/community/tree/main/icons
 *   --sap    unzipped SAP/btp-solution-diagrams release
 *            (…/assets/shape-libraries-and-editable-presets/svg/*.svg)
 *
 * Writes src/icons/svg/{azure,k8s,sap}.<name>.svg, appends the keys to
 * src/icons/manifest.gen.ts and records the sources in icons.lock.json.
 *
 * Artwork is kept as published. Only the XML prologue, comments, <title>,
 * editor metadata (Inkscape/Sodipodi) are removed, and element ids are
 * prefixed with the icon key so icons can share one document.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "src", "icons", "svg");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[()]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function clean(raw: string, key: string): string {
  let s = raw
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<metadata[\s\S]*?<\/metadata>/g, "")
    .replace(/<sodipodi:namedview[\s\S]*?(\/>|<\/sodipodi:namedview>)/g, "")
    .replace(/\s(?:inkscape|sodipodi):[a-z-]+="[^"]*"/g, "")
    .replace(/\sxmlns:(?:dc|cc|rdf|svg|sodipodi|inkscape)="[^"]*"/g, "")
    .trim();
  // ids become unique per icon so several icons can live in one SVG document
  const prefix = key.replace(/[^a-z0-9-]/gi, "_");
  s = s
    .replace(/\sid="([^"]+)"/g, (_m, id) => ` id="${prefix}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id) => `url(#${prefix}-${id})`)
    .replace(/(xlink:href|href)="#([^"]+)"/g, (_m, a, id) => `${a}="#${prefix}-${id}"`);
  return s + "\n";
}

const added: Record<string, string> = {};
function put(key: string, raw: string) {
  if (added[key]) return; // same icon filed under several categories
  const file = `${key}.svg`;
  writeFileSync(join(OUT, file), clean(raw, key));
  added[key] = `src/icons/svg/${file}`;
}

function walkSvg(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkSvg(p));
    else if (e.name.endsWith(".svg")) out.push(p);
  }
  return out.sort();
}

const counts: Record<string, number> = {};

const azure = arg("azure");
if (azure) {
  const before = Object.keys(added).length;
  for (const p of walkSvg(azure)) {
    // 10021-icon-service-Virtual-Machine.svg -> azure.virtual-machine
    const m = basename(p, ".svg").match(/icon-service-(.+)$/);
    if (!m) continue;
    put(`azure.${slug(m[1]!)}`, readFileSync(p, "utf8"));
  }
  counts.azure = Object.keys(added).length - before;
}

const k8s = arg("k8s");
if (k8s) {
  const before = Object.keys(added).length;
  for (const p of walkSvg(k8s)) {
    const m = basename(p, ".svg").match(/^(?:res|infra|cp)-(.+)$/);
    if (!m) continue;
    put(`k8s.${slug(m[1]!)}`, readFileSync(p, "utf8"));
  }
  counts.k8s = Object.keys(added).length - before;
}

const sap = arg("sap");
if (sap) {
  const before = Object.keys(added).length;
  for (const p of walkSvg(sap)) {
    if (!p.includes("shape-libraries-and-editable-presets")) continue;
    // 10002-cloud-integration-automation_sd.svg -> sap.cloud-integration-automation
    const m = basename(p, ".svg").match(/^\d+-(.+?)_sd$/);
    if (!m || m[1]!.startsWith("placeholder")) continue;
    put(`sap.${slug(m[1]!)}`, readFileSync(p, "utf8"));
  }
  counts.sap = Object.keys(added).length - before;
}

// manifest: append missing keys (idempotent, same style as import-lucide.ts)
const manifestPath = join(ROOT, "src", "icons", "manifest.gen.ts");
let manifest = readFileSync(manifestPath, "utf8");
const crlf = manifest.includes("\r\n");
manifest = manifest.replace(/\r\n/g, "\n");
const missing = Object.entries(added).filter(([k]) => !manifest.includes(`"${k}"`));
if (missing.length) {
  manifest = manifest.replace(
    "\n} as const;",
    missing.map(([k, v]) => `\n  "${k}": "${v}",`).join("") + "\n} as const;",
  );
  writeFileSync(manifestPath, crlf ? manifest.replace(/\n/g, "\r\n") : manifest);
}

// lock: where each extra set came from
const lockPath = join(ROOT, "src", "icons", "icons.lock.json");
const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : {};
lock.extraSets = {
  ...(lock.extraSets ?? {}),
  ...(azure ? { azure: { source: "https://learn.microsoft.com/azure/architecture/icons/ (Azure_Public_Service_Icons_V24)", count: counts.azure } } : {}),
  ...(k8s ? { k8s: { source: "https://github.com/kubernetes/community/tree/b0e9e677be6c9b178368d57b86e9f548fcbd575f/icons (Apache-2.0)", count: counts.k8s } } : {}),
  ...(sap ? { sap: { source: "https://github.com/SAP/btp-solution-diagrams (btpsd-v1.0.43, Apache-2.0)", count: counts.sap } } : {}),
};
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");

console.log("imported", counts, "new manifest keys", missing.length);
