# zzon-doc — 인수인계 (CLAUDE 세션용)

이 레포는 **Claude Code 플러그인 마켓플레이스**다. 코드를 분석해 인터랙티브 아키텍처 다이어그램을 **의존성 0짜리 단일 .html**로 그려주는 스킬을 담는다. 나중에 문서 작성 기능까지 확장 예정.

## 네이밍 (혼동 주의)

| 층 | 이름 | 비고 |
|---|---|---|
| 마켓플레이스 | `zzon` | `.claude-plugin/marketplace.json` (레포 루트) |
| 플러그인(우산) | `zzon-doc` | `zzon-doc/.claude-plugin/plugin.json`. 앞으로 스킬 여러 개 담음 |
| 스킬 (현재) | `zzon-arch` | → `/zzon-arch`. 아키텍처 그리기 |
| 스킬 (예정) | 미정 (`/zzon-doc` 등) | 문서 작성 기능 |

설치: `/plugin marketplace add <owner>/<repo>` → `/plugin install zzon-doc@zzon`
호출: `/zzon-arch <대상>` (예: `/zzon-arch 이 레포의 인프라`)

## 구조

```
plugins-zzon-doc/
├── .claude-plugin/marketplace.json     # name: zzon, plugins:[zzon-doc → ./zzon-doc]
├── README.md
└── zzon-doc/
    ├── .claude-plugin/plugin.json      # name: zzon-doc
    ├── README.md
    └── skills/zzon-arch/
        ├── SKILL.md                    # 코드분석 → DiagramSpec 저작 → render 실행
        ├── references/
        │   ├── diagram-spec.md         # DiagramSpec 스펙 + good/bad 예시 (저작 가이드)
        │   ├── sample-infra.json       # 모범 답안 (그룹+플로우)
        │   └── sample-erd.json         # 모범 답안 (FK 앵커)
        └── scripts/render.mjs          # DiagramSpec JSON → 단일 .html
```

## 핵심 계약 (깨지 말 것)

1. **의존성 0.** `render.mjs`는 Node 20+ 내장 모듈만 쓴다. 출력 .html도 외부 `<script>`/`<link>`/CDN 없이 self-contained(~60KB). 레포에 node_modules/lockfile 두지 마라.
2. **render.mjs 안의 렌더 엔진은 검증된 포팅본이다 — 함부로 수정 금지.** 레인 레이아웃, 라운드 직교 엣지(관통 회피), 그룹 언더레이, 플로우 순번/애니메이션, 팬·줌이 다 들어있다. 엔진 로직을 바꿔야 하면 아래 "원본"에서 다시 포팅하고 반드시 재검증할 것.
3. **DiagramSpec 스키마가 계약.** 노드/그룹/엣지/플로우 평탄 배열 + slug id, 픽셀 좌표 없음(lane/order 힌트만). 스펙 형태는 `references/diagram-spec.md` 참고.

## 원본 (엔진 출처 — 이식해 온 곳)

`render.mjs`는 info-hub의 자체 다이어그램 엔진을 바닐라 JS/CSS/SVG로 포팅한 것이다. 엔진 수정·동작 확인이 필요하면 원본을 본다:
- 레이아웃: `~/Documents/src/info-hub/packages/schema/src/layout.ts` (buildLayout/adjacency/flowHighlight)
- 엣지 기하: `~/Documents/src/info-hub/apps/web/src/components/diagram/geometry.ts`
- 스키마·토큰: `~/Documents/src/info-hub/packages/schema/src/{diagram,categories}.ts`
- 뷰 참고: `~/Documents/src/info-hub/apps/web/src/components/diagram/*.tsx`

## 현재 상태 (DONE)

- zzon-arch 스킬 + render.mjs 완성, 브라우저 렌더 검증 완료(노드/엣지 수 일치, 플로우 순번 배지, 다크모드, pageerror 0)
- git 초기화 + 첫 커밋 완료(main). **GitHub push는 소유자가 직접 함** (원격 미연결 상태일 수 있음)

## 다음 작업 (TODO)

1. **문서 작성 스킬 추가** — `zzon-doc/skills/<새스킬>/` 로 추가(예: `/zzon-doc` 또는 `/zzon-write`). 마켓플레이스/플러그인은 그대로 두고 스킬만 추가하면 됨. SKILL.md frontmatter(name/description/argument-hint) 규약 따를 것.
2. (선택) info-hub 연동 출력 옵션 — render 대신 실행 중인 info-hub API로 적재하는 모드.

## 테스트 방법

```bash
# 렌더
node zzon-doc/skills/zzon-arch/scripts/render.mjs zzon-doc/skills/zzon-arch/references/sample-infra.json -o /tmp/x.html
# 브라우저 검증 (playwright-core를 /tmp에 임시 설치, 레포엔 두지 말 것)
# chrome: ~/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
# 확인: file://.../x.html 열어 data-node-id 수=spec, svg path>0, 플로우 클릭 시 svg circle 배지, pageerror 0
```

## 규칙

- 문서·UI 텍스트 한국어(한다체), 코드 식별자 영어
- 스킬/플러그인 이름은 `zzon-*` 네임스페이스 유지
