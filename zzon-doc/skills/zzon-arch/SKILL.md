---
name: zzon-arch
description: 코드베이스나 설명을 분석해 아키텍처/인프라/ERD/Claude 에이전트 다이어그램을 그린다. DiagramSpec JSON을 저작한 뒤 render.mjs로 의존성 0짜리 인터랙티브 단일 .html을 생성한다. "아키텍처 그려줘", "인프라 다이어그램", "ERD 만들어줘", "이 시스템 구조를 시각화" 같은 요청에 사용한다.
argument-hint: [그릴 대상 — 예: "이 레포의 인프라" 또는 "DB 스키마 ERD"]
---

# 아키텍처 다이어그램 그리기

코드를 분석해 **DiagramSpec JSON**을 저작하고, `scripts/render.mjs`로 **단일 self-contained `.html`** 을 렌더링한다.
출력 `.html`은 서버·React·CDN·외부 라이브러리 **없이** 브라우저로 열면 인터랙티브하게 동작한다
(노드 클릭 하이라이트, 플로우 순번 강조, 팬/줌, 범례, 다크/라이트 토글).

## 절차

### 1. 무엇을 그릴지 정한다 (kind 선택)

| kind | 용도 | 특징 |
|---|---|---|
| `infra` | 시스템 전체 인프라 구성 | 그룹(VPC/경계/계층) + 플로우 |
| `data-flow` | 특정 기능·프로세스의 경로 | 플로우 중심. 시퀀스·플로차트 대체 |
| `erd` | DB 테이블 관계 | **모든 노드에 `table` 필수**, FK 컬럼 앵커 |
| `agent-topology` | `.claude` 에이전트/스킬/훅 구조 | category: agent/skill/hook |

> 하나의 거대한 다이어그램보다 **목적별로 작은 다이어그램 여러 개**가 낫다.
> 노드가 13개를 넘으면 쪼개라.

### 2. 코드를 분석한다

요청 대상에 맞춰 실제 소스를 읽고 구조를 추출한다.

- **infra / data-flow**: 진입점, 서비스 경계, 외부 의존, 데이터 저장소, 큐/캐시, 비동기 흐름.
  단서: `docker-compose.yml`, `*.tf`/CDK, `package.json` 의존성, 라우터·컨트롤러, env 설정, README 아키텍처 절.
- **erd**: 마이그레이션/스키마 파일(`schema.prisma`, `*.sql`, ORM 모델). 테이블·컬럼·타입·PK·FK·UNIQUE·NULL을 정확히 옮긴다.
- **agent-topology**: `.claude/agents/*`, `.claude/skills/*`, `.claude/hooks/*`, settings의 위임 관계.

추측하지 말고 **읽은 것**을 근거로 노드/엣지를 만든다. 모르면 사용자에게 묻는다.

### 3. DiagramSpec JSON을 작성한다

스키마 전체 규칙과 good/bad 예시는 **`references/diagram-spec.md`** 를 읽어라.
핵심만:

- 픽셀 좌표 금지. 배치는 렌더러가 한다. 구조 + 의미 힌트(`lane`, `order`)만 기술.
- 모든 참조는 평탄한 배열 + slug id (`^[a-z0-9][a-z0-9_-]*$`). 그룹 중첩도 `parentId` 문자열.
- 라벨은 한국어, 기술명은 `tech` 필드. 설명은 `description`(한 문장, 한다체).
- 대표 시나리오 1~3개를 `flows`로 만들면 클릭 시 경로가 순번과 함께 강조된다.

모범 답안 2종이 `references/`에 있다: `sample-infra.json`(그룹+플로우), `sample-erd.json`(FK 앵커).
새로 만들기 전에 해당 kind 샘플을 먼저 읽어라.

작성한 스펙을 작업 디렉터리에 저장한다 (예: `./<이름>.json`).
파일 본문은 DiagramSpec 그 자체이거나 `{ "spec": { ... } }` 래퍼 둘 다 허용된다.

### 4. 렌더링한다

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/zzon-arch/scripts/render.mjs <spec.json> [-o out.html]
```

- 기본 출력은 입력과 같은 위치의 `<이름>.html`.
- render.mjs가 먼저 **검증**한다(필수 필드 + 참조 무결성). 실패하면 `path: 메시지` 목록과 함께
  비정상 종료하고 사용 가능한 id를 알려준다 → 해당 위치만 고쳐 재실행한다(추측으로 다른 곳 건드리지 말 것).
- Node 20+ 내장 모듈만 쓴다. `npm install` 불필요.

### 5. 사용자에게 결과를 전한다

생성된 `.html`의 절대 경로를 알려주고, **브라우저로 그냥 열면** 된다고 안내한다.
가능하면 무엇을 그렸는지(노드/그룹/플로우 요약)를 한 줄로 덧붙인다.

## 출력 .html에서 할 수 있는 것

- 노드 클릭 → 인접 노드·엣지 하이라이트 + 상세 패널(설명·tech)
- 플로우 버튼 클릭 → 경로 강조 + 순번 배지 + 단계 패널(드래그 가능)
- 드래그로 팬, 휠로 줌(`fit` 버튼으로 화면 맞춤), 줌이 작으면 라벨 자동 숨김
- 우상단 버튼으로 다크/라이트 전환, 좌하단 범례

## 주의

- `render.mjs`를 수정하지 마라. 엔진은 검증된 포팅본이다.
- 에이전트가 만드는 건 **DiagramSpec JSON** 까지다. HTML 직접 작성 금지.
