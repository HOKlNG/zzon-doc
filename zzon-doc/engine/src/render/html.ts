/**
 * HTML packaging — thin bridge to the viewer-frame module.
 *
 * The old self-contained shell (toolbar/sidebar/legend/flow chrome) died in
 * the engine diet: ALL chrome is owned by the single frame module at
 * skills/zzon-doc/scripts/viewer-frame.js (viewer-frame contract v1). The
 * engine only supplies the contract inputs: payload (§1) + canvas adapter
 * bundle (§2/§3), and this module hands them to `buildViewerHtml`.
 *
 * The frame module is plain Node ESM outside the engine tree, so it is
 * loaded through a computed URL (not a literal specifier): tsc must not try
 * to resolve it, and a missing module (frame not built yet) must fail
 * loudly at render time — never silently produce chrome-less output.
 */
import type { ViewerPayload } from "./payload.ts";
import type { CanvasBundle } from "./adapter.ts";

/** node-side API of skills/zzon-doc/scripts/viewer-frame.js */
export interface ViewerFrameModule {
  buildViewerHtml(input: { payload: ViewerPayload; canvas: CanvasBundle }): string;
  /** every chrome string (labels/buttons/units) — merged into the font subset */
  FRAME_GLYPHS: string;
}

const FRAME_URL = new URL("../../../skills/zzon-doc/scripts/viewer-frame.js", import.meta.url);

let cached: ViewerFrameModule | null = null;

/**
 * Load (and cache) the frame module; null when it does not exist yet — a
 * failed load is retried on the next call so watch mode picks the frame up
 * the moment F1 lands it.
 */
export async function loadViewerFrame(): Promise<ViewerFrameModule | null> {
  if (cached) return cached;
  try {
    cached = (await import(FRAME_URL.href)) as ViewerFrameModule;
  } catch {
    return null;
  }
  return cached;
}

/** Full self-contained viewer HTML: frame chrome (Korean) around the canvas. */
export async function renderHtml(payload: ViewerPayload, canvas: CanvasBundle): Promise<string> {
  const frame = await loadViewerFrame();
  if (!frame) {
    throw new Error(
      `viewer-frame module not found at ${FRAME_URL.pathname} — ` +
        `the engine's HTML output is frame chrome + canvas (contract v1); build the frame first`,
    );
  }
  return frame.buildViewerHtml({ payload, canvas });
}
