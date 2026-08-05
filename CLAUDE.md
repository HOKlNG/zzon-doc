# zzon-doc — 인수인계 (CLAUDE 세션용)

이 레포는 **Claude Code 플러그인 마켓플레이스**다. 코드를 분석해 인터랙티브 아키텍처·시퀀스 다이어그램과 프로젝트 문서 위키를 **의존성 0짜리 단일 .html**(산출물 기준)로 만들어 주는 스킬 4종을 담는다.

## 네이밍 (혼동 주의)

| 층 | 이름 | 비고 |
|---|---|---|
| 마켓플레이스 | `zzon` | `.claude-plugin/marketplace.json` (레포 루트) |
| 플러그인(우산) | `zzon-doc` | `zzon-doc/.claude-plugin/plugin.json` |
| 스킬 1 | `zzon-doc` | → `/zzon-doc:zzon-doc` (플러그인 스킬은 `플러그인명:스킬명` 네임스페이스). 아키텍처 다이어그램 |
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
    │   ├── examples/*.ts               # DSL API 정본 7종 (serverless/eks/multi-account/multi-region/msa/erd/flow)
    │   ├── tests/                      # 불변식 검사(invariants.ts) 등 — bun test
    │   └── package.json / bun.lock     # elkjs·libavoid-js·resvg 등 (node_modules는 gitignore, bun install 1회)
    ├── skills/zzon-doc/                # 스킬 1 — 아키텍처 다이어그램
    │   ├── SKILL.md                    # 범위 게이트 → 유형 판별·어휘 결정 → 엔진 DSL(.ts) 저작 → build-docs 렌더
    │   ├── references/
    │   │   ├── document-types.md       # 유형 카탈로그 4계열(개요/구조·인프라/흐름/데이터) + 추상화 사다리
    │   │   ├── diagram-spec.md         # (레거시) DiagramSpec 스펙 + 레이아웃 가이드
    │   │   ├── viewer-frame-contract.md# 뷰어 프레임 계약 v1 (payload/adapter/셸 프로토콜/glyph/드릴다운)
    │   │   └── sample-*.json           # (레거시) DiagramSpec 모범 답안 14종 — 변환 내장으로 여전히 렌더됨
    │   └── scripts/
    │       ├── build-docs.mjs          # 여러 스펙 → 통합 문서 index.html (기본: 엔진 CLI(bun), sequence→render-seq, 폴백: legacy / wiki.json 있으면 index 양보)
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
- 남은 엔진 백로그는 P2~P3(같은 레인 좌측 C자 우회·접근 세그먼트 회피·lint 엣지/라벨 검사·그룹 접기·시맨틱 줌) — 메모리 `zzon-engine-priorities` 참조. (레거시 render.mjs 개선 백로그는 폴백 강등으로 우선순위 하락.)
- 소유자 표준은 **메모리**에 기록됨(무의존/문서 디자인/레이아웃 품질) — 로컬, 레포 밖.
- git: main에 v0.8.3까지 커밋·푸시됨(0.8.2 통합 후속 커밋 → README 재작성 → 뷰어 버그픽스 → 0.8.3 릴리스). **push는 소유자가 지시할 때만** — 이 시점까지는 소유자 지시로 푸시 완료. 사용처 프로젝트는 `/plugin update`로 0.8.3을 받는다.

## 다음 작업 (TODO)

1. (선택) info-hub 연동 출력 옵션 — render 대신 실행 중인 info-hub API로 적재하는 모드.
2. (선택) zzon-wiki 승격 자동화 고도화 — manifest의 기존 다이어그램을 위키 문서로 편입하는 대화 절차는 스킬 지침에 있음. 대량 편입 헬퍼 스크립트는 필요해지면.

## 테스트 방법

```bash
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
