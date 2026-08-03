# SeqSpec — 시퀀스 다이어그램 스펙 정본

`kind:"sequence"` 스펙 하나가 시퀀스 다이어그램 한 장이다. `docs/zzon-doc/specs/<slug>.json`에 두면
build-docs.mjs가 render-seq.mjs로 렌더해 `diagrams/<slug>.html` + manifest에 올린다.
DiagramSpec(infra/data-flow/erd)과 **다른 스키마**다 — 노드·엣지가 아니라 액터·스텝이다.

## 최상위

```json
{
  "specVersion": 1,
  "kind": "sequence",
  "title": "예약 결제 흐름",
  "subtitle": "결제 요청부터 확정 알림까지",
  "description": "2~4문장. 이 프로세스가 무엇이고 왜 이렇게 흐르는지.",
  "section": "기능 흐름",
  "order": 1,
  "actors": [ … ],
  "steps": [ … ]
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `specVersion` | ✷ | 항상 `1` |
| `kind` | ✷ | 항상 `"sequence"` |
| `title` | ✷ | 다이어그램 제목 (한국어) |
| `subtitle` | | 툴바에 표시되는 한 줄 부제 |
| `description` | | 개요 패널·카드 요약에 표시 |
| `section` / `order` | | 통합 문서 메뉴 그룹·정렬 (DiagramSpec과 동일 규약) |
| `actors` | ✷ | 왼→오 표시 순서대로. **첫 등장 순서가 아니라 이야기가 읽히는 순서**로 배치한다 |
| `steps` | ✷ | 위→아래 시간순 |

## Actor

```json
{ "id": "api", "name": "API Server", "type": "server",
  "description": "이 액터가 무엇이고 이 흐름에서 무슨 역할인지 1~2문장. 실제 기술명 포함." }
```

- `id`: slug(`^[a-z0-9][a-z0-9_-]*$`), 유일. 모든 액터는 최소 1개 메시지에 등장해야 한다.
- `type` 19종 → 아이콘·카테고리 색이 자동 부여된다:

| 카테고리(색) | type |
|---|---|
| 클라이언트 | `user` `browser` `mobile` `frontend` |
| 애플리케이션 | `server` `service` `worker` `auth` |
| 데이터 | `database` `cache` `storage` |
| 메시징 | `queue` `email` `scheduler` |
| 외부·인프라 | `external` `cloud` `container` `cdn` `gateway` |

## Step 5종 (배열 순서 = 시간순)

**message** — 화살표 한 개. `from === to`면 셀프 메시지(내부 처리 단계)로 그려진다.

```json
{ "type": "message", "from": "app", "to": "api",
  "label": "POST /v1/bookings { slotId }",
  "arrow": "sync",
  "essential": true,
  "description": "이 단계가 무엇을 하고 왜 필요한지 2~4문장 (클릭 상세 패널에 표시).",
  "sourceRef": "services/api/src/routes/bookings.ts:41" }
```

| arrow | 의미 | 렌더 |
|---|---|---|
| `sync` | 응답을 기대하는 호출 — 대상 액터에 활성 바가 열린다 | 실선 + 채운 화살촉 |
| `async` | fire-and-forget (큐 발행·이벤트) | 실선 + 열린 화살촉 |
| `reply` | 응답/반환 — 대상 활성 바를 닫는다 | 점선 + 열린 화살촉 |

- `label`: 짧고 구체적으로 — **실제 엔드포인트·큐 이름·함수명** (예: `SendMessage → booking-confirm`).
  길면 뷰어가 말줄임하고 클릭 상세에서 전문을 보여주니 라벨을 뭉개지 마라.
- `sourceRef`: 코드에서 확인한 위치(`path:line`). **읽지 않은 것을 지어내지 마라** — 코드가
  없는 대상(순수 설계)만 생략한다.
- `essential: true`: 간소화 보기에 남는 스텝. **전체의 30~40%**에 표시하되, essential만 읽어도
  프로세스가 처음부터 끝까지 이해되게 골라라(요청 시작→핵심 처리→결과 전달은 반드시 포함).

**note** — 액터 옆 참고 메모. `{ "type": "note", "actor": "q", "text": "실패는 DLQ로 — 3회 재시도" }`

**fragment / fragment_else / fragment_end** — 조건·반복 블록. 반드시 짝을 맞춘다(중첩 허용).

```json
{ "type": "fragment", "kind": "alt", "label": "결제 승인", "essential": true },
  … 승인 분기 스텝들 …,
{ "type": "fragment_else", "label": "한도 초과·거절" },
  … 거절 분기 스텝들 …,
{ "type": "fragment_end" }
```

`kind`: `alt`(분기) · `opt`(조건부) · `loop`(반복) · `par`(동시). fragment의 `essential:false`면
간소화 보기에서 틀은 사라지고 essential 자식만 남는다.

## 저작 지침

- **분량**: 액터 3~10 · message 스텝 14~28이 한 장의 적정선. 그보다 크면 기능을 쪼개 여러 장으로.
- **시간순 원칙**: steps 배열이 곧 세로축이다. 병렬은 `par` fragment로 표현하고 순서를 섞지 마라.
- **reply를 아끼지 마라**: sync 호출의 의미 있는 응답(상태 코드·핵심 payload)은 reply로 그려야
  활성 바가 정확히 닫힌다. 응답이 중요하지 않은 내부 쿼리는 reply 생략 가능(짧은 펄스로 렌더됨).
- 모든 산문(description 등)은 한국어, 라벨의 기술 식별자는 원문 유지.

## 뷰어 기능 (렌더 결과 .html)

전체/간소화 토글 · 화살표 클릭 상세 패널(전문 라벨 + 설명 + sourceRef) · 액터 클릭 하이라이트
(무관 메시지 침강) · 둘러보기(단계 재생, ←/→) · 다크/라이트(`zzon-theme` 공유) ·
SVG/PNG 다운로드 · zzon 셸 postMessage(`zzon:sidebar`) 연동. 서버·라이브러리 없이 열린다.

## data-flow(zzon-doc)와의 구분

- **어떤 구조를 지나가는가**가 주인공(토폴로지 + 순번 배지) → zzon-doc `data-flow`
- **누가 누구에게 무엇을 순서대로 주고받는가**(왕복·응답·활성 구간·alt/opt/loop)가 주인공 → 이 스킬
- 같은 주제를 두 표현으로 모두 갖는 것은 중복이 아니라 보완이다(위키에서 나란히 임베드).
