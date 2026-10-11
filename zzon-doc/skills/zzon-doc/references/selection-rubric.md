# 선택 기준 — 무엇을, 얼마나 복잡하게 그릴지

> 그리기 전에 두 가지를 결정한다. ① **뷰**(어떤 종류의 그림인가) ② **등급**(얼마나 복잡하게 그리는가).
> 정해진 뷰를 어떻게 그리는지는 `views/*.md`가 다룬다. 이 문서는 그 앞 단계다.
> 측정 도구는 셋이다.
> - 코드 신호: `scripts/scan.mjs`
> - 품질 게이트: `bun ia check`(engine `src/quality/metrics.ts`)
> - 근거 대조: `build-docs --status`
>
> 근거 출처는 §8에 있다. 수치는 문헌 초기값을 샘플 코퍼스로 보정한 값이다(§5).

## 0. 원칙

1. **한 장 = 한 질문 = 한 추상화 수준.** 독자의 관심사가 뷰를 정한다(ISO 42010: 이해관계자 → 관심사 → 뷰포인트 → 뷰).
   관심사가 여럿 섞인 요청에는 "마스터 다이어그램" 한 장을 그리지 않는다. 여러 장으로 내고 드릴다운(`href`)으로 잇는다.
2. **복잡도는 두 종류다.**
   - **필요 복잡도**: 실제 요소가 많아서 생기는 복잡함이다. 등급(§3)으로 허용한다.
   - **부수 복잡도**: 교차·라벨 가림·카드 속 문장·방향 흔들림·색 과다다. 등급과 상관없이 게이트(§4)로 막는다.
3. **판단은 측정 가능한 신호로 한다.** 모델의 재량은 동점일 때만 쓴다. 신뢰도가 낮으면 묻는다. 질문은 1개, 선택지는 2개이고 각각 이유를 붙인다.
4. **줄이는 것은 정해진 순서로만 한다**(축소 사다리 §3.3). 줄인 내용은 반드시 장부로 보고한다.
5. **그림은 근거 파일에 묶인다.** 장마다 `sources`를 기록한다. 코드가 바뀐 뒤의 갱신 여부는 해시로 판정한다(§6).

## 1. 입력 신호 — 판단 전에 먼저 모은다

| 기호 | 신호 | 측정 |
|---|---|---|
| **R** | 요청어 | 요청 문장에서 §2.1·§3.2의 신호어를 찾는다(한국어·영어) |
| **C** | 코드 사실 | `node scripts/scan.mjs <루트>` — IaC 리소스·배포 단위·테이블·라우트·큐/토픽·상태 머신/enum·화면·에이전트·소스 모듈 수, 그리고 뷰 후보 |
| **A** | 독자 | 요청어로 판별한다. "경영진·발표·고객"이면 비기술, "운영·장애·감사·감리"면 운영·감사, 그 외는 개발자 |
| **M** | 매체 | 호출 맥락으로 판별한다. 위키 본문 임베드, 단독 전체화면, README·슬라이드 중 하나다 |
| **N** | 요소 수 | 선택한 추상화 수준에서 축소 사다리 1~2단계를 적용한 뒤 남는 주 요소 수 |

## 2. 1단계 — 관심사 → 뷰

### 2.1 뷰 카탈로그

| 뷰 | 답하는 질문 | 지명어 (10점) | 관심사어 (5점) | 코드 신호 (2점, scan) | 피할 때 | 담당 |
|---|---|---|---|---|---|---|
| **context** | 이게 뭐고, 누가 쓰고, 무엇에 기대나 | 컨텍스트, context | 개요·한눈에·전체 그림·overview | (큰 요청의 첫 장) | 내부 구조를 물을 때 | `views/context.md` |
| **container** | 배포 단위·기술·통신 | 컨테이너, C4 | 구조·아키텍처·구성·architecture | 배포 단위 ≥2 | LB·AZ·복제가 관심사일 때 | `views/container.md` |
| **component** | 서비스 하나의 내부 책임 | 컴포넌트, 모듈 구조 | 내부 구조·레이어 | 한 컨테이너에 소스 모듈 ≥5 | 그 컨테이너가 초점이 아닐 때 | `views/container.md` |
| **deployment** | 어디서 어떻게 도나, 신뢰 경계 | 인프라, 배포 구성, 네트워크, terraform, k8s | AZ·VPC·클러스터·보안 존 | IaC·k8s·compose 존재 | 논리 구조만 물을 때 | tf 있으면 terra-form, 없으면 `views/deployment.md` |
| **flow** | 이 기능·데이터가 어떤 구조를 지나가나 | 데이터 흐름도, data-flow, 파이프라인, CI/CD | 흐름·경로·처리 과정 | 큐/토픽/컨슈머 ≥2 | 왕복·분기가 주인공일 때(→ sequence) | `views/flow.md` |
| **sequence** | 누가 누구에게 어떤 순서로 주고받나 | 시퀀스, sequence | 호출 순서·응답·왕복·재시도·타임아웃 | 라우트 ≥5 (대표 프로세스마다) | 구조 전체를 보여줘야 할 때 | zzon-seq |
| **erd** | 테이블과 관계 | ERD, 스키마, schema | 테이블·엔터티·관계 | 테이블 ≥3 | 데이터 이동을 물을 때 | `views/erd.md` |
| **state** | 하나의 대상이 어떤 상태를 거치나 | 상태도, 상태 전이, state machine, lifecycle | 상태·단계·승인 흐름·취소/환불 | 상태 머신·상태 enum ≥1 | 여러 대상의 상호작용(→ sequence) | `views/state.md` |
| **flowchart** | 판단 분기를 따라 무엇을 하나 | 플로우차트, 순서도, flowchart | 절차·분기·조건·런북·정책 판단 | (코드 분기·검증 로직) | 구성요소 간 통신(→ flow·sequence) | `views/flowchart.md` |
| **dependency** | 모듈이 서로 무엇에 의존하나 | 의존성, dependency graph, import 구조 | 모듈 관계·레이어 위반·순환 | 소스 모듈(파일 ≥3) ≥3 | 런타임 통신(→ container) | `views/dependency.md` |
| **screen-flow** | 화면이 어떻게 이어지나 | 화면 흐름, 화면 전환, screen flow, IA | 페이지·내비게이션·사용자 동선 | 화면/페이지 ≥3 | 백엔드 처리(→ sequence) | `views/screen-flow.md` |
| **domain-model** | 도메인 개념과 관계(상속·합성) | 클래스 다이어그램, 도메인 모델, class diagram | 엔터티·애그리거트·상속 | (클래스·엔터티 정의) | 저장 스키마(→ erd) | `views/domain-model.md` |
| **agent-topology** | Claude 에이전트·스킬·훅 구성 | 에이전트 구성 | 서브에이전트·스킬·훅 | `.claude/` 존재 | — | `views/agent-topology.md` |
| **inventory** | 무엇이 전부 있나 | 전체 목록, 인벤토리, inventory | 빠짐없이·감사·감리 | — | 이해·설명이 목적일 때 | 해당 뷰의 T3 원장 + 짝꿍 표 |

**범위 밖**: 간트·WBS·마인드맵·타임라인·통계 차트는 PM 도구나 차트 도구의 영역이다. 사용자에게 범위 밖임을 알리고 대안(Mermaid 블록 등)을 제시한다. 아키텍처 카드로 억지로 그리지 않는다.

### 2.2 결정 규칙

1. 신호마다 점수를 더한다. 같은 뷰에 요청어를 중복으로 가산하지 않는다. 코드 신호는 해당하는 항목마다 2점이다.
2. **최고점이 10 이상이고 2위와 5점 이상 차이 나면 확정한다.** 그렇지 않으면 상위 2개를 이유와 함께 한 질문으로 묻는다.
3. 동점이면 지명어 > 코드 신호 > 기본 세트(§2.3) 순으로 정한다.
4. **flow와 sequence의 객관 경계**: 추적 경로에 의미 있는 왕복(응답이 다음 행동을 결정)이 2개 이상이거나 분기·재시도·타임아웃이 1개 이상이면 sequence 후보다. 둘 다 기준을 넘으면 둘 다 그린다(보완 관계).
5. **state와 flowchart의 경계**: 한 대상의 상태 값이 바뀌는 것이 주인공이면 state, 판단 분기를 따라 행동이 이어지는 것이면 flowchart다.

### 2.3 포괄적 요청의 기본 세트 ("아키텍처 그려줘", "문서화해줘")

C4 권고에 따르면 컨텍스트와 컨테이너면 대부분의 팀에 충분하다. 나머지는 scan 신호가 조건을 충족할 때만 더한다.

| 장 | 조건 (scan) | 기본 등급 |
|---|---|---|
| context | 항상 | T1 |
| container | 항상 (배포 단위 1개면 component로 대체) | T2 |
| deployment | IaC·k8s·compose 있음 | T2 (환경 전체 원장은 요청이 있을 때 T3) |
| erd | 테이블 ≥3 | T2 (장당 ≤12, 도메인 분할) |
| sequence | 왕복·분기 프로세스마다 (인증·결제 등) | 액터 ≤8 · 메시지 ≤28 |
| state | 상태 머신·상태 enum마다 (주문·결제 등 핵심 엔터티 우선) | T2 |
| flow | 비동기 경로가 핵심일 때 | T2 |
| dependency | 소스 모듈 ≥3이고 독자가 개발자일 때 | 모듈 수로 결정 |
| screen-flow | 화면 ≥3이고 UX 섹션이 있을 때 | T2 |
| component · domain-model · flowchart | 질문이 그것을 지목할 때만 | T2 |

## 3. 2단계 — 밀도 등급

### 3.1 등급 정의

| | **T1 개괄** (`overview`) | **T2 표준** (`standard`) | **T3 원장** (`reference`) |
|---|---|---|---|
| 주 요소 N | ≤ 9 | ≤ 20 (권장 ≤ 15) | ≤ 50 |
| 엣지 | ≤ 12 | ≤ 1.5 × N | ≤ 1.5 × N |
| 그룹 깊이 | 0–1 | ≤ 2 | 인프라 중첩이면 제한 없음 |
| 색 그룹 수 | ≤ 6 | ≤ 6 | ≤ 8 |
| 카드 속 설명 문장 | 컨텍스트 뷰만 (`nodeDescriptions`) | 없음 (사이드바) | 없음 (사이드바) |
| 엣지 라벨 | 의도 동사, ≤ 2어절 | ≤ 2어절 | ≤ 2어절 |
| 필수 장치 | — | 대표 flow 1–2개 | 그룹 위계 · layer 토글 · flow ≥1 · 사이드바 상세 · 짝꿍 표 · 상위 T1 장에서 드릴다운 |
| 매체 | README·슬라이드·위키 본문 | 위키 본문·단독 | **단독 전체화면만** |

### 3.2 등급 선택 규칙 (위에서부터 적용)

1. **뷰가 정하는 등급**
   - context: T1
   - component: T2
   - erd: T2, 장당 ≤12. 넘으면 도메인 분할
   - sequence: 자체 한도(액터 ≤8 · 메시지 ≤28)
   - dependency: 집계한 모듈 수 N
2. **요청어**
   - T1 신호: 간단히·한눈에·요약·개요·발표·경영진·simple·overview
   - T3 신호: 전체·빠짐없이·원장·인벤토리·감사·감리·운영 대응·한 장에 다·everything·inventory
3. **매체 상한**: README·슬라이드는 T1까지, 위키 본문 임베드는 T2까지다. T3는 전체화면 링크로 건다.
4. **독자**: 비기술 독자는 T1, 운영·감사 독자는 T3를 허용, 개발자는 T2다.
5. 해당하는 규칙이 없으면 **T2**다.

**T3 허용 조건 — 셋 다 충족해야 한다.**
- 관심사가 운영·감사·인벤토리·환경 전체(IaC)이거나, 사용자가 명시했다.
- 매체가 단독 전체화면이다.
- 같은 주제의 T1 장이 함께 있고 `href`로 연결된다.

**N이 등급 하한보다 작으면** 등급을 낮춘다. 요소를 억지로 채우지 않는다.

DSL 머리에 선언한다: `diagram(slug, { view: "<뷰>", tier: "overview" | "standard" | "reference", … })`. 게이트가 이 값으로 판정한다. 선언하지 않으면 노드 수로 추정한다.

### 3.3 N이 상한을 넘을 때 — 축소 사다리 (고정 순서, 건너뛰기 금지)

1. **중복 병합**: 같은 역할의 반복(크론 N개, 워커 N개, AZ별 동일 리소스)은 노드 1개 + `sublabel: "×N"`으로 줄인다.
2. **횡단 관심사 정리**: IAM·로그·모니터링·시크릿·CI는 엣지 없는 하단 밴드로 모으거나 생략한다. 관심사가 보안·운영이면 유지한다.
3. **리프 클러스터 접기**: 자식이 전부 리프인 그룹은 그룹 노드 1개로 접는다.
4. **단말 노드 흡수**: 차수 1인 노드는 이웃의 `sublabel`·`description`으로 흡수한다.
5. **분할**: 개괄 1장(존을 노드로) + 존별 상세 장으로 나누고 `href`로 드릴다운을 잇는다.

**충실도 장부 (전달 시 필수)**: "원천 X개 → 그림 Y개 (병합 a · 접음 b · 생략 c: 목록)".

### 3.4 큰 그림과 세부 그림 — 같은 리소스를 두 장으로 그릴지

같은 리소스를 묶음 단위로 접은 **큰 그림**과 리소스 단위의 **세부 그림** 두 장으로 낼지는 그린 모델에서 센 수로 정한다. `bun ia check`가 "줌 판단"으로 출력한다.

| 세부 그림의 노드 수 | 판단 | 할 일 |
|---|---|---|
| 9개 이하 | 한 장 | 이 장이 곧 큰 그림이다 |
| 10~20개 | 큰 그림 권장 | 전체 문서 세트, 독자나 매체가 섞인 경우(README와 위키에 같이 싣기 등)에 큰 그림을 함께 낸다 |
| 21개 이상 | 큰 그림 필수 | 큰 그림을 함께 내고, 큰 그림의 노드에서 세부 그림으로 드릴다운한다 |

**큰 그림은 따로 그리지 않고 세부 모델에서 만든다.** 스펙 stub에 `"overview": true`를 쓰면 build-docs가 같은 DSL을 접어(`bun ia render <파일> --fold`) `<slug>-overview` 장을 함께 만든다. 이름·아이콘·색이 두 장에서 저절로 일치한다. 접는 순서는 축소 사다리(§3.3)와 같다.

1. 같은 이름 잇기: 묶음과 이름이 같은 노드(관리 계정 안의 "Workloads OU" 아이콘 등)는 그 묶음으로 본다.
2. 같은 종류 합치기: 한 부모 아래 같은 아이콘이나 같은 카드는 하나로 묶는다.
3. 횡단 관심사 빼기: 모니터링·시크릿·IAM.
4. 리소스만 든 묶음 접기: 계정·OU·VPC는 그 종류의 공식 아이콘으로, 같은 리소스 묶음(Lambda ×3)은 그 리소스 아이콘으로 바뀐다.
5. 연결이 하나뿐인 끝 노드 흡수: 접어서 만든 계정·OU는 흡수하지 않는다.
6. 그래도 넘치면 한 단계 위 묶음(리전·계정·OU)을 접는다. 그림의 절반 이상을 감싼 틀은 시스템 자체라 접지 않는다.

**큰 그림이 성립하지 않는 경우**
- 9개 이하로도, 세부의 절반 이하로도 줄지 않는다. 묶음 구조가 없다는 뜻이다. 21개 이상이면 세부 모델을 묶음으로 다시 구성하라는 판단이 나온다.
- 큰 그림 노드의 4분의 1 넘게 선 없이 떠 있다. 묶음 사이의 관계를 세부 그림에 선으로 그려야 큰 그림에 남는다.

## 4. 3단계 — 등급별 품질 게이트 (`bun ia check`)

렌더한 scene에서 자동으로 측정한다. ✗는 고친 뒤에만 전달한다. !는 개선을 시도하고, 남기면 이유를 보고한다.

| 지표 | T1 | T2 | T3 | 판정 | 근거 |
|---|---|---|---|---|---|
| 불변식 (노드·엣지 겹침, 관통, 라벨 충돌, 미라우팅) | 0 | 0 | 0 | ✗ | DESIGN §11 |
| 노드 수 / 엣지 수 | §3.1 | §3.1 | §3.1 | ✗ | Störrle · Yoghourdjian |
| 라벨 가림 (다른 엣지가 라벨을 관통) | 0 | 0 | 0 | ✗ | — |
| 선 겹침 (다른 선이 6px 안으로 나란히) | 0 | 0 | 0 | ! | 엔진이 간격 1.35·1.7배로 재배치한 뒤에도 남은 것 — 처방은 layout-guide.md 4절 |
| 엣지당 교차 | 0 | ≤ 0.1 | ≤ 0.25 | ! | Purchase 1997: 교차가 최대 요인 |
| 엣지당 평균 꺾임 | ≤ 2 | ≤ 2.5 | ≤ 3 | ! | Ware 2002 연속성. 직교 라우팅의 팬인·팬아웃은 Z자(꺾임 2)가 정상이라 보정 |
| 색 그룹 수 (카드 카테고리 → 색상군) | ≤ 6 | ≤ 6 | ≤ 8 | ! | Moody PoN: 색상 구분 한계 ~6 |
| 흐름 방향 일관성 (data-flow만) | ≥ 0.8 | ≥ 0.8 | ≥ 0.7 | ! | Burattin 2016 |
| 종횡비 (N > 9만) | 0.25–4 | 0.25–4 | 0.25–4 | ! | 매체 적합 |
| 캔버스 설명 문장 (T1 아닌데 `nodeDescriptions`) | — | 0 | 0 | ! | — |
| 엣지 없는 노드 | 의도된 주석만 | 〃 | 〃 | ! | Ilograph |
| 원장 대표 flow | — | — | ≥ 1 | ! | Shneiderman: 개요 → 확대·필터 → 상세 |

**지우기 시험 (자문)**: 지워도 이 장의 질문에 여전히 답이 되는 노드·엣지·라벨이 있는가? 있으면 지운다.

> Störrle 연구에 따르면 배치 결함은 큰 다이어그램에서 이해도를 더 크게 떨어뜨린다. 그래서 **T3일수록 배치 품질이 더 중요하다.**
> T3의 한도가 느슨한 것은 실현 가능성 때문이지, 품질을 덜 따져도 된다는 뜻이 아니다.
> 엔진은 배치를 돕는다. 작성자가 `direction` + `hints.layer`/`order`로 열 구조를 밝히면 그 의도대로 배치한다.

## 5. 보정 기록 — 샘플 코퍼스 (2026-10-03)

v0.8.3 엔진과 v0.9 엔진(배치 힌트·같은 열 C자 우회·라벨의 엣지 회피·글줄 감기)을 같은 샘플로 비교했다.

| 샘플 | 등급 | N | 교차/엣지 v0.8.3 → v0.9 | 라벨 가림 v0.9 | 판정 v0.9 |
|---|---|---|---|---|---|
| context | T1 | 6 | 0.00 → 0.00 (세로로 쌓이던 배치 → 좌·중·우 정석 배치) | 0 | 통과 |
| container | T2 | 16 | 0.13 → 0.00 | 0 | 경고(색 7) |
| component | T1 | 9 | 0.11 → 0.00 | 0 | 통과 |
| full-landscape | T3 | 27 | 0.15 → 0.04 | 0 | 경고(주석 노드) |
| infra | T2 | 11 | 0.33 → 0.00 | 0 | 경고(색 7) |
| msa-infra | T2 | 13 | 0.77 → 0.31 | 0 | 경고(교차) |
| platform-infra | T2 | 14 | 0.64 → 0.64 (열 구조는 복원, 통로 교차 잔존) | 0 | 경고(교차) |
| eks | T2 | 20 | 0.83 → 0.11 | 0 | 경고(교차) |
| data-pipeline | T2 | 12 | 0.33 → 0.08 | 0 | 경고(흐름 방향) |
| event-flow · multiregion · erd ×2 · agent-topology | T1 | ≤8 | 0 → 0 | 0 | 통과 |

- **측정법**: 직교 선분의 진성 교차만 센다. 같은 끝점을 공유하는 엣지 쌍(팬 번들)은 제외한다.
- **하드 게이트(✗) 위반은 0이다.** 경고는 작성 단계에서 힌트로 줄이는 몫이다.

## 6. 근거 추적 — 갱신이 누락되지 않게

- 장마다 스펙 stub의 `sources`에 근거 파일 glob을 적는다(프로젝트 루트 기준).
- `build-docs`는 빌드할 때 스펙(stub+DSL)이 바뀐 장의 근거 해시와 git 커밋을 `diagrams.lock.json`에 스탬프한다.
- `build-docs --status`는 쓰기 없이 판정만 한다.
  - fresh / stale(변경·추가·삭제 파일, `git diff` 명령) / untracked(sources 없음) / edited(수정 후 미빌드)
  - scan 신호 변화와, 그 신호에 기대는 뷰
- 재진입("업데이트해줘·다시 훑어줘")의 첫 행동은 `--status`다. stale 장은 변경 파일을 읽고 갱신한다. 바꿀 필요가 없으면 `--stamp <slug>`로 명시하고 이유를 보고한다.

## 7. 결정 기록

1. 미지원이던 유형(상태 전이·플로우차트·모듈 의존성·화면 흐름·도메인 모델)은 범위 밖이 아니라 **추가 개발**한다(2026-10-03, 소유자).
   - 새 스킬로 쪼개지 않고 메인 스킬 zzon-doc의 뷰로 둔다. 스킬이 늘면 스킬 선택 오류가 커지기 때문이다.
   - 차트 이름은 메인 스킬의 트리거 목록과 `views/*.md`로 붙인다.
2. T3 상한 50: 밀집 그래프에서는 50노드, 희소 그래프에서는 100노드 근처에서 경로 찾기가 무너진다(Yoghourdjian 2021).
3. 수치는 §5 코퍼스로 보정했다. 새 샘플이 늘면 같은 방식으로 다시 잰다.

## 8. 출처

**방법론**
- C4: [다이어그램 유형](https://c4model.com/diagrams), [FAQ](https://c4model.com/faq), [체크리스트](https://c4model.com/diagrams/checklist)
- arc42: [§5 빌딩 블록](https://docs.arc42.org/section-5/), [§6 런타임](https://docs.arc42.org/section-6/), [§7 배포](https://docs.arc42.org/section-7/)
- ISO 42010 요약: [quality.arc42.org](https://quality.arc42.org/standards/iso-42010)
- Azure: [설계 다이어그램 가이드](https://learn.microsoft.com/en-us/azure/well-architected/architect-role/design-diagrams)
- Ilograph: [다이어그램 실수 7가지](https://www.ilograph.com/blog/posts/diagram-mistakes/), [7가지 더](https://www.ilograph.com/blog/posts/more-common-diagram-mistakes/), [마스터 다이어그램 쪼개기](https://www.ilograph.com/blog/posts/breaking-up-the-master-diagram)

**실증 연구**
- Purchase 1997: [GD'97](https://link.springer.com/chapter/10.1007/3-540-63938-1_67)
- Ware 외 2002: [Cognitive Measurements of Graph Aesthetics](https://www.semanticscholar.org/paper/Cognitive-Measurements-of-Graph-Aesthetics-Ware-Purchase/fd14fd782fdb99522263f9db701831e8178b0dc5)
- Störrle: [SoSyM](https://link.springer.com/article/10.1007/s10270-016-0529-x)
- Moody: [Physics of Notations (RE'09)](https://homepages.uc.edu/~niunn/courses/RE-refs/PoN-RE09.pdf)
- Yoghourdjian 외 2021: [arXiv](https://arxiv.org/pdf/2008.07944)
- Burattin 외 2016: [arXiv](https://arxiv.org/pdf/1602.02992)
- Mooney 외 2024: [그래프 드로잉 지표](https://www2.cs.arizona.edu/~kobourov/gd-metrics2024.pdf)
- Shneiderman 1996: [The Eyes Have It](https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf)

**오픈소스 스킬**
- archify: [scenarios.mjs](https://github.com/tt-a1i/archify/blob/main/archify/recipes/scenarios.mjs) — 가중 키워드 점수기 (§2.2의 원형)
- diagram-design: [output-spec.md](https://github.com/cathrynlavery/diagram-design/blob/main/skills/diagram-design/references/output-spec.md), [layout-budget.md](https://github.com/cathrynlavery/diagram-design/blob/main/skills/diagram-design/references/layout-budget.md) — 상세 다이얼·축소 사다리 (§3의 원형)
- fireworks-tech-graph: [composition-quality-contract.md](https://github.com/yizhiyanhua-ai/fireworks-tech-graph/blob/main/references/composition-quality-contract.md) — 지표 게이트 (§4의 원형)
- AWS aws-architecture-diagram: [SKILL.md](https://github.com/awslabs/agent-plugins/blob/main/plugins/deploy-on-aws/skills/aws-architecture-diagram/SKILL.md) — 서비스 수 단계·보조 서비스 목록
- softaworks c4-architecture: [SKILL.md](https://github.com/softaworks/agent-toolkit/blob/main/skills/c4-architecture/SKILL.md)
- awesome-copilot excalidraw-diagram-generator: [SKILL.md](https://github.com/github/awesome-copilot/blob/main/skills/excalidraw-diagram-generator/SKILL.md)
