# DiagramSpec 명세

> DiagramSpec JSON을 저작하는 모든 작업의 계약. render.mjs가 이 형태를 검증하고 렌더링한다.

## 핵심 원칙

1. **픽셀 좌표를 쓰지 않는다.** 배치는 렌더러가 한다. 구조(노드·엣지·그룹)와 의미 힌트(`lane`, `order`)만 기술한다.
2. **모든 참조는 평탄한 배열 + slug id.** 그룹 중첩도 `parentId` 문자열 참조다. 중첩 JSON을 만들지 마라.
3. **id는 사람이 읽는 slug.** `^[a-z0-9][a-z0-9_-]*$`. `order-api`(좋음), `Node_1`/UUID(나쁨).
4. **라벨은 한국어, 기술명은 `tech`에.** `{"label": "주문 API", "tech": "NestJS"}`.

## 최상위 구조

```json
{
  "specVersion": 1,
  "title": "데모숍 인프라 구성도",
  "kind": "infra",
  "description": "선택. 다이어그램 전체 설명.",
  "layout": { "direction": "RIGHT" },
  "groups": [],
  "nodes": [],
  "edges": [],
  "flows": []
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `specVersion` | ✔ | 항상 `1` |
| `title` | ✔ | 다이어그램 제목 (브라우저 탭 제목으로도 쓰임) |
| `kind` | ✔ | `infra` \| `data-flow` \| `erd` \| `agent-topology` |
| `layout.direction` | | `RIGHT`(좌→우 열, 기본) \| `DOWN`(상→하 행) |
| `nodes` | ✔ | 최소 1개 |
| `groups` `edges` `flows` | | 생략 시 빈 배열 |
| `section` | | 통합 문서(build-docs)에서 이 다이어그램이 들어갈 메뉴 그룹명. 생략 시 `kind`로 묶임 |
| `order` | | 통합 문서 메뉴에서 같은 그룹 내 정렬용 숫자(작을수록 위) |

> `section`/`order`는 `build-docs.mjs`가 여러 다이어그램을 메뉴로 묶을 때만 쓰는 힌트다.
> 단일 렌더(render.mjs)에는 영향이 없고, 미지의 필드라 검증도 통과한다.

## 노드

```json
{ "id": "api", "label": "주문 API", "category": "backend", "tech": "NestJS",
  "parentId": "vpc", "description": "주문 생성·조회 담당", "href": "architecture/overview" }
```

- `category` (필수): 아래 목록 중 하나 — 색상·아이콘이 자동 결정된다.
- `description`: 클릭 시 상세 패널에 표시. 한 문장 한다체.
- `href`: 관련 문서 경로 등 임의 문자열. 상세 패널에 표시된다.
- `lane`: 자동 배치(엣지 위상 깊이)를 덮어쓰는 열 번호(0부터). **꼭 필요할 때만.**
- `order`: 같은 레인 안 정렬 순서.
- `table`: ERD 전용 (아래 참조).

### category 목록 (색상 그룹)

| category | 색상 그룹 | category | 색상 그룹 |
|---|---|---|---|
| `user` | user (slate) | `cdn` | edge (rose) |
| `frontend` `mobile` | frontend (sky) | `gateway` `auth` | edge (rose) |
| `backend` `service` `worker` | backend (violet) | `external` | external (zinc, 점선) |
| `lambda` `scheduler` | compute (amber) | `agent` `skill` `hook` | claude (purple) |
| `db` `table` | data (emerald) | `doc` `other` | neutral (gray) |
| `cache` `queue` `storage` | data-aux (teal) | | |

## 엣지

```json
{ "id": "e-api-db", "source": "api", "target": "db", "kind": "write", "label": "주문 저장" }
```

| kind | 의미 | 스타일 |
|---|---|---|
| `http` | 동기 호출 | 실선 화살표 (기본) |
| `event` | 비동기 이벤트 | 점선 + 흐름 애니메이션 |
| `read` / `write` | 데이터 읽기/쓰기 | 가는 점선 / 굵은 실선 |
| `depends` | 의존(에이전트 위임 등) | 회색 점선 |
| `reference` | ERD FK | 가는 실선 |

- `source`/`target`은 **노드 id만** 가능 (그룹 불가).
- id 컨벤션: `e-<source>-<target>`, ERD는 `fk-<source>-<target>`.
- `label`은 선택. 줌이 작아지면 자동으로 숨는다.

## 그룹 (경계 박스)

```json
"groups": [
  { "id": "aws", "label": "AWS (ap-northeast-2)", "kind": "boundary" },
  { "id": "vpc", "label": "VPC", "kind": "vpc", "parentId": "aws" }
]
```

- `kind`: `layer` `vpc` `boundary` `zone` `subnet` (생략 시 `layer`).
  실선 = 물리/소유 경계(vpc, subnet), 점선 = 논리 경계(boundary, zone).
- 그룹은 DOM 컨테이너가 아니라 **멤버 노드 영역 위에 그려지는 언더레이**다.
  → **같은 그룹의 노드는 레인이 연속되게** 구성하라. 흩어지면 박스가 무관한 노드를 삼킨다.
- 두 그룹이 같은 레인을 공유하면 박스가 겹칠 수 있다 → `lane` 오버라이드로 분리하거나 그룹을 빼라.

## 플로우 (클릭하면 경로가 순번과 함께 강조됨)

```json
"flows": [{
  "id": "order", "label": "주문 결제 흐름",
  "description": "결제 완료까지의 전체 경로",
  "steps": [
    { "edge": "e-web-api", "text": "장바구니에서 주문 요청을 전송한다" },
    { "edge": "e-api-pg", "text": "PG에 결제 승인을 요청한다" }
  ]
}]
```

- 순번 = 배열 인덱스 + 1. `steps[].edge`는 **존재하는 엣지 id**여야 한다 (노드 id 아님).
- `text`는 한다체 한 문장. 같은 엣지를 여러 단계가 지나도 된다(배지에 `1·4`처럼 표시).
- 대표 시나리오 1~3개를 만들어라(핵심 기능 흐름, 인증 흐름 등).

## ERD 전용

```json
{ "id": "orders", "label": "orders", "category": "table",
  "table": { "columns": [
    { "name": "id", "type": "bigint", "pk": true },
    { "name": "user_id", "type": "bigint", "fk": { "table": "users", "column": "id" } },
    { "name": "email", "type": "varchar(320)", "unique": true },
    { "name": "deleted_at", "type": "timestamptz", "nullable": true }
  ]}}
```

- `kind: "erd"`면 **모든 노드에 `table` 필수**.
- 컬럼 플래그: `pk` `unique` `nullable` (각각 PK 열쇠 아이콘 / UQ / N 배지).
- FK 엣지는 컬럼 높이에 앵커된다:
  `{ "id": "fk-orders-users", "source": "orders", "target": "users", "kind": "reference", "sourceColumn": "user_id", "targetColumn": "id" }`
- `fk.table`/`fk.column`과 `sourceColumn`/`targetColumn`은 실제 존재하는 테이블 노드 id·컬럼명이어야 한다.

## 레이아웃 설계 가이드 (그리기 전에 먼저 정한다)

렌더러는 **엣지 위상 깊이**로 자동 배치한다(`direction: RIGHT`면 깊이=열, `DOWN`이면 깊이=행).
자동 배치는 노드가 늘면 한쪽으로 쏠린다 — 너무 가로로 길어지거나(레인이 많음), 한 레인에 몰려 너무 세로로 길어진다.
**그리기 전에 아래를 정하면** 겹치지 않고 공간을 고르게 쓴다.

### 1) 방향(direction) 선택
- 좌→우 데이터 흐름·요청 경로, 계층이 얕고 폭이 넓다 → `RIGHT`(기본).
- 위→아래 계통도·트리, 깊이가 깊다 → `DOWN`.

### 2) 가로·세로 균형 — 그리드로 본다
- 목표는 **정사각형에 가까운 배치**. 노드 N개면 **레인 수 ≈ √N**, 레인당 노드 수도 비슷하게.
  예: 16개 → 4열×4, 9개 → 3×3, 12개 → 4×3.
- **한 레인에 5~6개 넘게 쌓이면** 세로로 길어진다 → 일부를 옆 레인으로 분산(`lane`).
- **레인이 7~8개를 넘으면** 가로로 길어진다 → 단계를 합치거나 다이어그램을 쪼갠다.

### 3) lane / order 로 직접 배치
- `lane`(열 번호, 0부터)로 노드를 원하는 열에 고정한다. 자동 깊이가 한쪽으로 쏠릴 때 이걸로 편다.
- 같은 레인 안 위아래 순서는 `order`로 정한다. **연결된 노드끼리 위아래를 맞추면** 엣지가 수평에 가까워져 깔끔하다.

### 4) 그룹은 "세로 밴드"로 (박스 겹침 방지)
- 한 그룹의 멤버는 **같은(또는 연속) 레인**에 두고, 그룹끼리 **레인 범위가 겹치지 않게** 한다.
  → 그룹 박스가 한 열 밴드가 되어 옆 그룹을 삼키지 않는다. (멤버가 여러 레인에 흩어지면 박스가 넓어져 옆 그룹 노드를 머금는다.)
- 그룹 안에 외부(external)·무관 노드가 끼지 않게 한다. 경계가 꼭 필요한 게 아니면 그룹 수를 줄이고, **경계 3겹 이상은 피한다.**

### 5) 엣지가 박스를 가로지르지 않게
- **2칸 이상 건너뛰는 연결**과 **역방향 엣지**를 줄인다 — 중간 그룹 박스를 관통해 지저분해진다.
- 외부 호출(예: 결제 PG) 하나가 멀리 가로지르는 건 어느 정도 불가피하다. 다만 그런 게 여러 개면 배치를 다시 본다.

### 6) 커지면 쪼갠다
- 노드 13개를 넘으면 균형이 깨지기 쉽다 → `lane` 그리드로 **의도적으로** 배치하거나, 안 되면 쪼갠다. **18개 이상은 거의 항상 쪼개는 게 낫다.**
- **동기/비동기가 섞여 되먹임(cycle)** 이 생기면 한 장에 욱여넣지 말고 분리한다(예: 요청 경로 / 비동기 처리 따로).
- 대규모 프로젝트는 보통 **컨텍스트 · 인프라 · 데이터(ERD) · 핵심 플로우** 등 여러 뷰로 나뉜다. 나눈 뒤 통합 문서(build-docs)로 묶으면 메뉴로 오갈 수 있다.

> 모범: `sample-platform-infra.json`은 14노드를 5열×3~4의 균형 그리드 + 4개 세로 밴드 그룹으로 lane 고정한 대규모 예시다.
> `sample-msa-infra.json`도 그룹=단일 레인 밴드로 고정해 박스가 겹치지 않게 했다.

## 자주 하는 실수 (나쁜 예)

| 실수 | 결과 |
|---|---|
| 노드에 `position: {x, y}` | 스키마에 없는 필드 — 무시됨. 좌표를 넣지 마라 |
| 그룹 id를 엣지 endpoint로 사용 | 검증 실패: 그룹은 엣지 끝점이 될 수 없음 |
| `steps[].edge`에 노드 id | 검증 실패: 엣지 id가 아님 |
| 중첩 groups (`children: [...]`) | 알 수 없는 필드 — `parentId`로 평탄하게 |
| ERD 노드에 table 누락 | 검증 실패: ERD는 모든 노드가 테이블 |
| 13개 이상 노드를 한 다이어그램에 | 가독성 붕괴 — 목적별로 쪼개라 |
| 같은 id가 노드·그룹에 중복 | 검증 실패: 노드와 그룹은 같은 네임스페이스 |

## 검증 실패 대응

render.mjs는 실행 전 스펙을 검증하고, 실패 시 `path: 메시지` 목록을 출력한다.
메시지에 **사용 가능한 id 목록**이 들어 있으니, 해당 path만 고쳐 그대로 재실행한다.
추측으로 다른 부분을 바꾸지 마라.

## 모범 답안

같은 디렉터리의 `sample-infra.json`(그룹+플로우), `sample-erd.json`(FK 앵커)이 완성 예시다.
새 다이어그램을 만들기 전에 해당 kind의 샘플을 먼저 읽어라.
