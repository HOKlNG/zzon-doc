---
name: zzon-doc
description: 코드베이스나 설명을 분석해 아키텍처/인프라/ERD/Claude 에이전트 다이어그램을 그린다. DiagramSpec JSON을 저작한 뒤 render.mjs로 의존성 0짜리 인터랙티브 단일 .html을 생성한다. "아키텍처 그려줘", "인프라 다이어그램", "ERD 만들어줘", "이 시스템 구조를 시각화" 같은 요청에 사용한다.
argument-hint: '[그릴 대상 — 예: 이 레포의 인프라 / DB 스키마 ERD]'
---

# 아키텍처 다이어그램 그리기

코드를 분석해 **DiagramSpec JSON**을 저작하고 `scripts/render.mjs`로 의존성 0짜리 단일 `.html`을 만든다.
여러 장이면 `scripts/build-docs.mjs`로 통합 문서에 묶는다. 출력은 서버·라이브러리·CDN 없이 브라우저로 그냥 연다.

> kind 고르기 → 코드 분석 → 스펙 작성 → 렌더 → 전달은 알아서 진행한다.
> 이 문서는 **비구체적 요청일 때의 범위 잡기**와 **틀리기 쉬운 계약**만 못박는다.

## 1. 범위를 먼저 잡는다 (가장 중요)

요청을 분류한다 — **무턱대고 그리지 마라.**

- **구체적 요청** — "이 결제 흐름 그려줘", "인프라 한 장", 특정 기능·로직·스키마 지정 → 바로 그 한 장을 그린다.
- **포괄적·모호한 요청** — "이 프로젝트 그려줘", "전체 구조" 처럼 범위 미정 → **거대한 한 장을 즉흥으로 그리지 말고:**
  1. 구조만 빠르게 훑는다(엔트리포인트·서비스 경계·데이터·외부 의존·비동기·`.claude`). 파악만, 아직 안 그림.
  2. 요약해서 **사용자에게 범위를 제안·확인한다** — 어디까지(전체/특정 도메인) · 어느 수준(컨텍스트 개요/서비스 상세/ERD/핵심 플로우) · 몇 장으로.
  3. **추천안을 먼저 낸다.** 예: "A·B·C 서비스 + Postgres + SQS 구조다. ①전체 인프라 ②결제 플로우 ③DB ERD로 나누는 걸 추천. 이대로 갈까, 더 좁힐까?"
  4. 합의해 목록을 확정한 뒤 그린다. 여러 장이면 통합 문서로 묶는다.

## 2. kind

| kind | 용도 | 메모 |
|---|---|---|
| `infra` | 시스템 인프라 구성 | 그룹(VPC/경계/계층) + 플로우 |
| `data-flow` | 기능·프로세스 경로 | 플로우 중심. 시퀀스/플로차트 대체 |
| `erd` | DB 테이블 관계 | **모든 노드에 `table` 필수**, FK 컬럼 앵커 |
| `agent-topology` | `.claude` 에이전트/스킬/훅 | category: agent/skill/hook |

분석 단서: `docker-compose.yml`·`*.tf`/CDK·`package.json`·라우터/컨트롤러·env / `schema.prisma`·`*.sql`·ORM / `.claude/{agents,skills,hooks}`.
추측하지 말고 **읽은 것**만 옮긴다. 모르면 묻는다.

## 3. 스펙 작성 — 계약 (틀리기 쉬움)

- **작성 전 `references/diagram-spec.md`를 읽고, 해당 kind의 샘플을 먼저 본다.** (references/에 7종: infra · msa-infra · platform-infra(대규모) · event-flow · erd · erd-large · agent-topology)
- **레이아웃**: 픽셀 좌표 금지. `lane`/`order`로 √N 그리드처럼 분산해 가로·세로 쏠림을 막고, **그룹은 같은 레인 밴드로 모아 박스 겹침을 피한다.** 노드 13↑/되먹임이면 쪼갠다. (가이드는 diagram-spec.md의 "레이아웃 설계 가이드".)
- 평탄 배열 + slug id(`^[a-z0-9][a-z0-9_-]*$`). 그룹 중첩도 `parentId` 문자열.
- 라벨 한국어, 기술명 `tech`, 설명 `description`(한 문장). 대표 플로우 1~3개를 `flows`로.
- 통합 문서 메뉴용 선택 필드: `section`(그룹명), `order`(정렬).

## 4. 렌더 — 명령어 (경로 정확히)

**기본: 통합 문서.** 스펙을 `zzon-doc/specs/`에 모으고(파일명 = 메뉴 slug) 한 번에 빌드한다.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/zzon-doc/scripts/build-docs.mjs ./zzon-doc --title "<제목>"
```

→ `zzon-doc/{specs/, diagrams/, index.html, manifest.json}` 생성. `index.html`을 브라우저로 연다.
출력 폴더는 인자로 변경 가능(기본 `zzon-doc/`). 스펙을 고치고 다시 실행하면 index가 갱신된다.

**단일 한 장만:**

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/zzon-doc/scripts/render.mjs <spec.json> [-o out.html]
```

렌더 전 **검증**한다. 실패 시 `path: 메시지` + 사용 가능한 id를 출력 → **그 path만 고쳐 재실행**(추측으로 다른 데 건드리지 마라). 둘 다 Node 20+ 내장만, `npm install` 불필요.

## 출력 .html에서 되는 것 (사용자에게 안내)

노드 클릭(인접 하이라이트+상세) · 플로우 버튼(경로 강조+순번 배지+단계 패널) · **배지(①②③)·단계 클릭→해당 단계 강조** · **버튼·배지 호버→설명 툴팁** · 팬/줌 · 다크/라이트 · 범례.

## 절대 규칙

- `render.mjs` 엔진을 수정하지 마라(검증된 포팅본). 통합·문서 기능은 호출만 한다.
- 만드는 건 **DiagramSpec JSON 까지**. HTML 직접 작성 금지.
- 라이브러리/프레임워크/CDN 0. 순수 바닐라 + Node 내장만.
