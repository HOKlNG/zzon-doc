/**
 * engine-cli.mjs — 동봉 엔진(bun+TS) 호출 공용 헬퍼. Node 내장만 쓴다.
 *
 * - resolveBun(): bun 실행 파일을 찾는다. `execFileSync("bun")`만으로는 Windows에서
 *   npm 설치본(bun.cmd 셤)을 못 찾아 조용히 레거시로 폴백하던 문제를 막는다.
 *   순서: $ZZON_BUN → PATH의 "bun" → (win32) PATH의 bun.exe / npm 셤 옆 실바이너리 / ~/.bun/bin.
 * - runEngine(): 엔진 CLI를 타임아웃과 함께 실행한다. 엔진이 멈추면 빌드 전체가 무한
 *   대기하던 문제를 막는다($ZZON_ENGINE_TIMEOUT_MS, 기본 180초).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ENGINE_DIR = join(HERE, "..", "..", "..", "engine");
export const ENGINE_CLI = join(ENGINE_DIR, "src", "cli", "index.ts");
export const ENGINE_TIMEOUT_MS = Number(process.env.ZZON_ENGINE_TIMEOUT_MS) || 180_000;

function works(bin) {
  try {
    execFileSync(bin, ["--version"], { stdio: "pipe", timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

function windowsCandidates() {
  const out = [];
  for (const dir of (process.env.PATH || "").split(delimiter).filter(Boolean)) {
    out.push(join(dir, "bun.exe"));
    // npm 전역 설치: <prefix>\bun.cmd 셤 → <prefix>\node_modules\bun\bin\bun.exe
    if (existsSync(join(dir, "bun.cmd"))) out.push(join(dir, "node_modules", "bun", "bin", "bun.exe"));
  }
  out.push(join(homedir(), ".bun", "bin", "bun.exe"));
  if (process.env.APPDATA) out.push(join(process.env.APPDATA, "npm", "node_modules", "bun", "bin", "bun.exe"));
  return out;
}

let cached; // undefined = 미확인, null = 없음
/** bun 실행 파일 경로(또는 "bun"). 없으면 null. */
export function resolveBun() {
  if (cached !== undefined) return cached;
  const candidates = [];
  if (process.env.ZZON_BUN) candidates.push(process.env.ZZON_BUN);
  candidates.push("bun");
  if (process.platform === "win32") candidates.push(...windowsCandidates());
  cached = null;
  for (const c of candidates) {
    if (c !== "bun" && !existsSync(c)) continue;
    if (works(c)) {
      cached = c;
      break;
    }
  }
  return cached;
}

/**
 * 엔진 CLI 실행. 실패 시 Error를 던진다 — 메시지에 엔진 출력(또는 타임아웃 사유)을 담는다.
 * @param {string[]} args  예: ["render", spec, "--out", dir]
 */
export function runEngine(args, { timeoutMs = ENGINE_TIMEOUT_MS } = {}) {
  const bun = resolveBun();
  if (!bun) throw new Error("bun을 찾지 못했다 (PATH 또는 ZZON_BUN 확인)");
  try {
    return execFileSync(bun, [ENGINE_CLI, ...args], { stdio: "pipe", cwd: ENGINE_DIR, timeout: timeoutMs }).toString();
  } catch (e) {
    if (e.code === "ETIMEDOUT" || e.signal === "SIGTERM") {
      throw new Error(
        `엔진이 ${Math.round(timeoutMs / 1000)}초 안에 끝나지 않아 중단했다 (ZZON_ENGINE_TIMEOUT_MS로 조정). ` +
          `Windows라면 elk-loader 워커 경로 문제를 의심하라.`,
      );
    }
    const out = (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
    throw new Error(out.trim() || e.message);
  }
}

/**
 * 페이지에 넣을 Pretendard @font-face CSS — text에 나오는 글자만 서브셋한다.
 * 셸(통합 문서·위키·시퀀스 뷰어)이 엔진 다이어그램과 같은 글꼴로 보이게 한다.
 * bun이 없거나 실패하면 ""를 돌려준다(그때는 FONT_STACK의 OS 글꼴로 떨어진다).
 */
export function fontFaceCss(text) {
  if (!resolveBun()) return "";
  const dir = mkdtempSync(join(tmpdir(), "zzon-font-"));
  try {
    const src = join(dir, "glyphs.txt");
    const out = join(dir, "font.css");
    writeFileSync(src, text);
    runEngine(["font-css", src, "--css", out], { timeoutMs: 60_000 });
    return readFileSync(out, "utf8");
  } catch (e) {
    console.warn(`  ⚠ 글꼴 서브셋 실패 — OS 글꼴로 표시한다: ${String(e.message).split("\n")[0]}`);
    return "";
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
