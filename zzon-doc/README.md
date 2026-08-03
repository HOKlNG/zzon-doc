# zzon-doc

문서·다이어그램 작성을 돕는 Claude Code 플러그인 묶음(suite).

- **`/zzon-doc:zzon-doc`** — 코드를 분석해 아키텍처/인프라/ERD/Claude 에이전트 다이어그램을 그린다
- **`/zzon-doc:zzon-seq`** — 코드를 추적해 액터 간 시간축 상호작용을 시퀀스 다이어그램으로 그린다
- **`/zzon-doc:terra-form`** — `*.tf`를 읽어 클라우드 인프라를 그린다 (AWS는 공식 아이콘 838종·AZ×티어 격자·스팬 overlay, 타 클라우드는 카테고리 카드+확장 아이콘)
- **`/zzon-doc:zzon-wiki`** — 프로젝트 개발 문서 위키를 만들고, 코드 스캔 + 질문으로 채운다 (문서에 다이어그램 임베드)

Claude가 (1) 소스를 읽어 스펙 JSON(**DiagramSpec**/**SeqSpec**)을 저작하고 (2) 렌더러로 **단일 self-contained `.html`** 을 렌더링한다.
출력 `.html`은 서버·React·CDN·외부 라이브러리 **없이** 브라우저로 열면 인터랙티브하게 동작한다.
산출물은 대상 프로젝트의 **`docs/zzon-doc/`** 하위에 모인다(specs/·diagrams/·index.html·wiki.json — 구버전 기본값인 루트 `zzon-doc/`가 이미 있으면 그걸 유지).

## 무엇을 그리나

| kind | 용도 |
|---|---|
| `infra` | 시스템 전체 인프라 (그룹 경계 + 플로우) |
| `data-flow` | 구조(토폴로지) 위를 지나는 기능·프로세스 경로 (순번 배지) |
| `sequence` | 액터 간 시간축 상호작용 — 요청/응답 왕복·활성 구간·alt/opt/loop/par (zzon-seq) |
| `erd` | DB 테이블 관계 (FK 컬럼 앵커) |
| `agent-topology` | `.claude` 에이전트/스킬/훅 구조 |

> Terraform(`*.tf`)이 있는 클라우드 인프라는 프로바이더와 무관하게 **terra-form** 스킬이 담당한다. tf가 없으면 `infra` kind로 그린다.

## 사용

`/zzon-doc:zzon-doc <대상>` 으로 호출하거나 자연어로 요청한다.
(플러그인 스킬이라 `플러그인명:스킬명` 네임스페이스가 붙는다.)

```
/zzon-doc:zzon-doc 이 레포 인프라 · /zzon-doc:zzon-doc ERD · 결제 흐름 다이어그램 그려줘
```

직접 렌더링 — 단일 `.html` 한 장:

```bash
node skills/zzon-doc/scripts/render.mjs <spec.json> [-o out.html]
```

여러 아키텍처를 **통합 문서**로 묶기 (좌측 메뉴 + 전체보기 + 뷰어):

```bash
# docs/zzon-doc/specs/ 에 스펙들을 모아두고 한 번에 빌드 → docs/zzon-doc/index.html 생성
node skills/zzon-doc/scripts/build-docs.mjs ./docs/zzon-doc --title "내 아키텍처 문서"
```

생성된 `index.html` 하나만 브라우저로 열면 모든 다이어그램을 메뉴로 오가며 본다.
역시 서버·라이브러리 0의 self-contained HTML이다.

**시퀀스 다이어그램** — `kind:"sequence"` 스펙(SeqSpec)을 같은 `specs/`에 두면 build-docs가 자동으로 zzon-seq 렌더러로 라우팅한다. 단독 렌더:

```
/zzon-doc:zzon-seq 결제 흐름 시퀀스로 그려줘
```

```bash
node skills/zzon-seq/scripts/render-seq.mjs <spec.json> [-o out.html]
```

**Terraform 인프라** — `*.tf` 경로를 주면(비우면 `./infra` 탐색) 내장 엔진으로 클라우드 인프라를 그린다:

```
/zzon-doc:terra-form ./infra
```

**문서 위키** — 티어(라이트/표준/풀)를 합의하고 코드 스캔 + 질문으로 채운다. 재실행하면 빠진 문서·사람이 고친 문서(해시 감지)·열린 질문부터 이어간다:

```
/zzon-doc:zzon-wiki 이 프로젝트 문서 위키 만들어줘
```

```bash
# 직접 빌드 (wiki.json + docs/*.md → 위키 index.html)
node skills/zzon-wiki/scripts/build-wiki.mjs ./docs/zzon-doc
node skills/zzon-wiki/scripts/build-wiki.mjs ./docs/zzon-doc --status   # 상태 리포트만
```

위키가 켜지면(`wiki.json` 존재) `index.html`은 위키 셸이 차지하고, 다이어그램 갤러리 빌드는 자동으로 index를 양보한다.

## 인터랙션 (.html)

- **노드 클릭** — 인접 노드·엣지 하이라이트 + **우측 상세 사이드바**(설명·tech·ERD 컬럼·연결 목록·드릴다운 링크)
- **플로우 버튼** — 경로 강조 + 순번 배지 + 버튼 아래 **순번 스트립** + 우측 사이드바에 단계 목록
- **순번 배지·스트립·단계 클릭** — ①②③ 어디를 눌러도 해당 단계가 배지·스트립·목록에서 함께 강조
- **좌우 상호 배타(통합 문서)** — 우측 사이드바가 열리면 좌측 메뉴가 접히고, 좌측 메뉴를 다시 열면 우측이 닫힌다
- **호버 툴팁** — 버튼·배지에 마우스를 올리면 설명(플로우 설명·단계 텍스트·버튼 기능)
- **팬/줌** — 드래그로 이동, 휠로 확대/축소, `fit` 버튼으로 화면 맞춤
- **SVG/PNG 내보내기** — 우측 툴바 버튼. foreignObject 없는 순수 벡터 SVG(문서·Figma에 그대로)와 2배 해상도 PNG, 현재 테마 색으로 저장
- **다크/라이트** — 우상단 버튼으로 전환 (`zzon-theme` 키를 시퀀스 뷰어와 공유)
- **범례** — 좌하단 카테고리·엣지 종류
- **시퀀스 뷰어(zzon-seq)** — 전체/간소화 토글 · 화살표 클릭 상세(설명·근거 코드 위치) · 액터 하이라이트 · 둘러보기(단계 재생 ←/→) · SVG/PNG 다운로드

## 구성

```
zzon-doc/
├── .claude-plugin/plugin.json
├── README.md
├── engine/                       # 내장 TS 다이어그램 엔진 (ELK 자동배치 · 직교 라우팅 · AWS 아이콘 838종)
│                                 #   준비: cd engine && bun install (bun 없으면 레거시 렌더러 폴백)
├── skills/zzon-doc/              # 스킬 1 — 아키텍처 다이어그램
│   ├── SKILL.md                  # 유형 판별 → DiagramSpec 저작 → 렌더 절차
│   ├── references/
│   │   ├── document-types.md     # 유형 카탈로그 (4계열 + 추상화 사다리)
│   │   ├── diagram-spec.md       # 스펙 명세 + 레이아웃 가이드
│   │   └── sample-*.json         # 모범 답안 13종 (컨텍스트·컨테이너·컴포넌트·인프라·
│   │                             #   EKS·MSA·멀티리전·이벤트·파이프라인·ERD·원장·에이전트 …)
│   └── scripts/
│       ├── render.mjs            # DiagramSpec JSON → 단일 .html (Node 20+ 내장만)
│       ├── build-docs.mjs        # 여러 스펙 → 통합 문서 index.html (kind:"sequence"는 zzon-seq로 라우팅)
│       └── layout-lint.mjs       # 렌더 전 배치 검사 (그룹 겹침·삼킴 검출)
├── skills/zzon-seq/              # 스킬 2 — 시퀀스 다이어그램
│   ├── SKILL.md                  # 판별(vs data-flow) → 코드 추적 → SeqSpec 저작 → 렌더
│   ├── references/
│   │   ├── seq-spec.md           # SeqSpec 명세 (actors/steps/fragments, essential 규칙)
│   │   └── sample-seq-*.json     # 모범 답안 2종 (alt/else 결제 · loop/par 배치)
│   └── scripts/
│       ├── render-seq.mjs        # SeqSpec JSON → 단일 .html (검증 + 엔진 인라인)
│       └── seq-engine.js         # 시퀀스 뷰어 엔진 (순수 JS 정본)
├── skills/terra-form/            # 스킬 3 — Terraform 클라우드 인프라
│   └── SKILL.md                  # *.tf 판독 → engine/ TS DSL 저작 → 렌더 (스크립트는 engine/ 공용)
└── skills/zzon-wiki/             # 스킬 4 — 프로젝트 문서 위키
    ├── SKILL.md                  # 스캔 → 티어 승인 → 섹션 루프(질문) → 빌드
    ├── references/
    │   ├── wiki-spec.md          # wiki.json 스키마 + md 규약 (정본)
    │   ├── doc-catalog.md        # SI 12섹션 카탈로그 템플릿 (티어·질문 은행)
    │   ├── sample-wiki.json      # 모범 답안 + 검증 픽스처
    │   └── sample-docs/          # 모범 문서 md
    └── scripts/
        └── build-wiki.mjs        # wiki.json + docs/*.md → 위키 index.html (--status)
```

## 엔진 노트

구조·데이터 다이어그램(infra/data-flow/erd/agent-topology)은 `engine/`의 **내장 TS 엔진**이 렌더한다
(ELK 자동배치 + 직교 라우팅 + 겹침·관통 불변식 — lane/order 수동 조정·layout-lint 불필요).
기존 DiagramSpec JSON은 변환이 내장돼 그대로 렌더되며, `ZZON_LEGACY_RENDER=1` 또는 스펙에
`"renderer":"legacy"`를 주면 레거시 렌더러를 쓴다(bun이 없어도 자동으로 이 경로로 폴백).
단, 엔진 DSL(.ts)로 저작한 다이어그램과 terra-form은 엔진 전용이라 **bun이 필수**다 — 폴백은 레거시 DiagramSpec JSON에만 해당한다.
레거시 렌더러(`render.mjs`)는 라이브러리 의존 0의 순수 HTML/CSS/SVG/바닐라 JS 정본으로 유지되고,
시퀀스 엔진(`seq-engine.js`)도 같은 방식의 순수 JS 정본으로 `render-seq.mjs`가 출력에 인라인한다.
출력 `.html`은 엔진 경로와 무관하게 항상 self-contained(외부 요청 0)다.
**다이어그램을 그릴 때는 엔진을 수정하지 마라** — 엔진 개선은 별도 작업이며 반드시 브라우저 렌더로 재검증한다.
