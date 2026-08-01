/**
 * Light/dark theme tokens shared by the two render variants (DESIGN §8).
 *
 * Interactive variant: tokens are emitted as CSS custom properties (html.ts
 * puts them on :root / :root[data-theme="dark"]) and the SVG references them
 * via var(...) so the theme toggle restyles the diagram live.
 * Static variant: tokens are resolved to literal values and baked as
 * presentation attributes (renderStaticSvg picks ONE theme).
 */

export type ThemeName = "light" | "dark";

export interface ThemeTokens {
  /** page + diagram canvas background */
  canvas: string;
  /** default label/text color */
  text: string;
  /** default edge stroke + secondary text color */
  edge: string;
  /** opacity applied to non-highlighted elements while hovering */
  dimOpacity: number;
}

export const THEMES: Record<ThemeName, ThemeTokens> = {
  light: { canvas: "#FFFFFF", text: "#16191F", edge: "#545B64", dimOpacity: 0.25 },
  dark: { canvas: "#161E2D", text: "#D5DBDB", edge: "#879596", dimOpacity: 0.25 },
};

/**
 * CSS custom-property declarations for one theme, without the surrounding
 * selector (html.ts wraps them in :root / [data-theme] blocks).
 */
export function themeVars(theme: ThemeName): string {
  const t = THEMES[theme];
  return `--ia-canvas:${t.canvas};--ia-text:${t.text};--ia-edge:${t.edge};--ia-dim:${t.dimOpacity};`;
}

/** var() references used by the interactive SVG variant. */
export const THEME_VAR = {
  canvas: "var(--ia-canvas)",
  text: "var(--ia-text)",
  edge: "var(--ia-edge)",
} as const;
