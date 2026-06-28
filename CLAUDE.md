# zzon-doc — 인수인계 (CLAUDE 세션용)

이 레포는 **Claude Code 플러그인 마켓플레이스**다. 코드를 분석해 인터랙티브 아키텍처 다이어그램을 **의존성 0짜리 단일 .html**로 그려주는 스킬을 담는다. 나중에 문서 작성 기능까지 확장 예정.

## 네이밍 (혼동 주의)

| 층 | 이름 | 비고 |
|---|---|---|
| 마켓플레이스 | `zzon` | `.claude-plugin/marketplace.json` (레포 루트) |
| 플러그인(우산) | `zzon-doc` | `zzon-doc/.claude-plugin/plugin.json`. 앞으로 스킬 여러 개 담음 |
| 스킬 (현재) | `zzon-doc` | → `/zzon-doc:zzon-doc` (플러그인 스킬은 `플러그인명:스킬명` 네임스페이스). 아키텍처 그리기 |
| 스킬 (예정) | 미정 (`/zzon-doc` 등) | 문서 작성 기능 |

설치: `/plugin marketplace add <owner>/<repo>` → `/plugin install zzon-doc@zzon`
호출: `/zzon-doc:zzon-doc <대상>` (예: `/zzon-doc:zzon-doc 이 레포의 인프라`). 자연어 요청으로도 자동 동작.

## 구조

```
plugins-zzon-doc/
├── .claude-plugin/marketplace.json     # name: zzon, plugins:[zzon-doc → ./zzon-doc]
├── README.md
└── zzon-doc/
    ├── .claude-plugin/plugin.json      # name: zzon-doc
    ├── README.md
    └── skills/zzon-doc/
        ├── SKILL.md                    # 코드분석 → DiagramSpec 저작 → render 실행
        ├── references/
        │   ├── diagram-spec.md         # DiagramSpec 스펙 + good/bad 예시 (저작 가이드)
        │   ├── sample-infra.json       # 모범 답안 (그룹+플로우)
        │   ├── sample-msa-infra.json   # 모범 답안 (멀티 경계 MSA, 레인 밴드)
        │   ├── sample-platform-infra.json # 모범 답안 (대규모·균형 그리드 14노드)
        │   ├── sample-event-flow.json  # 모범 답안 (이벤트드리븐 data-flow)
        │   ├── sample-erd.json         # 모범 답안 (FK 앵커)
        │   ├── sample-erd-large.json   # 모범 답안 (다수 테이블·FK)
        │   └── sample-agent-topology.json # 모범 답안 (에이전트 토폴로지)
        └── scripts/
            ├── render.mjs              # DiagramSpec JSON → 단일 .html (엔진)
            └── build-docs.mjs          # 여러 스펙 → 통합 문서 index.html (메뉴+전체보기+iframe 뷰어)
```

## 핵심 계약 (깨지 말 것)

1. **의존성 0.** `render.mjs`·`build-docs.mjs` 모두 Node 20+ 내장 모듈만 쓴다. 출력 .html(개별 ~60KB, 통합 index ~13KB)도 외부 `<script>`/`<link>`/CDN 없이 self-contained. 레포에 node_modules/lockfile 두지 마라.
2. **render.mjs 안의 렌더 엔진은 검증된 포팅본이다 — 함부로 수정 금지.** 레인 레이아웃, 라운드 직교 엣지(관통 회피), 그룹 언더레이, 플로우 순번/애니메이션, 팬·줌이 다 들어있다. 엔진 로직을 바꿔야 하면 아래 "원본"에서 다시 포팅하고 반드시 재검증할 것.
3. **build-docs.mjs는 엔진을 건드리지 않는다.** render.mjs를 자식 프로세스로 호출해 개별 .html을 만든 뒤, 출력 폴더를 스캔해 통합 셸(`index.html`)만 생성한다. 통합 뷰는 각 다이어그램을 iframe으로 끼워 보여줄 뿐 — 다이어그램 자체는 독립 .html 그대로다.
4. **DiagramSpec 스키마가 계약.** 노드/그룹/엣지/플로우 평탄 배열 + slug id, 픽셀 좌표 없음(lane/order 힌트만). 통합 문서 메뉴용 선택 필드 `section`/`order`만 추가됨. 스펙 형태는 `references/diagram-spec.md` 참고.

## 원본 (엔진 출처 — 이식해 온 곳)

`render.mjs`는 info-hub의 자체 다이어그램 엔진을 바닐라 JS/CSS/SVG로 포팅한 것이다. 엔진 수정·동작 확인이 필요하면 원본을 본다:
- 레이아웃: `~/Documents/src/info-hub/packages/schema/src/layout.ts` (buildLayout/adjacency/flowHighlight)
- 엣지 기하: `~/Documents/src/info-hub/apps/web/src/components/diagram/geometry.ts`
- 스키마·토큰: `~/Documents/src/info-hub/packages/schema/src/{diagram,categories}.ts`
- 뷰 참고: `~/Documents/src/info-hub/apps/web/src/components/diagram/*.tsx`

## 현재 상태 (DONE)

- zzon-doc 스킬 + render.mjs 완성, 브라우저 렌더 검증 완료(노드/엣지 수 일치, 플로우 순번 배지, 다크모드, pageerror 0)
- `claude plugin validate` strict 통과(마켓플레이스+플러그인). SKILL.md frontmatter YAML 파싱 버그 수정(argument-hint 따옴표).
- 호출명 정정: 플러그인 스킬은 `플러그인명:스킬명` 네임스페이스 → **`/zzon-doc:zzon-doc`** (자연어로도 자동 동작).
- **build-docs.mjs(통합 문서) 추가** — 여러 스펙을 좌측 메뉴 + 전체보기 + iframe 뷰어의 self-contained index.html로 묶음. 데모 6종(`playground/zzon-doc/`)으로 빌드·검증 완료.
- 복잡 시나리오 모범답안 5종 추가(MSA 인프라 / 대규모 플랫폼 / 이벤트 data-flow / 대형 ERD / agent-topology).
- **레이아웃 설계 가이드** 추가(diagram-spec.md): 방향 선택, √N 그리드 균형, lane/order 분산, 그룹=세로 밴드(박스 겹침 방지), 엣지 비관통, 쪼개기 기준. MSA/플랫폼 예제는 이 가이드대로 lane 고정.
- **통합 문서 디자인 v2**: shadcn 풍(중립 팔레트·접이식 그룹·lucide 아이콘만·제목 아이콘 제거·무료 폰트·사이드바 접기·전체화면). 라이브러리 0 유지.
- 소유자 표준은 **메모리**에 기록됨(무의존/문서 디자인/레이아웃 품질) — 로컬, 레포 밖.
- git: 첫 커밋(main) 존재. **GitHub push는 소유자가 직접 함.** 이후 변경분(통합 문서 등)은 아직 커밋 안 됨 — 소유자 검토 후 커밋.

## 다음 작업 (TODO)

1. **통합 문서 스킬 추가** — `zzon-doc/skills/<새스킬>/`. linkonn(`~/Documents/src/linkonn/doc-html`)의 메뉴 골격(`src/config/nav.ts` = 단일 소스, 사이드바·브레드크럼·홈 카드)이 참고 모델. 단, **vite/react는 따라가지 말 것** — zzon의 의존성 0 단일 HTML 계약 유지. build-docs.mjs의 통합 셸을 확장하거나 같은 방식으로 메뉴 골격을 생성하는 형태가 자연스러움.
2. (선택) info-hub 연동 출력 옵션 — render 대신 실행 중인 info-hub API로 적재하는 모드.

## 테스트 방법

```bash
# 단일 렌더
node zzon-doc/skills/zzon-doc/scripts/render.mjs zzon-doc/skills/zzon-doc/references/sample-infra.json -o /tmp/x.html

# 통합 문서 (플러그인 오염 없이 playground에서 — playground/는 .gitignore됨)
mkdir -p playground/zzon-doc/specs && cp zzon-doc/skills/zzon-doc/references/sample-*.json playground/zzon-doc/specs/
node zzon-doc/skills/zzon-doc/scripts/build-docs.mjs playground/zzon-doc --title "데모 문서"
open -a "Google Chrome" playground/zzon-doc/index.html

# manifest 검증
node -e 'const m=require("./playground/zzon-doc/manifest.json");console.log(m.diagrams.length+"개")'
# 브라우저 자동화(claude-in-chrome)는 로컬 루프백 접속이 막혀 스크린샷 불가 → open 으로 실제 Chrome에서 확인.
```

## 규칙

- 문서·UI 텍스트 한국어(한다체), 코드 식별자 영어
- 스킬/플러그인 이름은 `zzon-*` 네임스페이스 유지
