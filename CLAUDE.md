# zzon-doc — 인수인계 (CLAUDE 세션용)

이 레포는 **Claude Code 플러그인 마켓플레이스**다. 코드를 분석해 인터랙티브 아키텍처·시퀀스 다이어그램과 프로젝트 문서 위키를 **의존성 0짜리 단일 .html**(산출물 기준)로 만들어 주는 스킬 4종을 담는다.

## 네이밍 (혼동 주의)

| 층 | 이름 | 비고 |
|---|---|---|
| 마켓플레이스 | `zzon` | `.claude-plugin/marketplace.json` (레포 루트) |
| 플러그인(우산) | `zzon-doc` | `zzon-doc/.claude-plugin/plugin.json` |
| 스킬 1 | `zzon-doc` | → `/zzon-doc:zzon-doc` (플러그인 스킬은 `플러그인명:스킬명` 네임스페이스). **다이어그램 메인**(v0.9) — 선택 기준으로 뷰 13종·등급을 고르고, 시퀀스·Terraform은 형제 스킬 절차로 넘기며, 재진입 시 근거 대조로 갱신 |
| 스킬 2 | `zzon-wiki` | → `/zzon-doc:zzon-wiki`. 프로젝트 문서 위키 (질문 기반 채움 + 다이어그램 임베드) |
| 스킬 3 | `zzon-seq` | → `/zzon-doc:zzon-seq`. 시퀀스 다이어그램 (액터 간 시간축 상호작용, `kind:"sequence"`) |
| 스킬 4 | `terra-form` | → `/zzon-doc:terra-form`. Terraform 클라우드 인프라 (*.tf → 엔진 DSL, AWS 공식 아이콘 838종) |

설치: `/plugin marketplace add <owner>/<repo>` → `/plugin install zzon-doc@zzon`
호출: `/zzon-doc:zzon-doc <대상>` / `/zzon-doc:zzon-wiki`. 자연어 요청으로도 자동 동작.

## 구조

```
plugins-zzon-doc/
├── .claude-plugin/marketplace.json     # name: zzon, plugins:[zzon-doc → ./zzon-doc]
├── README.md / README.en.md
└── zzon-doc/
    ├── .claude-plugin/plugin.json      # name: zzon-doc
    ├── README.md
    ├── engine/                         # 내장 TS 다이어그램 엔진 (v0.8.1 통합 — 구조·데이터 다이어그램의 정본 렌더러)
    │   ├── CLAUDE.md / DESIGN.md       # 엔진 인수인계·설계 근거 — 레이아웃/라우팅 수정 전 필독 (§12 기각 대안 재제안 금지)
    │   ├── src/                        # TS DSL·ELK 자동배치·libavoid 직교 라우팅·렌더러·CLI (bun+TS)
    │   ├── examples/*.ts               # DSL API 정본 11종 (AWS 4 + msa/erd/flow + v0.9 표기 4: state/flowchart/screen-flow/domain-model)
    │   ├── src/quality/metrics.ts      # 등급별 품질 게이트(교차·꺾임·라벨 가림·색 그룹·흐름 방향·예산) — `bun ia check`
    │   ├── src/render/shapes.ts        # 표기 모양(상태·시작·종료·선택·처리·판단·터미널·화면·클래스·모듈)
    │   ├── src/model/semantics.ts      # 표기 의미 검사(상태 도달성·판단 라벨·상속 순환)
    │   ├── tests/                      # 불변식 검사(invariants.ts) 등 — bun test
    │   └── package.json / bun.lock     # elkjs·libavoid-js·resvg 등 (node_modules는 gitignore, bun install 1회)
    ├── skills/zzon-doc/                # 스킬 1 — 다이어그램 메인 (v0.9)
    │   ├── SKILL.md                    # 메인 허브: 분기(재진입 --status) → scan 신호 → 뷰·등급(rubric) → 위임(seq/terra-form)·views 저작 → bun ia check → build-docs → 보고(충실도 장부)
    │   ├── references/
    │   │   ├── selection-rubric.md     # ★ 선택 기준 정본 — 뷰(관심사 점수)·등급(T1/T2/T3)·축소 사다리·게이트 수치·근거 추적
    │   │   ├── views/*.md              # 뷰별 작도 문법 11종(엔진 DSL 용어) + README(공통 계약)
    │   │   ├── writing-style.md        # 독자용 문장 규칙 정본 — 필드명·내부 코드·번호·기호 나열 금지 (스킬 4종이 참조)
    │   │   ├── document-types.md       # (이전됨 안내) → selection-rubric + views
    │   │   ├── diagram-spec.md         # (레거시) DiagramSpec 스펙 + 레이아웃 가이드
    │   │   ├── viewer-frame-contract.md# 뷰어 프레임 계약 v1 (payload/adapter/셸 프로토콜/glyph/드릴다운)
    │   │   └── sample-*.json           # (레거시) DiagramSpec 모범 답안 14종 — 변환 내장으로 여전히 렌더됨
    │   └── scripts/
    │       ├── build-docs.mjs          # 여러 스펙 → 통합 문서 index.html (기본: 엔진 CLI(bun), sequence→render-seq, 폴백: legacy / wiki.json 있으면 index 양보) · --status(근거 대조) · --stamp · 게이트 수집
    │       ├── scan.mjs                # 코드 사실 스캐너(선택 기준 입력) — IaC·배포 단위·테이블·라우트·큐·상태·화면·에이전트·모듈
    │       ├── scan-deps.mjs           # 모듈 의존성 기계 추출 → DSL 생성(JS/TS·Python·Go·JVM, 순환·공용 모듈·추이 간선)
    │       ├── sources-lock.mjs        # diagrams.lock.json — 장별 근거 파일 해시·git 커밋·scan 요약(갱신 판정)
    │       ├── engine-cli.mjs          # bun 해석(Windows npm 셤 포함) + 엔진 호출 타임아웃 + fontFaceCss(셸용 Pretendard 서브셋)
    │       ├── design-tokens.mjs       # ★ 산출물 전체 디자인 토큰 정본 — 색(zinc)·글꼴·모서리·컨트롤 높이·폭 구간(서랍 960/휴대폰 640)
    │       ├── render.mjs              # (레거시 폴백) DiagramSpec JSON → 단일 .html — ZZON_LEGACY_RENDER=1·renderer:"legacy"·bun 부재 시
    │       ├── viewer-frame.js         # 공용 뷰어 프레임 (+ viewer-frame.test.mjs)
    │       ├── parity-check.mjs        # 레거시 vs 엔진 프레임 기능 패리티 게이트
    │       └── layout-lint.mjs         # (레거시 저작용) 배치 검사 — 엔진 경로에선 불변식 검사가 대체
    ├── skills/zzon-seq/                # 스킬 3 — 시퀀스 다이어그램
    │   ├── SKILL.md                    # 판별(vs data-flow)→코드 추적→SeqSpec 저작→렌더/빌드→위키 임베드
    │   ├── references/
    │   │   ├── seq-spec.md             # SeqSpec 정본 (kind:"sequence", actors/steps/fragments, essential 규칙)
    │   │   └── sample-seq-*.json       # 모범 답안 2종 (alt/else 결제 · loop/opt/par 배치)
    │   └── scripts/
    │       ├── render-seq.mjs          # SeqSpec 검증 + 템플릿 (seq-engine.js 인라인 주입)
    │       └── seq-engine.js           # 뷰어 엔진 (순수 JS 정본 — 수정 시 브라우저 재검증)
    ├── skills/terra-form/              # 스킬 4 — Terraform 클라우드 인프라
    │   └── SKILL.md                    # *.tf 판독 → 엔진 DSL 저작 → bun ia render + 불변식 게이트 → 패스스루 스펙으로 manifest 편입
    └── skills/zzon-wiki/               # 스킬 2 — 프로젝트 문서 위키
        ├── SKILL.md                    # 프로세스 강제: 스캔→티어 승인→섹션 루프(질문)→빌드, 재진입은 --status부터
        ├── references/
        │   ├── wiki-spec.md            # wiki.json 스키마 + md 규약(@diagram, ❓ 콜아웃) 정본
        │   ├── doc-catalog.md          # SI 12섹션 카탈로그 템플릿 (tier 태그·dynamic 규칙·질문 은행·seq-flows 슬롯)
        │   ├── sample-wiki.json        # 모범 답안 + 검증 픽스처
        │   └── sample-docs/            # 모범 문서 md (다이어그램 임베드·콜아웃 예시)
        └── scripts/
            └── build-wiki.mjs          # wiki.json+docs/*.md → self-contained 위키 index.html (--status 지원)
```

## 핵심 계약 (깨지 말 것)

1. **산출물 의존성 0.** 출력 .html은 어느 렌더 경로든 외부 `<script>`/`<link>`/CDN 없이 self-contained(폰트·아이콘 인라인, 외부 요청 0). 스킬 스크립트(`build-docs.mjs`·`build-wiki.mjs`·`render.mjs`·`render-seq.mjs`)는 Node 20+ 내장 모듈만 쓴다. **예외는 `engine/` 하나** — bun+TS에 elkjs·libavoid-js·resvg 등 의존(bun.lock 커밋, node_modules는 gitignore·로컬 `bun install`). 엔진 밖으로 의존성을 새로 들이지 마라.
2. **engine/이 구조·데이터 다이어그램(infra/data-flow/erd/agent-topology)의 정본 렌더러다(v0.8.1~).** TS DSL → ELK 자동배치+직교 라우팅+겹침·관통 불변식 → 셀프컨테인드 HTML. lane/order 수동 조정·layout-lint는 엔진 경로에 없다 — 대신 렌더 후 `tests/invariants.ts` 검사 위반 0을 만든다. **수정 전 `engine/DESIGN.md` 필독**(§12 기각 대안 재제안 금지), 수정 후 bun test+브라우저 재검증. `render.mjs`(순수 JS 독자 엔진)는 **레거시 폴백**으로 유지 — `ZZON_LEGACY_RENDER=1`·스펙 `"renderer":"legacy"`·bun 부재 시 자동 사용, 수정 시 브라우저 재검증 규칙 동일. **폴백은 레거시 DiagramSpec JSON에만 해당** — 엔진 DSL(.ts)·terra-form 스펙은 bun 필수(없으면 이미 렌더된 html 패스스루 편입만 가능).
3. **build-docs.mjs는 렌더러를 건드리지 않는다.** 스펙의 kind/renderer를 보고 엔진 CLI(bun)/render-seq/레거시 render.mjs를 자식 프로세스로 라우팅해 개별 .html을 만든 뒤, 통합 셸(`index.html`)만 생성한다. 통합 뷰는 각 다이어그램을 iframe으로 끼워 보여줄 뿐 — 다이어그램 자체는 독립 .html 그대로다.
4. **스펙 계약.** 신규 저작은 **엔진 TS DSL**(`<docsDir>/terra/<slug>.ts` + specs/의 패스스루 스텁 JSON)이다. 레거시 DiagramSpec JSON(노드/그룹/엣지/플로우 평탄 배열, `references/diagram-spec.md`)은 **변환 내장으로 그대로 렌더된다** — 하위호환은 지키되 신규 저작은 금지(deprecated). 클라우드 아이콘 어휘는 `"vocabulary": "aws"`로 선택(혼용은 validator 차단).
5. **index.html 소유권**: 출력 폴더에 `wiki.json`이 있으면 index.html은 **build-wiki 소유** — build-docs는 다이어그램·manifest만 갱신하고 index를 건너뛴다(가드 내장). build-wiki는 build-docs를 자식 프로세스로 호출해 렌더를 위임한다.
6. **wiki.json이 위키의 단일 상태 소스.** 스키마는 `skills/zzon-wiki/references/wiki-spec.md`가 정본. todo 문서는 빈 md를 만들지 않는다. 상태를 md frontmatter에 이중화하지 않는다.
7. **시퀀스 엔진(zzon-seq)도 순수 JS가 정본이다 — 레포에 빌드 도구 0.** `skills/zzon-seq/scripts/seq-engine.js`는 render.mjs와 같은 규칙으로 직접 수정하고 반드시 브라우저 렌더로 재검증한다(샘플 2종 렌더, 겹침 없음·pageerror 0). SeqSpec 스키마 정본은 `skills/zzon-seq/references/seq-spec.md`. `kind:"sequence"` 스펙은 build-docs가 render-seq.mjs로 라우팅하며(형제 스킬 경로 참조), DiagramSpec과 스키마가 다르다(actors/steps — nodes/edges 아님). 뷰어는 zzon 셸 프로토콜(zzon:sidebar/zzon:sidebar-close, zzon-theme)을 구현한다. 최초 이식 출처는 ~/Documents/src/test_sequence_diagram(FlowScope TS를 1회 트랜스파일) — render.mjs의 info-hub 전례처럼 **이식 후 독립**, 다시 포팅하지 않는다.
8. **선택 기준이 판단의 정본이다(v0.9).** 무엇을(뷰)·얼마나 복잡하게(등급) 그릴지는 `references/selection-rubric.md` + `scripts/scan.mjs` 수치로 정하고, 렌더 후 `bun ia check`(불변식 + 등급 게이트 + 의미 검사)를 통과시킨다. 게이트 수치를 바꾸면 rubric §4·§5와 engine `TIER_BUDGETS`를 같이 바꾸고 샘플 코퍼스를 다시 잰다.
9. **근거 추적 — `diagrams.lock.json`은 build-docs 소유.** 스펙 stub의 `sources`(근거 glob)를 해시로 스탬프하고, `--status`가 fresh/stale/untracked/edited와 scan 신호 변화를 보고한다. 재진입 첫 행동은 `--status`다(zzon-doc·zzon-wiki 둘 다).
10. **디자인은 하나다 — `scripts/design-tokens.mjs`가 정본.** 통합 문서·위키·뷰어 프레임·시퀀스 뷰어·레거시 render.mjs가 여기서 색·글꼴·모서리·폭 구간을 받는다. 엔진 캔버스(theme/adapter/card/shapes/table.ts)는 값을 복제하고 `engine/tests/design-tokens.test.ts`가 일치를 지킨다. 화면 하나에만 새 팔레트·글꼴을 하드코딩하지 마라. 모든 페이지는 390/768/1440 폭·라이트/다크에서 가로 넘침 0이어야 하고, 960px 이하에선 셸 메뉴가 서랍, 640px 이하에선 상세 패널이 아래 시트다. 독자용 문장은 `references/writing-style.md`를 따르고, 추적용 id(q-001 등)는 원문에만 두고 화면에선 숨긴다.

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
- **v0.4.0 — zzon-wiki 스킬 추가** (2026-07): 프로젝트 문서 위키. linkonn nav 모델을 일반화한 12섹션 카탈로그(티어 1/2/3 태그, dynamic 노드) + wiki.json 단일 상태 소스(문서 status·질문 대장 q-NNN·이력) + build-wiki.mjs(strict 검증→build-docs 자식 위임→미니 md 렌더러(raw HTML 금지·스킴 허용목록)→@diagram iframe 치환→위키 셸: 3단 nav·진행 현황·zzon:navigate 드릴다운 수신). `--status`가 해시 대조로 사람 수정·질문 마커 소멸을 감지(재진입 게이트). 검증: 검증기 적대 픽스처 7종·md 렌더러 적대 입력 9종·셸 헤드리스 스모크 17항목·재진입 왕복 — 전부 통과(스크립트는 scratchpad).
- **v0.5.0 — 우측 상세 사이드바 + C4 혼합 레벨 샘플** (2026-07-10):
  - **엔진 UI 개편**: 플로팅 패널 2종(노드 상세·플로우 단계) 제거 → **우측 상세 사이드바**(슬라이드 인) 공용화. 노드 클릭 = 설명+ERD 컬럼(FK 툴팁)+**연결 목록**(클릭 시 상대 노드로 이동)+드릴다운 링크. 플로우 = 단계 목록. 플로우 버튼 아래 **순번 스트립**(숫자 칩, 클릭=단계 강조, 배지·목록과 동기화). Escape로 닫기. 사이드바 열리면 툴바가 왼쪽으로 밀림.
  - **통합 문서 상호 배타**: iframe이 `zzon:sidebar` postMessage → 셸이 좌측 메뉴 자동 접힘, 좌측 메뉴를 다시 열면 셸이 `zzon:sidebar-close`를 보내 우측 사이드바 닫힘. 장 전환 시 좌측 메뉴 복원.
  - **zzon-wiki 셸도 동일 프로토콜 연동**(build-wiki.mjs): 임베드 다이어그램의 사이드바가 열리면 **해당 figure를 본문 폭(860px) 밖으로 확장**(`.dgm.expanded` — 94vw·높이 72vh) + 좌측 네비 자동 접힘(열린 사이드바 카운트 관리, 여러 임베드 대응). 네비 재오픈 시 모든 임베드 iframe에 닫기 브로드캐스트, 문서 전환 시 복원.
  - **위키 홈 = 문서 개요로 개편**: 홈이 진행 대시보드가 아니라 **섹션 소개(purpose)+문서 카드**(제목·summary·상태 배지, todo는 옅게, na 제외)를 보여준다. 진행 현황(통계·진행바·열린 질문·이력)은 별도 뷰 `#/_progress`로 이동 — 네비 상단에 "개요/진행 현황" 버튼 2개. 스키마 변경 없음.
  - **위키 네비 서브트리 접기**: 자식 있는 문서 노드는 접이식(`.nsub` + 셰브런 토글, 기본 접힘). 활성 문서의 조상은 자동 펼침(직접 URL·드릴다운 진입 대비). lv3 들여쓰기 CSS 추가(기존엔 3depth 스타일 부재). 데모: playground/wiki-demo를 **풀 SI 전체 메뉴**(12섹션·93문서, 3depth 예시 interface/api-spec/orders/{create,query} 포함)로 재구성 — 전체 카탈로그 열람용이며 실사용은 인터뷰 선별(interview.decisions에 기록).
  - **섹션 code 연속 재부여 규칙**: 섹션은 원래 인터뷰에서 필요한 것만 선별되는데, code가 카탈로그 번호를 그대로 써서 구멍(00,05,06…)이 남았었다 → **포함된 섹션 기준 00부터 연속 부여**로 확정(doc-catalog.md 인스턴스화 절차 6, wiki-spec.md 갱신). build-wiki가 비연속 code에 ⚠ 경고. 섹션 추가 시 카탈로그 순서 자리에 끼우고 전체 재부여(참조는 path 기준이라 안전). sample-wiki.json 재번호 완료.
  - **샘플 12종**: sample-container(C4 L2, **경계 그룹+밖에 L1 이웃 = L1~L2 한 장**)·sample-component(C4 L3, 경계+이웃 = L2~L3 한 장) 추가 — "한 장=한 레이어"로만 그리던 문제의 저작 측 해결. sample-context 드릴다운을 sample-container로 연결. document-types.md(컨테이너 행 개정+컴포넌트 행 추가)·diagram-spec.md·SKILL.md 갱신.
  - **단계 포커스**: 순번(칩·배지·목록)을 고르면 그 단계의 엣지(+배지)만 선명하게 남고 나머지 플로우 엣지는 0.15로 가라앉음. 활성 단계 양끝 노드만 온전, 다른 플로우 노드는 soft-dim. 재클릭으로 해제.
  - **EKS 유형 추가**: sample-eks(2레이어 — cluster 그룹 안 파드 그룹 미러 스탬프 + 파드 내부 컴포넌트, KEDA/Karpenter는 엣지 없는 주석 노드, Spot/GPU는 badge). document-types.md에 "쿠버네티스(EKS) 워크로드" 행(1레이어 클러스터 뷰 vs 2레이어 한 장 선택 규칙) 추가. 샘플 총 13종.
  - 검증: 헤드리스 DOM 심 스모크 32항목(scratchpad, 부팅·사이드바·스트립·단계 포커스·메시지 왕복·ERD 컬럼) 통과 + layout-lint + `claude plugin validate` (마켓플레이스·플러그인) 통과.
  - **playground/examples/**: 가상 서비스 "피크닉" 예제 세트 10종(context/container/component/landscape/infra/eks/eks-workloads/flow-booking/event-fanout/erd, 서로 href 드릴다운 연결) — gitignore된 데모. 기존 playground 데모는 삭제됨.
- **v0.6.0 — 엔진 P1: 엣지 겹침·라벨 개선** (2026-07-10):
  - **주행선 분리**: 2칸+ 엣지의 가로/세로 주행선(runY/runX)에 거터 오프셋 적용(clearBand 스냅 **후** 가산 → 같은 밴드에 스냅돼도 분리) — 장거리 엣지 선 포개짐 해소.
  - **거터 슬롯 정렬 배정**: 스펙 순서가 아니라 양끝 교차축 중점 순으로 오프셋 배정 + 엣지 많으면 스텝 자동 축소(거터 폭 GUTTER_HALF×2 초과 방지) — 불필요한 교차 감소.
  - **라벨 디컨플릭트**: 표시될 라벨의 예상 박스(한글 10px/자 추정)끼리 겹침 검사 → 세로 밀어내기 3패스.
  - **라벨 항상 표시 토글**(툴바 Tag 버튼): 줌<0.55에서 라벨 전멸하던 하드코딩을 우회 — "전체를 보면 글씨가 없는" 문제 해소.
  - 검증: DOM 심 스모크 39항목(라벨 y 전부 상이·토글 왕복 포함) 통과.
- **v0.7.0 — zzon-seq 스킬 추가 (시퀀스 다이어그램)** (2026-07-21):
  - **세 번째 스킬 zzon-seq**: 액터 간 시간축 상호작용을 `kind:"sequence"` SeqSpec(actors/steps/fragments)으로 저작 → render-seq.mjs가 의존성 0 단일 .html 렌더. 뷰어(FlowScope 이식): 행 단위 겹침 방지 레이아웃, 액터 아이콘 19종·카테고리 5색(CVD 검증 팔레트), 활성 바(sync 열고 reply 닫음, 미응답은 짧은 펄스), alt/opt/loop/par 중첩 프래그먼트, **전체/간소화 토글**(essential 마킹), 단계 상세 패널(sourceRef), 액터 하이라이트, 둘러보기(단계 재생), **SVG/PNG 다운로드**, zzon-theme 공유.
  - **build-docs 확장(3곳)**: kind:"sequence" → render-seq 라우팅(형제 스킬 경로), KIND_ORDER에 sequence(3번째), 인덱스 KINDS 맵·통계에 시퀀스 배지(액터/메시지 counts). build-wiki는 무수정으로 @diagram 임베드 동작.
  - **라우팅 명문화**: zzon-doc SKILL.md kind 표 + document-types.md C계열 + zzon-wiki(doc-catalog usecase/event-flow)에 위임 기준 — "구조를 지나가는가→data-flow, 순서대로 주고받는가→시퀀스, 병행은 보완".
  - **엔진은 순수 JS로 이식**: FlowScope(TS)를 1회 트랜스파일해 seq-engine.js(1,553줄, 63KB)로 확정 — 레포에 빌드 도구 없이 기존 엔진들과 동일하게 직접 수정한다. 핵심 계약 7 참조.
  - 검증: playground/examples에 시퀀스 2장 혼합 빌드(12장) → 단독 열기·통합 index 배지/카드·iframe 임베드·postMessage 왕복(패널 열림→좌메뉴 접힘, 재오픈→패널 닫힘)·다크 전환 스크린샷 확인, pageerror 0.
- **v0.8.0 — 임베드·사이드바 UX 개선 + 아키텍처 SVG/PNG 내보내기** (2026-07-22):
  - **아키텍처 뷰어 SVG/PNG 내보내기**(render.mjs, 툴바 SVG/PNG 버튼): 노드가 HTML이라 **내보내기 전용 순수 SVG를 재구성**한다(foreignObject 금지 — Figma·편집기 호환). 그룹 언더레이·카드(아이콘·tech 칩·badge·설명)·ERD 테이블(컬럼·PK/FK 태그)은 좌표 기반으로 다시 그리고, 엣지 레이어는 라이브 SVG를 "기본 상태+라벨 항상"으로 재렌더해 복제 후 CSS 변수·color-mix를 `getComputedStyle`로 실값 해석(현재 테마 반영), 라벨 foreignObject는 필+텍스트로 치환. PNG는 그 SVG를 캔버스에 2배로 래스터라이즈. 검증 훅 `window.__zzonExportSvg`.
  - **시퀀스 자동 fit-to-width**(seq-engine boot): 뷰포트보다 넓으면 자동 축소(줌 하한 0.5→0.3, 0.05 단위 내림) — 위키 440px 임베드에서 액터 3명만 보이던 잘림 해소.
  - **시퀀스 드로어가 캔버스를 밈**: `#seq-stage.drawer-open #canvas{right:min(320px,88%)}` — 오버레이 가림 대신 리플로우.
  - **아키텍처 사이드바 팬 시프트**(render.mjs setSideOpen): 열릴 때 transform.x −152px, 닫으면 복귀 — 전체화면에서 사이드바가 그림을 가리던 문제 해소.
  - **위키 본문 반응형**: .page 860px→**1240px**(컨테이너 따라 신축 — 네비 접으면 넓어짐). 확장 figure 96vw·높이 calc(100vh−118px) + `scrollIntoView` — 임베드 사이드바가 사실상 "페이지 오른쪽 전체 높이" 패널이 됨(셸 이식 없이 동일 UX; 부족하면 셸 레벨 미러링이 다음 단계).
  - 검증: 헤드리스 Chrome 스크린샷 4종(임베드 fit 45%·드로어 리플로우·플로우+시프트·위키 와이드) + 콘솔 에러 0 + validate 통과. README 미리보기 스크린샷 5장 갱신(assets/, 시퀀스·위키 신규).
- **v0.8.1 — 통합 다이어그램 엔진(engine/) + terra-form 스킬** (2026-08-01):
  - 별도 프로젝트 infra-architect(TS DSL+자동배치)를 `zzon-doc/engine/`으로 통합(레포 내 vendored, 이식 후 독립). 구조·데이터 다이어그램의 **정본 렌더러**가 됨: ELK+감기 자동배치·libavoid 전역 직교 라우팅·겹침/관통 불변식·AWS 공식 아이콘 838종·카테고리 카드 31종·ERD(까마귀발)·플로우 순번·상세 사이드바·자동 범례·테마 유지.
  - **공용 뷰어 프레임**(viewer-frame.js + references/viewer-frame-contract.md): payload/adapter/셸 postMessage 프로토콜/드릴다운 계약 명문화. F3 패리티 게이트(parity-check.mjs)로 레거시 뷰어와 기능 동등 검증.
  - **build-docs 엔진 컷오버**: DiagramSpec 호환 변환 내장 — 기존 스펙 JSON 그대로 렌더. 레거시는 `ZZON_LEGACY_RENDER=1`/`"renderer":"legacy"`/bun 부재 자동 폴백.
  - **네 번째 스킬 terra-form**: *.tf 스캔→범위 게이트→엔진 DSL 저작→`bun ia render`+불변식 위반 0→패스스루 스펙으로 manifest 정식 편입. zzon-doc SKILL.md도 DSL 저작 절차로 개정(신규 DiagramSpec 저작 deprecated).
- **v0.8.2 — 어휘 정책·시퀀스 카탈로그 슬롯·플로우 라벨 품질** (2026-08-03):
  - terra-form 범위를 AWS 전용에서 **클라우드 전반(IaC 기반)**으로 확장 — 타 클라우드는 카테고리 카드+확장 아이콘(`assets/extra-icons/`).
  - **스펙 단위 어휘 옵션**: 레거시 DiagramSpec에 `"vocabulary": "aws"` 한 줄로 클라우드 아이콘 어휘 선택(정책은 스킬 지침, 메커니즘은 엔진 — 혼용은 validator 차단, `allowMixedVocabulary`로만 허용).
  - **zzon-wiki 카탈로그에 시퀀스 1급 슬롯**(seq-flows 등): 티어 제안 단계에서 시퀀스 후보를 반드시 세어 명시 — 시퀀스가 제안에 자동으로 올라옴.
  - 밀집 플로우 엣지 라벨 개선(통로 폭 적응·카드 위 pill 렌더) + 스텝 포커스가 포커스된 단계의 엣지에만 액센트 유지.
- **v0.8.3 — 뷰어 버그픽스 2건 + 저작 정책 교정** (2026-08-05, 사용처 세션의 진단 리포트 반영):
  - **노드 클릭 먹통(engine/src/render/interactions.ts)**: pointerdown마다 `setPointerCapture` → 이어지는 `click`의 target이 svg 루트로 리타깃 → `closest(".node")` 항상 null. 실마우스에서만 재현(합성 이벤트는 통과)되던 버그. 수정: 캡처를 3px 드래그 임계를 넘긴 첫 pointermove로 지연 + pointerdown target을 저장해 리타깃된 click/dblclick에서 폴백.
  - **플로우 해제 잔상(viewer-frame.js syncHighlight)**: 활성 모드만 어댑터에 보내 꺼진 모드(flow/select)가 캔버스에 누적 잔류(배지 표시·dim 유지). 수정: 꺼진 모드에 target null 해제(§2)를 명시 송신 후 활성 모드 적용. 같은 뿌리의 "플로우 중 노드 선택" 잔상도 함께 해소.
  - 검증: bun test 165 pass + viewer-frame node --test 통과 + **실제 헤드리스 Chrome 차분 회귀**(수정 전 코드로 실패 재현 → 수정 후 전 항목 통과: 리타깃 클릭에 사이드바 열림·플레인 클릭 캡처 0회·플로우 해제 후 active/dim/fade 0, 에러 0). 하니스는 scratchpad(세션 한정).
  - **저작 정책(SKILL.md)**: ① 캔버스 텍스트 절제 — 설명 문장은 전부 `description:`(우측 사이드바), 라벨은 짧게(zzon-doc·terra-form 양쪽 명문화, "아키텍처에 글이 너무 많다" 교정) ② 구조 장에도 대표 경로 `d.flow()` 1~2개 기본 포함(플로우 누락 경향 교정).
- **v0.9.0 — 다이어그램 메인화 + 선택 기준 + 표기 뷰 5종 + 근거 추적** (2026-10-04, 소유자 지시 "순차적으로 모두 진행"):
  - **진단 출발점**: 경쟁 스킬 13종 원문·방법론(C4·ISO 42010·arc42)·가독성 연구(Purchase·Ware·Störrle·Moody) 조사 → "복잡하다"의 대부분이 **부수 복잡도**(엔진 퇴행·카드 속 문장·교차·라벨 관통)였음을 샘플 코퍼스로 실측.
  - **0단계 기반**: Windows 엔진 무한 대기(elk-loader `URL.pathname`) 수정, npm bun 셤 해석(engine-cli.mjs) + 엔진 호출 타임아웃, 카드 설명 옵트인 복원(`nodeDescriptions`), 배치 힌트 실구현(`hints.layer/order` 2패스, 레거시 lane/order/direction 변환 복원), 방향 선언 존중, 같은 열 C자 우회·역방향 S/N·판단 출구 분리, 라벨이 다른 선을 피함, 그룹 제목 장애물, 글줄식 줄바꿈, 미구현 힌트 경고. 하드 게이트 위반 코퍼스 0.
  - **1단계 선택**: selection-rubric.md(뷰 점수·등급·축소 사다리·게이트·보정 기록) + views/*.md + scan.mjs + `bun ia check`(등급 게이트) + build-docs `--status/--stamp`(diagrams.lock.json) + 위키 `--status`에 그림 대조 포함. zzon-doc SKILL.md를 메인 허브로 재작성(description+when_to_use에 모든 차트 이름 한·영), 형제 스킬 3종은 지명형으로 좁힘.
  - **2~4단계 표기 뷰**: 상태 전이도·플로우차트·화면 흐름·도메인 모델(클래스)·모듈 의존성 — 엔진 모양 10종 + UML 화살촉 + 자기 루프 + 의미 검사 + DSL 헬퍼(`d.state/transition/decision/screen/classNode/inherits/…`, `back` 엣지) + scan-deps.mjs(기계 생성). 프레임·통합 문서 종류 칩 등록. bun test 181 pass.
  - **트리거 평가**(`zzon-doc/evals/`, `claude plugin eval . --model opus`): 요청 10종(메인 7·지명 3·무관 1). v0.8.3 = 8/10("상태 전이도"·"플로우차트" 요청에 스킬 0회 호출) → v0.9.0 = 30/30(3회 반복). 스킬 설명을 바꾸면 다시 돌린다.
- **v0.9.0 후속 — 디자인 통일·반응형·문체** (2026-10-04, 소유자 지적 "디자인 통일성이 없음, 전체 페이지가 반응형이 아님", "문서 말투 — 쓸데없는 변수·번호·기호"):
  - **진단**: 글꼴 3종 혼재(셸 Inter→OS 폴백, 엔진 Pretendard 인라인, 시퀀스 ui-sans-serif), 엔진 캔버스만 slate/navy 팔레트(다크 #161E2D), 컨트롤 높이 26/28/34 제각각, 휴대폰에서 셸 메뉴가 본문을 짓누르고 시퀀스 툴바가 가로로 넘침, 화면 밖 패널 그림자가 데스크톱 오른쪽에 회색 띠로 비침, 시퀀스 테마 버튼 아이콘 누락(기존 버그).
  - **토큰 단일화**: design-tokens.mjs 신설 → 5개 화면이 import, 엔진은 복제 + 동기화 테스트. 엔진 `bun ia font-css`로 셸·시퀀스에도 같은 Pretendard 서브셋을 인라인(bun 없으면 OS 글꼴). 시퀀스 범주 색을 엔진 팔레트로, 버튼·칩·제목 칩을 프레임과 같은 모양으로.
  - **반응형**: 셸(통합 문서·위키) 960px 이하 서랍 메뉴+스크림(링크 누르면 닫힘), 휴대폰 상단 바 축약. 뷰어 프레임·시퀀스는 640px 이하에서 상세가 아래 시트가 되고 그림이 시트 위 칸에 다시 맞춰짐, 손가락 입력 36px 컨트롤, 캔버스 두 손가락 핀치 줌(interactions.ts). 시퀀스 툴바는 휴대폰에서 두 줄.
  - **문체**: writing-style.md(규칙 6개, 나쁨/좋음 예) + 스킬 4종 참조, 모범 답안 전부 재작성(위키 샘플 문서·sample-wiki·레거시 샘플 14·시퀀스 2·엔진 예제 11·뷰 템플릿 7, 캔버스 라벨은 불변). 셸 UI에서 섹션 번호·개수 배지·노드/엣지 수·q-id·[actor/action] 제거, 질문 콜아웃은 "확인 필요" 표식, 사이드바 부제는 범주 id 대신 한국어 이름(payload `categoryLabel`).
  - 검증: bun test 184 pass(+토큰 동기화), viewer-frame 24 pass, 패리티 게이트 통과, 실제 Chrome(Playwright)에서 통합 문서·위키 홈/문서/진행·뷰어·시퀀스를 390/768/1440 × 라이트/다크로 찍어 가로 넘침 0·pageerror 0, 서랍·아래 시트·핀치(뷰박스 5배) 동작 확인.
- **v0.9.0 후속 2 — 표기 뷰 카드화·아이콘 세트·저작권 고지** (2026-10-04, 소유자 지적 "상태전이·플로우차트가 성의 없다, 기존 것과 맞춰라", "사용자가 파일 받는 프로세스는 하지 마라", "terra-form 이름 유지"):
  - **표기 노드 = 아키텍처 카드**: state·process·decision·terminal·module을 기존 카드 컴포넌트(아이콘 칸·제목·회색 칩·왼쪽 색 띠)로 그린다(card.ts CARD_SHAPES → 가상 카테고리 n-*). `tone`(wait/done/fail, 모듈은 shared)이 색과 아이콘을 정한다. initial·final·choice·screen·class는 표기 모양 유지. scene 노드는 shape를 유지해 판단 출구 분리·의미 검사가 그대로 동작.
  - **선 라벨 알약**(카드 배경+테두리, 양 끝 둥금), 예·아니오는 초록·빨강, 기본 선·라벨 색이 테마를 따름(다크에서 선이 사라지던 문제), 범례의 헬퍼 레이어 이름 한국어(전이·흐름·의존·상속…). 의존 선은 실선, 공용 모듈은 회색 카드, scan-deps는 "(root)" 대신 파일 이름·캔버스 숫자 제거.
  - **아이콘 세트 추가(재배포 허락된 것만)**: Azure V24 636종 `azure.*`, 쿠버네티스 39종 `k8s.*`(Apache-2.0), SAP BTP 125종 `sap.*`(Apache-2.0) — scripts/import-icon-packs.ts, 별칭 79개, 예제 azure-aks-sample. GCP·국내 클라우드·데이터/SaaS 업체는 재배포 불가 → 카테고리 카드. **아이콘을 사용자가 내려받는 절차는 만들지 않는다(소유자 지시).** 업체 로고는 레포에 넣지 않는다.
  - **저작권 고지 정비**: NOTICE 재작성(Lucide·AWS·Pretendard·CNCF·Karpenter·Azure·K8s·SAP), 폰트 옆 OFL.txt, LICENSES/Apache-2.0.txt, README 한/영 라이선스 절에 "MIT는 이 프로젝트 코드에만" 명시. 스킬 이름 terra-form은 유지(소유자 결정).
  - 검증: bun test 188 pass, viewer-frame 24, 패리티 통과, plugin validate 통과, 트리거 평가 10/10(wiki 1회는 평가 도구의 claude.exe 경로 오류 — 단독 재실행 3/3).
- **v0.9.0 후속 3 — 큰 그림·세부 판단** (2026-10-04, 소유자 지적 "큰 뷰로 그린 아키텍처와 세밀한 아키텍처는 다르다, 같은 리소스로 둘 다 그릴 수 있다, 그걸 판단해야지" / 첫 결과에 "정렬도 선도 없다, 너무 약식"):
  - **판단(zoomPlan, rubric §3.4)**: 세부 노드 ≤9 한 장 · 10~20 큰 그림 권장(문서 세트·독자/매체 혼합) · 21+ 큰 그림 필수. 큰 그림이 9개 이하도 절반 이하도 못 되거나, 선 없는 노드가 4분의 1을 넘으면 "다시 구성하라". `bun ia check`가 "줌 판단"을 출력.
  - **생성(foldModel, `--fold`)**: 큰 그림은 따로 그리지 않고 세부 모델을 접는다 — 같은 이름 잇기 → 같은 종류 합치기 → 횡단 관심사 빼기 → 리소스 묶음 접기(계정·OU·VPC는 공식 컨테이너 아이콘) → 끝 노드 흡수(접은 계정·OU는 제외) → 그래도 넘치면 리전·계정·OU를 노드로(시스템 전체 틀은 접지 않음) → 선 기준 열 배치. 접은 노드는 세부로 드릴다운. 스펙 stub `"overview": true` → build-docs가 `<slug>-overview`를 만들어 세부 바로 앞에 둔다.
  - 검증: tests/fold.test.ts 4개, 랜딩 존·서버리스·Azure 큰 그림 실제 렌더 + 통합 문서에서 더블클릭 드릴다운 확인.
- **v0.9.0 후속 4 — 캔버스 크기·선 겹침·배치 가이드** (2026-10-04, 소유자 요청 "캔버스 크기도 크기에 따라 맞춰서 선이 안 겹치게, 배치도 신경 쓰게 하는 가이드까지"):
  - **선 겹침 측정**(metrics `crowded`): 끝점을 공유하지 않는 두 선이 6px 안으로 16px 넘게 나란히 달리면 겹침. 게이트 "선 겹침"(경고).
  - **캔버스는 필요할 때만 커진다**(pipeline buildScene): 선 겹침이나 라벨 가림이 있으면 간격 1.35배 → 1.7배로 다시 배치하고 가장 깨끗한 결과를 쓴다(elk-adapter `setSpacingScale`, 통로 폭도 비례). 깨끗한 그림은 원래 크기. 서버리스 예제: 겹침 3 → 0(1793×896 → 1974×945). 격자 배치(EKS)는 배율이 먹지 않아 경고로 남는다.
  - **위키 임베드 높이**: build-docs가 manifest에 그림 크기(`size`)를 적고, build-wiki가 그 비율로 창을 잡는다(320–720px, 휴대폰은 70vh 한도).
  - **배치 가이드** `skills/zzon-doc/references/layout-guide.md`: 작성 순서 9단계(방향 → 주 경로 열 → 줄 → 묶기 → 횡단 관심사 띠 → back 선 → 몰리는 선 bundle·중간 노드 → 라벨 2어절 → 진입면) + 엔진이 하는 일 + `bun ia check` 항목별 처방표. SKILL.md 4단계·views/README·rubric 게이트 표에서 참조.
  - 검증: tests/spacing.test.ts 3개(겹침 측정, 재배치로 0, 깨끗한 그림은 기본 크기), bun test 195 pass.
- **v0.9.0 후속 5 — 개발 문서 확장 제안 + 임베드 반응형** (2026-10-04, 소유자 요청 "estel의 IA·디자인 가이드 구조를 차용, 바로 반영보다 가이드와 예시 화면" / 지적 "IA·스토리보드에 화면이 하나도 없다", "반응형으로 만들라고 했지"):
  - **제안서** `proposals/dev-docs-extension.md`: 새 문서 9종(기능 목록·핵심 흐름·IA·화면 설계·스토리보드·디자인 시스템·하위 시스템·개인정보·비용)의 노출 조건과 틀, **화면 정의 파일(`screens.json`)** 하나에서 라우트 트리·와이어프레임·흐름별 프레임을 만드는 화면 렌더러, 블록 어휘, 도입 순서. **스킬에는 아직 넣지 않았다** — 소유자 승인 후. estel은 틀만 참고했고 내용은 가상의 데모숍이다.
  - **예시 위키** `playground/demo-dev-docs/`(gitignore): 회색조 폰 프레임 와이어프레임(시트는 부모 화면 위에), 라우트 트리(앱 시작 분기·영역별 썸네일·딥링크), 스토리보드(누르는 곳 번호), 토큰 시각판. 생성 스크립트는 세션 임시 폴더에 있었다(사라짐) — 렌더러를 스킬에 넣을 때 제안서 기준으로 다시 만든다.
  - **플러그인 반영(반응형 수정)**: build-wiki — 본문 `word-break:keep-all`(한글 낱자 줄바꿈 방지), 표 머리 줄바꿈 금지·휴대폰에서 칸 최소 폭+가로 스크롤, 글처럼 흐르는 임베드가 보내는 `zzon:height`로 iframe 높이 맞춤(테두리 포함), 휴대폰 임베드 최소 높이. 엔진 interactions.ts — 640px 이하 캔버스에서 첫 맞춤만 읽을 수 있는 배율(0.6)로 왼쪽 위부터(맞춤 버튼·더블클릭은 전체). seq-engine — 휴대폰 폭 자동 맞춤 하한 0.6 + 가로 스크롤.
  - 검증: bun test 196 pass, viewer-frame 24 pass, 시퀀스 샘플 2종 브라우저 확인, 위키 7개 문서 390/768/1440에서 가로 넘침 0·pageerror 0. README 미리보기 스크린샷 전면 갱신(큰 그림·세부, Azure, 휴대폰, 개발 문서 미리보기 추가).
- **v0.9.1 — AWS 기술 블로그 문체 + 실사용 문서 전수 개선에서 나온 도구 수정** (2026-10-27, 소유자 요청 "estel 문서 전수 검사·페이지별 설계·깨진 구조·AI 말투 제거, AWS 블로그 말투 리서치, 0.9.1"):
  - **문체**: writing-style.md를 AWS 기술 블로그 10편 리서치로 다시 씀 — 생성 문서 본문 **합니다체**, 문서 틀(개요 → 배경 → 아키텍처 → 동작 흐름 → 설계 결정 → 고려 사항 → 설정 참고 → 관련 자료), 결정·티켓·질문 번호는 관련 자료 절의 이름 링크로만. 번들 샘플(위키 샘플 문서·sample-wiki·레거시 14·시퀀스 2·엔진 예제·뷰 템플릿) 전부 합니다체로. 이 레포 자체의 문서·UI 규칙(한다체)은 그대로다.
  - **문체 검사**: 엔진 `bun ia check`에 "추적 코드" 경고(metrics.ts `TRACKING_CODE`), 위키 `--status`에 문서별 "문체 검사"(본문 추적 코드·줄표, 관련 자료 절·❓·코드 블록 제외).
  - **엔진 수정**: 처음 맞춤이 범례·플로우 버튼·툴바 자리를 비운다(interactions.ts overlayInsets, 줌 기준 `base`) · 세로로 긴 그림은 폭 맞춤 1:1 이하로 위쪽부터(TALL_READABLE) · 간격 재배치가 목표 비율 ±40%를 벗어난 배치에 벌점 · 격자 그림 줌 판단("노드 0개" 버그) · 큰 그림 선을 쌍마다 하나로(양방향은 both) + 선 한도 초과 시 지름길 선 제거(플로우 단계 선은 보존) · 카드 그림의 접힌 노드는 카드로(어휘 혼용 실패 방지) · 접힌 노드 설명 합니다체 · ERD 머리글 "N cols" 제거 · opentype.js 좌표 부동소수 오차로 글자 경로에 NaN이 들어가 정적 SVG·PNG 라벨이 잘리던 버그(tests/text-path.test.ts).
  - **위키**: 큰 그림이 있는 그림을 넣으면 `<slug>-overview`를 바로 앞에 자동으로 넣는다(wiki-spec.md).
  - **실사용 검증(estel, 레포 밖)**: 그림 49 → 58장(큰 그림 6, ERD·시퀀스 분할) 게이트 ✗ 0·불변식 0·추적 코드 0, 문서 49개 합니다체·문서 틀·본문 추적 코드 0(작업 지시문 1개 제외). 페이지별 설계서는 estel `docs/zzon-doc/IMPROVEMENT-PLAN.md`.
  - 검증: bun test 196 pass, viewer-frame 24, plugin validate 통과.
- 남은 엔진 백로그: 그룹 접기·시맨틱 줌·검색(T3 원장 필수 장치 — rubric §3.1), 짝꿍 표(인벤토리) 자동 생성, 접근 세그먼트 회피. (레거시 render.mjs 개선은 폴백 강등으로 하지 않는다.)
- 소유자 표준은 **메모리**에 기록됨(무의존/문서 디자인/레이아웃 품질) — 로컬, 레포 밖.
- git: main에 v0.9.1까지 커밋·푸시됨. **push는 소유자가 지시할 때만.** 사용처 프로젝트는 `/plugin update`로 받는다.

## 다음 작업 (TODO)

1. (선택) info-hub 연동 출력 옵션 — render 대신 실행 중인 info-hub API로 적재하는 모드.
2. (선택) zzon-wiki 승격 자동화 고도화 — manifest의 기존 다이어그램을 위키 문서로 편입하는 대화 절차는 스킬 지침에 있음. 대량 편입 헬퍼 스크립트는 필요해지면.

## 테스트 방법

```bash
# (Windows) bun이 npm 설치본이면 실바이너리를 PATH 앞에: export PATH="$APPDATA/npm/node_modules/bun/bin:$PATH"

# 선택 기준 입력·게이트·근거 대조 (v0.9)
node zzon-doc/skills/zzon-doc/scripts/scan.mjs <프로젝트>                 # 코드 사실 + 뷰 후보
node zzon-doc/skills/zzon-doc/scripts/scan-deps.mjs <프로젝트> --out /tmp/deps.ts   # 의존성 DSL 생성
(cd zzon-doc/engine && bun ia check examples/state-sample.ts)           # 불변식 + 등급 게이트 + 의미 검사
node zzon-doc/skills/zzon-doc/scripts/build-docs.mjs <docsDir> --status  # 근거 대조(쓰기 없음)

# 엔진 준비(1회) + 엔진 단독 렌더·테스트
cd zzon-doc/engine && bun install
bun ia render examples/eks-cluster.ts    # → out/eks-cluster.html (+ .svg, .scene.json)
bun test
cd ../..

# 단일 렌더 (레거시 렌더러 — bun 없이도 동작)
node zzon-doc/skills/zzon-doc/scripts/render.mjs zzon-doc/skills/zzon-doc/references/sample-infra.json -o /tmp/x.html

# 통합 문서 (플러그인 오염 없이 playground에서 — playground/는 .gitignore됨)
# bun 있으면 엔진으로, 없으면 레거시로 자동 폴백 — 명령은 동일
mkdir -p playground/zzon-doc/specs && cp zzon-doc/skills/zzon-doc/references/sample-*.json playground/zzon-doc/specs/
node zzon-doc/skills/zzon-doc/scripts/build-docs.mjs playground/zzon-doc --title "데모 문서"
open -a "Google Chrome" playground/zzon-doc/index.html

# manifest 검증
node -e 'const m=require("./playground/zzon-doc/manifest.json");console.log(m.diagrams.length+"개")'

# 시퀀스 단일 렌더
node zzon-doc/skills/zzon-seq/scripts/render-seq.mjs zzon-doc/skills/zzon-seq/references/sample-seq-booking.json -o /tmp/seq.html

# 위키 (플러그인 오염 없이 playground에서)
mkdir -p playground/wiki-demo/specs
cp zzon-doc/skills/zzon-doc/references/sample-context.json playground/wiki-demo/specs/context.json
cp zzon-doc/skills/zzon-doc/references/sample-full-landscape.json playground/wiki-demo/specs/full-landscape.json
cp zzon-doc/skills/zzon-doc/references/sample-erd.json playground/wiki-demo/specs/erd.json
cp zzon-doc/skills/zzon-wiki/references/sample-wiki.json playground/wiki-demo/wiki.json
cp -R zzon-doc/skills/zzon-wiki/references/sample-docs playground/wiki-demo/docs
node zzon-doc/skills/zzon-wiki/scripts/build-wiki.mjs playground/wiki-demo
node zzon-doc/skills/zzon-wiki/scripts/build-wiki.mjs playground/wiki-demo --status
open -a "Google Chrome" playground/wiki-demo/index.html

# 브라우저 자동화(claude-in-chrome)는 로컬 루프백 접속이 막혀 스크린샷 불가 → open 으로 실제 Chrome에서 확인.
```

## 규칙

- 문서·UI 텍스트 한국어(한다체), 코드 식별자 영어. **예외: 루트 README 2종(한/영)은 대외용** — 한국 유명 OSS 스타일의 합니다체(한)·영어 OSS 관용 구조(영)를 따른다(소유자 지시, 2026-08-04). 한다체로 되돌리지 마라.
- 스킬/플러그인 이름은 `zzon-*` 네임스페이스 유지
- **스킬 산출 폴더 기본값은 대상 프로젝트의 `docs/zzon-doc/`** (v0.8.2 이후). 구버전 기본값인 루트 `zzon-doc/` 산출 폴더가 이미 있으면 그걸 유지한다. 빌드 스크립트는 `<docsDir>` 인자를 받을 뿐 기본값을 강제하지 않는다 — 기본값은 스킬 지침(SKILL.md)이 정한다.
