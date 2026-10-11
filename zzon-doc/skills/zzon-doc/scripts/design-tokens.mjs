/**
 * design-tokens.mjs — zzon 산출물 전체가 쓰는 디자인 토큰 단일 정본. Node 내장조차 쓰지 않는다.
 *
 * 쓰는 곳:
 *   - build-docs.mjs  통합 문서 셸
 *   - build-wiki.mjs  위키 셸
 *   - viewer-frame.js 구조·데이터 다이어그램 뷰어 크롬
 *   - render-seq.mjs  시퀀스 뷰어 (seq-engine.js의 변수가 여기 값을 참조한다)
 *   - 엔진 캔버스(engine/src/render/theme.ts·adapter.ts·card.ts·shapes.ts·table.ts)는 bun 쪽이라
 *     값을 복제한다. engine/tests/design-tokens.test.ts가 이 파일과의 일치를 검사한다.
 *
 * 값을 바꿀 때는 여기만 고치고, 엔진 복제값은 테스트가 가리키는 대로 맞춘다.
 */

/** 본문 글꼴. 산출물은 Pretendard 서브셋을 인라인한다(엔진 font-css). 없으면 OS 한글 글꼴로 떨어진다. */
export const FONT_STACK =
  'Pretendard,-apple-system,BlinkMacSystemFont,system-ui,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic","Segoe UI",Roboto,sans-serif';
export const MONO_STACK = 'ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace';

/** 색. 이름은 shadcn 관례를 따른다. 회색 계열은 zinc 하나만 쓴다. */
export const THEME = {
  light: {
    bg: "#ffffff",
    fg: "#09090b",
    card: "#ffffff",
    muted: "#f4f4f5",
    "muted-fg": "#71717a",
    border: "#e4e4e7",
    ring: "#a1a1aa",
    accent: "#4f46e5",
    "accent-fg": "#ffffff",
    "accent-soft": "#eef2ff",
    ok: "#059669",
    warn: "#d97706",
    danger: "#dc2626",
    shadow: "0 1px 2px rgba(0,0,0,.04),0 1px 3px rgba(0,0,0,.06)",
    "shadow-lg": "0 10px 30px rgba(0,0,0,.12)",
  },
  dark: {
    bg: "#09090b",
    fg: "#fafafa",
    card: "#141417",
    muted: "#1f1f23",
    "muted-fg": "#a1a1aa",
    border: "#2a2a2e",
    ring: "#52525b",
    accent: "#6366f1",
    "accent-fg": "#ffffff",
    "accent-soft": "#23244a",
    ok: "#34d399",
    warn: "#fbbf24",
    danger: "#f87171",
    shadow: "0 1px 2px rgba(0,0,0,.5)",
    "shadow-lg": "0 10px 30px rgba(0,0,0,.5)",
  },
};

/** 모서리: 칩·작은 버튼 / 버튼·입력 / 카드·패널 */
export const RADIUS = { sm: "6px", md: "8px", lg: "12px" };

/** 컨트롤 높이: 셸 상단 바 / 뷰어 안 떠 있는 컨트롤 */
export const CONTROL = { bar: "34px", overlay: "30px" };

/**
 * 화면 폭 구간.
 *   drawer: 이 폭 이하에서 셸의 왼쪽 메뉴가 화면을 덮는 서랍이 된다(태블릿 세로 포함).
 *   narrow: 이 폭 이하는 휴대폰 — 여백·글자·툴바를 줄인다.
 */
export const BREAKPOINT = { drawer: 960, narrow: 640 };

/**
 * CSS 변수 선언 블록. 각 화면은 자기 변수 이름을 유지하고 값만 여기서 받는다.
 * @param {Record<string,string>} names  토큰 키 → 그 화면의 변수 이름 (예: { bg: "--bg" })
 * @param {{ light: string, dark: string, prefers?: boolean }} sel  라이트/다크 선택자
 */
export function themeCss(names, sel = { light: ":root", dark: ':root[data-theme="dark"]', prefers: true }) {
  const decl = (t) =>
    Object.entries(names)
      .map(([k, v]) => {
        if (!(k in t)) throw new Error(`design-tokens: 알 수 없는 토큰 "${k}"`);
        return `${v}:${t[k]};`;
      })
      .join("");
  const out = [`${sel.light}{${decl(THEME.light)}}`, `${sel.dark}{${decl(THEME.dark)}}`];
  if (sel.prefers) out.push(`@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${decl(THEME.dark)}}}`);
  return out.join("\n");
}

/** 모든 토큰을 같은 접두사로 내보낸다. 예: tokenNames("--z-") → { bg: "--z-bg", ... } */
export function tokenNames(prefix) {
  return Object.fromEntries(Object.keys(THEME.light).map((k) => [k, prefix + k]));
}
