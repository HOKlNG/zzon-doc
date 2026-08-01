/**
 * Maintainer-run fetcher for non-AWS icons with redistribution-friendly licenses.
 * Each source is pinned to a commit. Trademark-restricted marks (Grafana, GitHub)
 * are intentionally NOT fetched — add those manually to assets/extra-icons/ if
 * your usage context permits, then rerun scripts/build-icons.ts.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dir, "..", "assets", "extra-icons");
mkdirSync(DIR, { recursive: true });

// name -> { url, license, source }
const SOURCES: Record<string, { url: string; license: string }> = {
  kubernetes: {
    url: "https://raw.githubusercontent.com/cncf/artwork/40e2e8948509b40e4bad479446aaec18d6273bf2/projects/kubernetes/icon/color/kubernetes-icon-color.svg",
    license: "CNCF artwork (Linux Foundation trademark usage rules)",
  },
  "cert-manager": {
    url: "https://raw.githubusercontent.com/cncf/artwork/master/projects/cert-manager/icon/color/cert-manager-icon-color.svg",
    license: "CNCF artwork",
  },
  fluentbit: {
    url: "https://raw.githubusercontent.com/cncf/artwork/master/projects/fluentd/fluentbit/icon/color/fluentbit-icon-color.svg",
    license: "CNCF artwork",
  },
  "external-secrets": {
    url: "https://raw.githubusercontent.com/cncf/artwork/master/projects/external-secrets-operator/icon/color/eso-icon-color.svg",
    license: "CNCF artwork",
  },
  karpenter: {
    url: "https://raw.githubusercontent.com/aws/karpenter-provider-aws/3deed399d6660bea48a7d23cbf0a291cef0fecab/website/static/favicon.svg",
    license: "Apache-2.0 (aws/karpenter-provider-aws)",
  },
};

const results: string[] = [];
for (const [name, { url, license }] of Object.entries(SOURCES)) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    if (!body.includes("<svg")) throw new Error("not an SVG");
    writeFileSync(join(DIR, `${name}.svg`), body);
    results.push(`ok    ${name}  (${license})`);
  } catch (err) {
    results.push(`FAIL  ${name}: ${err instanceof Error ? err.message : err} — supply manually in assets/extra-icons/`);
  }
}
console.log(results.join("\n"));
