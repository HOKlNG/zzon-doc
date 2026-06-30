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

> **가장 흔한 실수: 뭐든 `RIGHT`로 한 줄로 늘어놓는 것.** 복잡해질수록 한 방향으로 길게 늘어진다.
> **고치는 법: 구간(섹션)별로 묶어 `lane`×`order`를 2D 격자처럼 쓴다 — 가로·세로를 둘 다 채운다.**

### 0) 핵심 사고 — `lane`×`order` = 2D 격자
- `lane` = **주축 칸**(RIGHT면 열, DOWN이면 행). `order` = **교차축 칸**(RIGHT면 같은 열의 위아래, DOWN이면 같은 행의 좌우).
- **둘 다 의도적으로 채워라.** `lane`만 키우면 한 줄(가로/세로 일자)이 된다. `order`로 교차축을 채워야 공간이 산다.
- 단일 노드로 뭉치지 말고 펼칠 수 있는 건 펼친다(아래 3).

### 1) 방향은 모양 보고 고른다 — `RIGHT`가 기본 아님, **통일 강박 금지**
- **순차 파이프라인** A→B→C → `RIGHT`. 단 6칸 넘게 길면 병렬을 펼치거나 접어서 줄인다.
- **공통 진입 + 병렬 다수**(게이트웨이→여러 도메인, 한 토픽→여러 구독자) → `DOWN`(진입 위, 병렬 아래로 펼침)이 가로 일자보다 낫다.
- **계층/포함**(인프라·AZ·클러스터) → 중첩 그룹 위주.
- **한 다이어그램을 한 방향으로 통일하려 하지 마라.** 섹션마다 성격이 다르면 `order`로 층을 나눠 섞는다.

### 2) 역할로 "띠(band)"를 나눠라 — 흐름만 따라가지 말 것
- **공통·횡단 관심사**(API Gateway, 인증, 관측, IAM 등 *모든 요청이 거치는 것*)는 **전용 띠**(맨 위 또는 가장자리)에 모은다. **한 도메인 박스 안에 묻지 마라** — 인증은 회원 도메인 소속이 아니라 공통이다.
- 비즈니스 도메인/티어는 그 아래(또는 옆) **다른 띠**에 둔다.
- 예: 상단 `공통(Gateway·Auth)` 띠 + 하단 도메인 행(각 도메인은 service→db 세로 스택).

### 3) 교차축으로 병렬을 펼쳐라 — 납작한 일자 금지
- **병렬을 단일 노드로 뭉치지 마라.** 3개 큐·3개 모델 풀·멀티 AZ는 `order`로 **나란히 펼쳐** 교차축을 채운다. 뭉치면 가로 일자가 된다.
- fan-out/fan-in 지점이 공간을 살리는 핵심 — 거기서 세로(또는 가로)로 벌린다.

### 4) 그룹 — 깊이 맞추고, 밴드로
- 같은 층의 그룹은 **깊이(차지하는 레인 수)를 맞춰라.** 한 도메인만 3단이면 옆 박스와 어긋나 겹친다.
- 한 그룹 멤버는 같은/연속 레인 밴드, 그룹끼리 레인 범위 비중첩. 경계가 꼭 필요한 게 아니면 줄인다.
- **단, 인프라 중첩(Region>VPC>AZ>Subnet>Node>Pod)은 깊어도 된다** — 동심 박스로 잘 나온다. AZ 복제는 AZ를 옆 `lane`으로, 내부를 `order`로 쌓는다.

### 5) 엣지가 박스를 관통하지 않게
- 2칸+ 점프·역방향 엣지를 줄인다(중간 박스 관통). 외부 호출 하나가 멀리 가는 건 불가피.

### 6) 크면 크게 + 줌 (무조건 쪼개지 마라)
- 종합 인프라·랜드스케이프는 13 넘어도 **크게 그리고 줌으로 본다.** `≤13`은 "한눈 가독성" 기본값일 뿐 절대 상한이 아니다.
- 단 **되먹임(cycle)이 심하거나** 성격이 완전히 다른 뷰(컨텍스트 vs ERD vs 흐름)는 나눠서 통합 문서(build-docs)로 묶는다.

### 7) 엔진이 못 하는 것 — 헛수고 말 것
- **자유 2D 좌표 · 허브를 정가운데 두고 방사형 · 한 노드에 여러 방향 동시 진입 · 자동 폴딩** = 안 된다.
- 방향 + `lane`/`order` 격자 + 중첩으로 최대한 잘 배치하는 게 현실. 픽셀 단위 자유배치가 꼭 필요한 그림이면 이 도구 범위 밖이다(draw.io 영역).

> 모범: `sample-platform-infra`(균형 격자+세로 밴드), `sample-msa-infra`(단일 레인 밴드).
> **가로(또는 세로) 일자가 나오면 위 0·1·2·3을 의심하라** — 방향이 틀렸거나, 병렬을 뭉쳤거나, 공통을 안 띄웠거나, `order`를 안 썼다.

### 자가질문 — 그리기 전·후 스스로 답한다 (하나라도 "아니오"면 다시 설계)

**유형**
1. 이건 무슨 문서인가? (`document-types.md`로 판별) — 그 유형의 권장 방향·배치를 따랐나?

**공통·구조**
2. 공통·횡단(Gateway·인증·관측·IAM)을 **전용 띠**로 묶었나? 한 도메인 박스에 묻지 않았나?
3. 진입점/공통이 한쪽(위 또는 왼쪽)에서 **부채꼴로 펼쳐지나**? (엔진이 교차축을 가운데 정렬하므로, 혼자인 공통 노드는 자식들 위 가운데로 온다.)

**배치**
4. **한 방향 일자(가로 또는 세로)로만 늘어놓지 않았나?** `lane`만 키우고 `order`를 안 썼으면 의심.
5. 병렬(여러 큐·AZ·구독자·모델)을 **단일 노드로 뭉치지 않았나?** `order`로 펼쳤나?
6. 같은 층 그룹의 **깊이(레인 수)를 맞췄나?** 박스끼리 레인 범위가 안 겹치나?
7. 엣지가 2칸+ 점프하거나 역방향이 많지 않나? (엔진이 **박스 관통은 자동으로 막아 우회**시키지만, 점프가 많으면 형제를 **같은 레인에 쌓아** 정리하는 게 낫다.)

**규모**
8. 13노드를 넘으면 — 크게+줌으로 한 장에 갈지, 목적별로 쪼개 통합 문서로 묶을지 정했나?

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
