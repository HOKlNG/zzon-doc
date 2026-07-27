/**
 * Text measurement backed by the vendored fonts (the SAME fonts the HTML
 * embeds), so measured box sizes are exact in the final output.
 * All layout sizing must go through this module — never estimate.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as opentype from "opentype.js";

const FONT_DIR = join(import.meta.dir, "..", "..", "assets", "fonts");

export type FontWeight = "regular" | "semibold";

const FONT_FILES: Record<FontWeight, string> = {
  regular: "Pretendard-Regular.otf",
  semibold: "Pretendard-SemiBold.otf",
};

export const FONT_FAMILY = "Pretendard";

const cache = new Map<FontWeight, opentype.Font>();

export function getFont(weight: FontWeight = "regular"): opentype.Font {
  const hit = cache.get(weight);
  if (hit) return hit;
  const buf = readFileSync(join(FONT_DIR, FONT_FILES[weight]));
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  cache.set(weight, font);
  return font;
}

export function fontFileBuffer(weight: FontWeight = "regular"): Buffer {
  return readFileSync(join(FONT_DIR, FONT_FILES[weight]));
}

export function fontFilePath(weight: FontWeight = "regular"): string {
  return join(FONT_DIR, FONT_FILES[weight]);
}

export interface TextMetrics {
  width: number;
  /** ascender above baseline at this size */
  ascent: number;
  /** descender below baseline (positive) */
  descent: number;
  lineHeight: number;
}

export function measure(text: string, fontSize: number, weight: FontWeight = "regular"): TextMetrics {
  const font = getFont(weight);
  const scale = fontSize / font.unitsPerEm;
  return {
    width: font.getAdvanceWidth(text, fontSize, { kerning: true }),
    ascent: font.ascender * scale,
    descent: Math.abs(font.descender * scale),
    lineHeight: (font.ascender - font.descender) * scale * 1.15,
  };
}

export function measureWidth(text: string, fontSize: number, weight: FontWeight = "regular"): number {
  return getFont(weight).getAdvanceWidth(text, fontSize, { kerning: true });
}

/** Greedy word wrap; falls back to per-character breaks for CJK-style long runs. */
export function wrap(text: string, fontSize: number, maxWidth: number, weight: FontWeight = "regular"): string[] {
  if (measureWidth(text, fontSize, weight) <= maxWidth) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur) lines.push(cur);
    cur = "";
  };
  for (const word of words) {
    const candidate = cur ? `${cur} ${word}` : word;
    if (measureWidth(candidate, fontSize, weight) <= maxWidth) {
      cur = candidate;
      continue;
    }
    flush();
    if (measureWidth(word, fontSize, weight) <= maxWidth) {
      cur = word;
      continue;
    }
    // single word longer than the line: break by character
    let run = "";
    for (const ch of word) {
      if (measureWidth(run + ch, fontSize, weight) > maxWidth && run) {
        lines.push(run);
        run = "";
      }
      run += ch;
    }
    cur = run;
  }
  flush();
  return lines;
}

/** Convert text to an SVG path `d` (for the static export variant). */
export function textToPathD(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  weight: FontWeight = "regular",
): string {
  return getFont(weight).getPath(text, x, y, fontSize, { kerning: true }).toPathData(2);
}

/** Collect every distinct character used (for font subsetting at package time). */
export class GlyphCollector {
  private chars = new Set<string>();
  add(text: string): void {
    for (const ch of text) this.chars.add(ch);
  }
  toString(): string {
    return [...this.chars].sort().join("");
  }
}
