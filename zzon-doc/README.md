# zzon-doc

문서·다이어그램 작성을 돕는 Claude Code 플러그인 묶음(suite).

- **`/zzon-doc:zzon-doc`** — 코드를 분석해 아키텍처/인프라/ERD/Claude 에이전트 다이어그램을 그린다
- **`/zzon-doc:zzon-wiki`** — 프로젝트 개발 문서 위키를 만들고, 코드 스캔 + 질문으로 채운다 (아키텍처 문서에 다이어그램 임베드)

Claude가 (1) 소스를 읽어 **DiagramSpec JSON**을 저작하고 (2) `render.mjs`로 **단일 self-contained `.html`** 을 렌더링한다.
출력 `.html`은 서버·React·CDN·외부 라이브러리 **없이** 브라우저로 열면 인터랙티브하게 동작한다.

## 무엇을 그리나

| kind | 용도 |
|---|---|
| `infra` | 시스템 전체 인프라 (그룹 경계 + 플로우) |
| `data-flow` | 특정 기능·프로세스의 경로 (시퀀스/플로차트 대체) |
| `erd` | DB 테이블 관계 (FK 컬럼 앵커) |
| `agent-topology` | `.claude` 에이전트/스킬/훅 구조 |

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
# zzon-doc/specs/ 에 스펙들을 모아두고 한 번에 빌드 → zzon-doc/index.html 생성
node skills/zzon-doc/scripts/build-docs.mjs ./zzon-doc --title "내 아키텍처 문서"
```

생성된 `index.html` 하나만 브라우저로 열면 모든 다이어그램을 메뉴로 오가며 본다.
역시 서버·라이브러리 0의 self-contained HTML이다.

**문서 위키** — 티어(라이트/표준/풀)를 합의하고 코드 스캔 + 질문으로 채운다. 재실행하면 빠진 문서·사람이 고친 문서(해시 감지)·열린 질문부터 이어간다:

```
/zzon-doc:zzon-wiki 이 프로젝트 문서 위키 만들어줘
```

```bash
# 직접 빌드 (wiki.json + docs/*.md → 위키 index.html)
node skills/zzon-wiki/scripts/build-wiki.mjs ./zzon-doc
node skills/zzon-wiki/scripts/build-wiki.mjs ./zzon-doc --status   # 상태 리포트만
```

위키가 켜지면(`wiki.json` 존재) `index.html`은 위키 셸이 차지하고, 다이어그램 갤러리 빌드는 자동으로 index를 양보한다.

## 인터랙션 (.html)

- **노드 클릭** — 인접 노드·엣지 하이라이트 + 상세 패널(설명·tech)
- **플로우 버튼** — 경로 강조 + 순번 배지 + 단계 패널(드래그 가능)
- **순번 배지·단계 클릭** — ①②③ 배지나 단계 항목을 누르면 해당 단계가 배지·패널에서 함께 강조
- **호버 툴팁** — 버튼·배지에 마우스를 올리면 설명(플로우 설명·단계 텍스트·버튼 기능)
- **팬/줌** — 드래그로 이동, 휠로 확대/축소, `fit` 버튼으로 화면 맞춤
- **다크/라이트** — 우상단 버튼으로 전환
- **범례** — 좌하단 카테고리·엣지 종류

## 구성

```
zzon-doc/
├── .claude-plugin/plugin.json
├── README.md
├── skills/zzon-doc/              # 스킬 1 — 아키텍처 다이어그램
│   ├── SKILL.md                  # 유형 판별 → DiagramSpec 저작 → 렌더 절차
│   ├── references/
│   │   ├── document-types.md     # 유형 카탈로그 (4계열 + 추상화 사다리)
│   │   ├── diagram-spec.md       # 스펙 명세 + 레이아웃 가이드
│   │   └── sample-*.json         # 모범 답안 11종 (컨텍스트·인프라·MSA·멀티리전·
│   │                             #   이벤트·파이프라인·ERD·원장·에이전트 …)
│   └── scripts/
│       ├── render.mjs            # DiagramSpec JSON → 단일 .html (Node 20+ 내장만)
│       ├── build-docs.mjs        # 여러 스펙 → 통합 문서 index.html (메뉴+뷰어)
│       └── layout-lint.mjs       # 렌더 전 배치 검사 (그룹 겹침·삼킴 검출)
└── skills/zzon-wiki/             # 스킬 2 — 프로젝트 문서 위키
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

`render.mjs`의 렌더링 엔진은 라이브러리 의존 0의 순수 HTML/CSS/SVG/바닐라 JS다
(레인 레이아웃, 라운드 직교 엣지 라우팅, 관통 회피, 그룹 언더레이, 팬/줌, 플로우 애니메이션을 직접 구현).
엔진 코드는 `render.mjs` 안에 템플릿 문자열로 인라인되어 한 파일에 출력된다.
**수정하지 마라** — 검증된 포팅본이다.
