---
name: zzon-doc
description: 코드베이스나 설명을 분석해 아키텍처/인프라/ERD/Claude 에이전트 다이어그램을 그린다. 동봉 엔진(TS DSL → 자동배치 → 셀프컨테인드 인터랙티브 .html)으로 렌더한다. "아키텍처 그려줘", "인프라 다이어그램", "ERD 만들어줘", "이 시스템 구조를 시각화" 같은 요청에 사용한다.
argument-hint: '[그릴 대상 — 예: 이 레포의 인프라 / DB 스키마 ERD]'
---

# 아키텍처 다이어그램 그리기

코드를 분석해 **엔진 DSL**(`.ts`)을 저작하고 동봉 엔진(`${CLAUDE_PLUGIN_ROOT}/engine`, bun+TS)으로
의존성 0짜리 단일 `.html`을 만든다. 여러 장이면 `build-docs.mjs`로 통합 문서에 묶는다.

> 엔진은 진짜 자동 배치(ELK+격자+직교 라우팅)라 **lane/order 수동 조정과 layout-lint가 없다** —
> 대신 렌더 후 불변식 검사(겹침·관통·라벨 충돌 0)를 통과시킨다.
> 시간축 왕복(요청/응답·alt/loop)은 여전히 **zzon-seq** 스킬이다. AWS Terraform 인프라는 **terra-form** 스킬이 전문이다.

## 1. 범위를 먼저 잡는다 (가장 중요 — 기존 게이트 유지)

- **구체적 요청** → 바로 그 한 장.
- **포괄적 요청** → **① 구조·개수 파악 → ② "문서 목록+장수+뎁스" 제안·승인(3택: 개괄/사다리 세트/풀뎁스 원장) → ③ 작성.**
  승인 없이 그리지 마라. 큰 프로젝트는 기능·도메인별로 쪼갠다(한 장 ~13노드 내외 권장, 원장은 예외).

## 2. 유형 판별 → 저작 방식

| 유형 | 저작 |
|---|---|
| A 개요(컨텍스트·랜드스케이프), B 구조 중 C4/MSA/도메인 | **카테고리 카드 노드**(`category:`/`tech:`/`description:`, AWS 아이콘 금지 관례) — 참고: `engine/examples/msa-sample.ts` |
| B 구조 중 클라우드/멀티리전/EKS/계정위계/네트워크 | **AWS 아이콘 + grid/overlay/band** — 참고: `engine/examples/serverless-sample.ts`, `eks-cluster.ts`, `multi-account-lz.ts`, `multi-region-cicd.ts`. tf가 있으면 terra-form 스킬 절차로 |
| C 흐름(기능·이벤트·CI/CD) | 구조 + **`d.flow()`**(엣지 순번+내레이션, 뷰어에서 클릭 하이라이트), `docKind:"data-flow"` |
| D ERD | **`table:` 노드** + `sourceColumn/targetColumn` + 카디널리티, `docKind:"erd"` — 참고: `engine/examples/erd-sample.ts` |
| 시퀀스 | zzon-seq로 위임 |

## 3. DSL 계약 (틀리기 쉬움)

- 소스는 `<docsDir>/terra/<slug>.ts`, **engine/examples에 있는 것처럼** `import { diagram } from "../src/dsl/index.ts"` 로 쓴다(엔진이 임시 복사로 해석).
- 노드: `icon:`(AWS 838종+lucide, `grep engine/src/icons/manifest.gen.ts`로 실재 확인) **또는** `category:`(31종) **또는** `table:` — 셋 중 하나.
- `description:`은 사이드바에, `href:`는 형제 slug 드릴다운에 쓰인다. 엣지는 `layer:` 필수.
- 격자는 `grid()`+`cell()`, 스팬 그룹은 `overlay()`, 외부 시스템은 `band("right")`, 순번 마커는 `step()`.
- 넓거나 좁은 그림은 `diagram(id, { aspectRatio })`로 의도 선언. 추측 금지 — 읽은 것만 그린다.

## 4. 렌더 + 통합 문서

스펙 stub을 `<docsDir>/specs/<slug>.json`에 두면 build-docs가 엔진을 bun으로 직접 렌더한다:

```json
{ "renderer": "terra-form", "kind": "infra|data-flow|erd|agent-topology",
  "title": "…", "section": "…", "order": 0, "description": "…", "source": "terra/<slug>.ts" }
```

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/zzon-doc/scripts/build-docs.mjs <docsDir> --title "<제목>"
```

counts는 scene.json에서 자동 산출된다. `wiki.json`이 있으면 build-wiki도 이어서 실행.

**품질 게이트(필수)** — 렌더 후 불변식 0 확인, PNG 육안 확인:

```bash
cd ${CLAUDE_PLUGIN_ROOT}/engine && bun -e 'import { loadDiagram, buildScene } from "./src/pipeline.ts"; import { checkScene } from "./tests/invariants.ts"; const m = await loadDiagram("<abs>/terra/<slug>.ts"); const s = await buildScene(m); console.log(checkScene(s, { aspectRatio: m.aspectRatio })); process.exit(0)'
```

## 출력 .html에서 되는 것 (사용자에게 안내)

팬/줌 · hover 인접 하이라이트 · **layer 토글** · **플로우 버튼+순번 배지+내레이션 스트립(클릭 포커스)** ·
**노드 클릭 → 상세 사이드바**(설명·연결 목록·드릴다운) · **`href` 드릴다운**(통합 문서에서 장 이동) ·
ERD 카디널리티(까마귀발)·컬럼 앵커 엣지 · 자동 범례 · 다크/라이트(`zzon-theme` 동기화) · SVG/PNG 내보내기(CLI `bun ia export --png`).

## 절대 규칙

- 그릴 때 엔진 코드를 고치지 마라 — 만드는 건 **DSL `.ts` + 스펙 stub JSON까지**. (엔진 개선은 별도 작업.)
- 불변식 위반이 남은 채 전달 금지. 추측으로 그리지 마라 — 모르면 물어라.
- 레거시 DiagramSpec JSON(render.mjs)은 **deprecated** — 기존 문서 호환용으로만 남아 있다. 신규 저작 금지.
