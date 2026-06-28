# zzon-doc

문서·다이어그램 작성을 돕는 Claude Code 플러그인 묶음(suite).

- **`/zzon-arch`** (현재) — 코드를 분석해 아키텍처/인프라/ERD/Claude 에이전트 다이어그램을 그린다
- *`/zzon-doc` (예정)* — 문서 작성 기능

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

`/zzon-arch <대상>` 으로 호출하거나 자연어로 요청한다.

```
/zzon-arch 이 레포 인프라 · /zzon-arch ERD · 결제 흐름 다이어그램 그려줘
```

직접 렌더링:

```bash
node skills/zzon-arch/scripts/render.mjs <spec.json> [-o out.html]
```

## 인터랙션 (.html)

- **노드 클릭** — 인접 노드·엣지 하이라이트 + 상세 패널(설명·tech)
- **플로우 버튼** — 경로 강조 + 순번 배지 + 단계 패널(드래그 가능)
- **팬/줌** — 드래그로 이동, 휠로 확대/축소, `fit` 버튼으로 화면 맞춤
- **다크/라이트** — 우상단 버튼으로 전환
- **범례** — 좌하단 카테고리·엣지 종류

## 구성

```
zzon-doc/
├── .claude-plugin/plugin.json
├── README.md
└── skills/zzon-arch/
    ├── SKILL.md                  # 코드분석 → DiagramSpec 저작 → 렌더 절차
    ├── references/
    │   ├── diagram-spec.md       # 스펙 명세 + good/bad 예시
    │   ├── sample-infra.json     # 모범 답안 (그룹 + 플로우)
    │   └── sample-erd.json       # 모범 답안 (FK 앵커)
    └── scripts/render.mjs        # DiagramSpec JSON → 단일 .html (Node 20+ 내장만)
```

## 엔진 노트

`render.mjs`의 렌더링 엔진은 라이브러리 의존 0의 순수 HTML/CSS/SVG/바닐라 JS다
(레인 레이아웃, 라운드 직교 엣지 라우팅, 관통 회피, 그룹 언더레이, 팬/줌, 플로우 애니메이션을 직접 구현).
엔진 코드는 `render.mjs` 안에 템플릿 문자열로 인라인되어 한 파일에 출력된다.
**수정하지 마라** — 검증된 포팅본이다.
