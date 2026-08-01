/**
 * AWS Architecture Icons asset package -> committed, normalized icon set.
 *
 * Policy (post design-review): the pipeline OUTPUT is committed to git so
 * builds are deterministic and clone-and-go; the AWS package download URL is
 * content-hashed and changes quarterly, so fetching is a maintainer-run
 * UPGRADE step, never part of a normal build.
 *
 * Input : assets/aws-asset-package/  (extracted official Asset Package zip)
 *         assets/extra-icons/        (hand-added non-AWS SVGs, committed)
 * Output: src/icons/svg/<key>.svg    (normalized, committed)
 *         src/icons/manifest.gen.ts  (IconKey union + key->path map, committed)
 *         src/icons/icons.lock.json  (source package id, url, sha256, counts)
 *
 * Key scheme:
 *   service   : Arch_Amazon-EC2_48.svg          -> "ec2"  (vendor prefix stripped)
 *   resource  : Res_Amazon-EC2_Instance_48.svg  -> "ec2.instance"
 *   group     : Virtual-private-cloud-VPC_32    -> "group.vpc" (explicit table)
 *   dark      : ..._Dark variants               -> "<key>@dark"
 *   extra     : assets/extra-icons/<name>.svg   -> "x.<name>"
 * Vendor-prefix collisions (Amazon-X vs AWS-X) keep both full keys, drop the short one.
 *
 * Icon artwork is used as-is per AWS Architecture Icons terms; artwork is
 * never modified beyond XML cleanup (strip <title>/<desc>, XML decl).
 */
import {
  readdirSync,
  statSync,
  writeFileSync,
  existsSync,
  readFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, basename } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PKG = join(ROOT, "assets", "aws-asset-package");
const ZIP = join(ROOT, "assets", "aws-icon-package.zip");
const OUT_SVG_DIR = join(ROOT, "src", "icons", "svg");
const OUT_MANIFEST = join(ROOT, "src", "icons", "manifest.gen.ts");
const OUT_LOCK = join(ROOT, "src", "icons", "icons.lock.json");

const SOURCE_URL =
  "https://d1.awsstatic.com/onedam/marketing-channels/website/aws/en_US/architecture/approved/architecture-icons/Icon-package_04302026.4705b90f5aa45b019271a2699e9ce9b97b941ee1.zip";

if (!existsSync(PKG)) {
  console.error(`Asset package not found at ${PKG}.`);
  console.error(`Download + extract first:  curl -o ${ZIP} '${SOURCE_URL}' && unzip -q ${ZIP} -d ${PKG} -x '__MACOSX/*'`);
  process.exit(1);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "__MACOSX" || name === ".DS_Store") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".svg") && !basename(name).startsWith("._")) out.push(p);
  }
  return out;
}

const findTopDir = (prefix: string) =>
  readdirSync(PKG).find((d) => d.startsWith(prefix)) ?? null;

const norm = (s: string) => s.toLowerCase();
const stripVendor = (s: string) => s.replace(/^(amazon|aws)-/i, "");

/**
 * Strip XML decl + <title>/<desc>; artwork itself is untouched — EXCEPT that
 * document-scoped <style> blocks (CNCF icons) are inlined into style=""
 * attributes, because symbols are embedded into one shared SVG document where
 * global CSS would leak/be stripped.
 */
function normalizeSvg(raw: string): string {
  let out = raw
    .replace(/<\?xml[^?]*\?>\s*/g, "")
    .replace(/<title>[\s\S]*?<\/title>\s*/g, "")
    .replace(/<desc>[\s\S]*?<\/desc>\s*/g, "")
    .trim();

  const styleBlocks = [...out.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
  if (styleBlocks.length) {
    const declsToAttrs = (body: string): [string, string][] =>
      body
        .split(";")
        .map((d) => d.split(":"))
        .filter((kv): kv is [string, string] => kv.length === 2)
        .map(([k, v]) => [k.trim(), v.trim()]);

    const byClass = new Map<string, [string, string][]>();
    const byElement = new Map<string, [string, string][]>();
    for (const block of styleBlocks) {
      // strip @media blocks (dark-scheme variants etc.) — inline the base rules only
      const css = block[1]!.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
      for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const attrs = declsToAttrs(rule[2]!);
        for (const sel of rule[1]!.split(",").map((s) => s.trim())) {
          const cls = sel.match(/^\.([\w-]+)$/)?.[1];
          const elem = sel.match(/^([a-z]+)$/)?.[1];
          if (cls) byClass.set(cls, [...(byClass.get(cls) ?? []), ...attrs]);
          else if (elem) byElement.set(elem, [...(byElement.get(elem) ?? []), ...attrs]);
        }
      }
    }
    const attrString = (attrs: [string, string][], existing: string): string => {
      const deduped = new Map(attrs); // later stylesheet rules win
      return [...deduped]
        .filter(([k]) => !new RegExp(`\\b${k}="`).test(existing))
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
    };

    out = out.replace(/<style[^>]*>[\s\S]*?<\/style>\s*/g, "");
    // class selectors -> presentation attributes replacing the class attr
    out = out.replace(/<(\w+)\b([^>]*?)(\/?)>/g, (m, tag: string, attrs: string, slash: string) => {
      let next = attrs;
      const cls = attrs.match(/\sclass="([^"]+)"/)?.[1];
      if (cls) {
        const merged = cls.split(/\s+/).flatMap((c) => byClass.get(c) ?? []);
        const s = attrString(merged, attrs);
        next = next.replace(/\sclass="[^"]+"/, s ? ` ${s}` : "");
      }
      const elemAttrs = byElement.get(tag);
      if (elemAttrs) {
        const s = attrString(elemAttrs, next);
        if (s) next = `${next} ${s}`;
      }
      return `<${tag}${next}${slash}>`;
    });
    out = out.replace(/<defs>\s*<\/defs>\s*/g, "");
  }
  return out;
}

type Entry = { key: string; src: string };
const entries: Entry[] = [];
const collisions = new Map<string, string[]>();

// ---------- service icons (48px) ----------
const svcDir = findTopDir("Architecture-Service-Icons");
if (svcDir) {
  for (const cat of readdirSync(join(PKG, svcDir))) {
    const dir48 = join(PKG, svcDir, cat, "48");
    if (!existsSync(dir48)) continue;
    for (const p of walk(dir48)) {
      const m = basename(p).match(/^Arch_(.+?)(_Light|_Dark)?_48\.svg$/);
      if (!m) continue;
      const full = norm(m[1]!);
      const dark = m[2] === "_Dark";
      const short = stripVendor(full);
      entries.push({ key: (short || full) + (dark ? "@dark" : ""), src: p });
      if (!dark) collisions.set(short, [...(collisions.get(short) ?? []), full]);
    }
  }
}

// resolve service-key collisions: keep vendor-prefixed keys for all parties
for (const [short, fulls] of collisions) {
  const uniq = [...new Set(fulls)];
  if (uniq.length <= 1) continue;
  for (const e of entries.filter((e) => e.key === short || e.key === `${short}@dark`)) {
    const fm = basename(e.src).match(/^Arch_(.+?)(_Light|_Dark)?_48\.svg$/);
    if (fm) e.key = norm(fm[1]!) + (fm[2] === "_Dark" ? "@dark" : "");
  }
  console.warn(`collision on "${short}": kept full keys ${uniq.join(", ")}`);
}

// ---------- resource icons (48px) ----------
const resDir = findTopDir("Resource-Icons");
if (resDir) {
  for (const p of walk(join(PKG, resDir))) {
    const m = basename(p).match(/^Res_(.+?)_48(_Light|_Dark)?\.svg$/);
    if (!m) continue;
    const dark = m[2] === "_Dark";
    const parts = m[1]!.split("_");
    const svc = stripVendor(norm(parts[0]!));
    const rest = parts.slice(1).map(norm).join("-");
    const key = (rest ? `${svc}.${rest}` : `res.${svc}`) + (dark ? "@dark" : "");
    if (!entries.some((e) => e.key === key)) entries.push({ key, src: p });
  }
}

// ---------- group icons (explicit mapping) ----------
const GROUP_MAP: Record<string, string> = {
  "AWS-Cloud_32.svg": "group.aws-cloud",
  "AWS-Cloud_32_Dark.svg": "group.aws-cloud@dark",
  "AWS-Cloud-logo_32.svg": "group.aws-cloud-logo",
  "AWS-Cloud-logo_32_Dark.svg": "group.aws-cloud-logo@dark",
  "AWS-Account_32.svg": "group.account",
  "Region_32.svg": "group.region",
  "Virtual-private-cloud-VPC_32.svg": "group.vpc",
  "Public-subnet_32.svg": "group.public-subnet",
  "Private-subnet_32.svg": "group.private-subnet",
  "Auto-Scaling-group_32.svg": "group.auto-scaling",
  "Corporate-data-center_32.svg": "group.corporate-data-center",
  "Server-contents_32.svg": "group.server-contents",
  "EC2-instance-contents_32.svg": "group.ec2-instance-contents",
  "Spot-Fleet_32.svg": "group.spot-fleet",
  "AWS-IoT-Greengrass-Deployment_32.svg": "group.greengrass-deployment",
};
const grpDir = findTopDir("Architecture-Group-Icons");
if (grpDir) {
  for (const p of walk(join(PKG, grpDir))) {
    const key = GROUP_MAP[basename(p)];
    if (key) entries.push({ key, src: p });
  }
}

// ---------- extra (non-AWS) icons ----------
const extraDir = join(ROOT, "assets", "extra-icons");
if (existsSync(extraDir)) {
  for (const p of walk(extraDir)) {
    entries.push({ key: `x.${norm(basename(p, ".svg"))}`, src: p });
  }
}

// ---------- dedupe, write normalized files ----------
entries.sort((a, b) => a.key.localeCompare(b.key));
const uniq = entries.filter((e, i) => i === 0 || entries[i - 1]!.key !== e.key);
const dropped = entries.length - uniq.length;
if (dropped) console.warn(`dropped ${dropped} duplicate keys`);

rmSync(OUT_SVG_DIR, { recursive: true, force: true });
mkdirSync(OUT_SVG_DIR, { recursive: true });
const fileKey = (key: string) => key.replace(/@/g, "--");
for (const e of uniq) {
  writeFileSync(join(OUT_SVG_DIR, `${fileKey(e.key)}.svg`), normalizeSvg(readFileSync(e.src, "utf8")));
}

// ---------- manifest + lock ----------
const manifest = `// GENERATED by scripts/build-icons.ts — do not edit.
// Icons © Amazon Web Services — AWS Architecture Icons (${svcDir ?? "?"}),
// used per https://aws.amazon.com/architecture/icons/ terms. Artwork unmodified.
export const ICON_PATHS = {
${uniq.map((e) => `  ${JSON.stringify(e.key)}: ${JSON.stringify(`src/icons/svg/${fileKey(e.key)}.svg`)},`).join("\n")}
} as const;

export type IconKey = keyof typeof ICON_PATHS;
`;
writeFileSync(OUT_MANIFEST, manifest);

const lock = {
  source: {
    package: svcDir?.replace("Architecture-Service-Icons_", "Icon-package_") ?? "unknown",
    url: SOURCE_URL,
    sha256: existsSync(ZIP) ? createHash("sha256").update(readFileSync(ZIP)).digest("hex") : null,
  },
  counts: { total: uniq.length },
  generatedBy: "scripts/build-icons.ts",
};
writeFileSync(OUT_LOCK, JSON.stringify(lock, null, 2) + "\n");
console.log(`wrote ${uniq.length} normalized icons -> src/icons/svg/, manifest, icons.lock.json`);
