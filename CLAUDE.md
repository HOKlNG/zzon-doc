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
        ├── SKILL.md                    # 코드분석 → 유형 판별 → DiagramSpec 저작 → render 실행
        ├── references/
        │   ├── document-types.md       # 유형 카탈로그 4계열(개요/구조·인프라/흐름/데이터) + 추상화 사다리 (리서치 40+ 근거)
        │   ├── diagram-spec.md         # DiagramSpec 스펙 + 레이아웃 가이드 + 자가질문 (저작 가이드)
        │   ├── sample-context.json     # 모범 답안 (C4 컨텍스트: nodeDescriptions+드릴다운 href)
        │   ├── sample-full-landscape.json # 모범 답안 (풀뎁스 원장 27노드: 경계·도메인 밴드·데이터·운영 띠+드릴다운)
        │   ├── sample-infra.json       # 모범 답안 (그룹+플로우)
        │   ├── sample-msa-infra.json   # 모범 답안 (멀티 경계 MSA, 레인 밴드)
        │   ├── sample-platform-infra.json # 모범 답안 (대규모·균형 그리드 14노드)
        │   ├── sample-multiregion-ha.json # 모범 답안 (리전 미러 스탬프+badge+페일오버)
        │   ├── sample-event-flow.json  # 모범 답안 (이벤트드리븐 data-flow)
        │   ├── sample-data-pipeline.json # 모범 답안 (stage 밴드+횡단 거버넌스+데드레터)
        │   ├── sample-erd.json         # 모범 답안 (FK 앵커+카디널리티)
        │   ├── sample-erd-large.json   # 모범 답안 (다수 테이블·FK)
        │   └── sample-agent-topology.json # 모범 답안 (에이전트 토폴로지)
        └── scripts/
            ├── render.mjs              # DiagramSpec JSON → 단일 .html (엔진)
            ├── build-docs.mjs          # 여러 스펙 → 통합 문서 index.html (메뉴+전체보기+iframe 뷰어)
            └── layout-lint.mjs         # 스펙 저작 후 배치 검사 (그룹 겹침·비멤버 삼킴 검출, 렌더 전 실행)
```

## 핵심 계약 (깨지 말 것)

1. **의존성 0.** `render.mjs`·`build-docs.mjs` 모두 Node 20+ 내장 모듈만 쓴다. 출력 .html(개별 ~60KB, 통합 index ~13KB)도 외부 `<script>`/`<link>`/CDN 없이 self-contained. 레포에 node_modules/lockfile 두지 마라.
2. **render.mjs는 이 프로젝트의 독자 엔진이다(info-hub와 무관).** 레인 레이아웃, 라운드 직교 엣지(관통 회피), 분산 앵커(fan-out/fan-in 겹침 방지), 그룹 언더레이, 플로우 순번/애니메이션, 팬·줌이 들어있다. **수정해도 되지만 반드시 브라우저 렌더로 재검증**한다(노드/엣지 수 일치, 선 겹침, pageerror 0). 원복은 git으로 가능.
3. **build-docs.mjs는 엔진을 건드리지 않는다.** render.mjs를 자식 프로세스로 호출해 개별 .html을 만든 뒤, 출력 폴더를 스캔해 통합 셸(`index.html`)만 생성한다. 통합 뷰는 각 다이어그램을 iframe으로 끼워 보여줄 뿐 — 다이어그램 자체는 독립 .html 그대로다.
4. **DiagramSpec 스키마가 계약.** 노드/그룹/엣지/플로우 평탄 배열 + slug id, 픽셀 좌표 없음(lane/order 힌트만). 통합 문서 메뉴용 선택 필드 `section`/`order`만 추가됨. 스펙 형태는 `references/diagram-spec.md` 참고.

## 최초 이식 출처 (역사적 참고 — 이제 독립)

> 엔진은 이제 이 프로젝트 독자 코드다. info-hub에 의존하지 않고, 거기서 다시 포팅하지도 않는다. 아래는 최초에 이식해 온 출처일 뿐(역사 기록).

`render.mjs`는 처음에 info-hub의 다이어그램 엔진을 바닐라 JS/CSS/SVG로 포팅한 것이다. 참고만:
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
- **v0.3.0 — 유형 체계 + 엔진 고도화** (2026-07, 리서치 기반): C4/DFD/arc42 + AWS·Azure·GCP 레퍼런스 40+ 조사 → `document-types.md` 전면 개정(4계열 카탈로그 + 추상화 사다리 + 요소 수 예산). 엔진 신기능: **드릴다운**(`node.href` → 통합 문서에서 더블클릭 이동, postMessage), **nodeDescriptions**(C4 노드 내 설명), **그룹 kind 7종 추가**(region/az/account/security/onprem/stage/cluster — 논리=점선·물리=실선), **카테고리 10종 추가**(lb/dns/firewall/monitor/secret/ml/analytics/topic/pipeline/device), **ERD 카디널리티**(sourceCardinality/targetCardinality → 까마귀발 마커), **노드 badge**(AZ ×2 등 주석), **타이틀바**(제목+kind 배지), **범례에 그룹 kind**, `layout.align:"start"`(밴드형). 샘플 11종. 하위호환 유지(전부 선택 필드). 검증: 헤드리스 DOM 심 스모크(scratchpad, 11/11 예외 0) + **layout-lint.mjs**(엔진 배치 수식 재현 — 그룹 겹침·삼킴 검출, 11/11 통과) + strict validate 통과.
- **뎁스 3택 제안 규칙**(SKILL.md §1): 개괄 / 사다리 세트(드릴다운) / **풀뎁스 원장**(큰 그림 유지+전 레이어 한 장, 20~40노드, sample-full-landscape가 증명) — 사용자에게 반드시 뎁스를 묻고 그린다.
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
