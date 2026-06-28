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
