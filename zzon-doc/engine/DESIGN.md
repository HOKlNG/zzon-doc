# infra-architect — 코드 기반 AWS 아키텍처 다이어그램 도구 설계 (v2)

> TypeScript로 아키텍처를 선언하면, 자동 레이아웃을 거쳐 **셀프컨테인드 HTML** 한 파일로 렌더링하는 도구.
> 목표: draw.io / PPT 없이 아키텍처를 **코드로 버전 관리**하고, 겹침 없는 읽기 좋은 다이어그램을 항상 재현 가능하게 얻는다.
>
> v2: 6개 관점(레이아웃 엔진·엣지 라우팅·텍스트/내보내기·아이콘·DSL·기존 도구) 적대적 리뷰 + 로컬 실증(elkjs/libavoid-js/resvg-js bun 동작 확인, 실제 Asset Package 검사) 결과를 반영한 개정판.
> 주요 변경: ① 전역 라우터(libavoid)를 v1로 승격, ELK는 배치 전용 ② overlay를 후처리→레이아웃 입력으로 전환 ③ 아이콘 정책 반전(정규화 산출물 커밋) ④ 폰트/텍스트 측정 전략 신설 ⑤ DSL 표현력 대폭 확장.

---

## 1. 목표 / 비목표

### 목표
- **선언적 입력**: 리소스·그룹·연결만 선언하면 좌표 계산은 도구가 담당
- **겹침 없는 레이아웃**: 노드-노드, 선-노드, 라벨-요소 겹침을 알고리즘으로 제거
- **AWS 다이어그램 관례 재현**:
  - 중첩 컨테이너 (Account ▸ Region ▸ VPC ▸ Subnet)
  - **AZ(열) × 서브넷 티어(행) 격자** — 스크린샷 2·4의 핵심 패턴
  - 격자를 가로지르는 **겹침 그룹** (Karpenter NodePool, EKS MNG, 멀티 AZ ASG)
  - 외부 액터(User, On-Premises, Internet)는 클라우드 경계 밖 배치
  - 스텝 마커(①②③), 보더 도킹 아이콘 레일, 캔버스 밴드(하단 IAM 행 등)
- **균형 잡힌 종횡비**: aspect-ratio 타깃 기반 패킹으로 한 방향 늘어짐 방지
- **공식 AWS Architecture Icons** 사용 + 공식 그룹 보더 스타일
- **출력 = 단일 HTML 파일**: 의존성 없이 열리고, git으로 diff/관리, 팬·줌·하이라이트 내장
- **결정론적 출력**: 같은 입력 → 같은 SVG (정규화된 지오메트리 기준)

### 비목표 (v1 기준)
- GUI 에디터 / 드래그 편집 (자동 레이아웃 + 힌트로 해결)
- AWS 계정 스캔 기반 자동 생성 (모델 분리로 향후 어댑터 가능)
- AWS 외 클라우드 (아이콘 레지스트리 확장만으로 가능한 구조로 설계)
- 스크린샷의 색상 충실 재현 — 현행 공식 팔레트(aws-2025)를 기본으로 하고, 구팔레트는 테마 옵션

---

## 2. 기존 도구 대비 포지셔닝 (경쟁 매트릭스)

리뷰 검증 결과: **요구사항의 80% 이상을 커버하는 기존 도구는 없음.** 최근접은 D2(~60%).

| 도구 | 커버리지 | 결정적 결격 사유 |
|---|---|---|
| [D2](https://d2lang.com) | ~60% | 셀 스팬 overlay 없음, grid 내부 엣지가 중심-중심 직선, 최고품질 엔진 TALA는 유료/비공개, 릴리스 정체. **grid-rows/grid-columns/near 키워드는 차용** |
| [awslabs/diagram-as-code (awsdac)](https://github.com/awslabs/diagram-as-code) | ~40% | PNG 전용, 스택 기반 레이아웃, 매트릭스/overlay/인터랙션 없음. **BorderChildren·CFn 리소스 타입 키 아이디어 차용** |
| [Ilograph](https://www.ilograph.com) | ~40% | 유료/비공개, 매트릭스/overlay 없음. 인터랙티브 HTML 산출과 **walkthrough(스텝) 개념 차용** |
| mermaid architecture-beta | ~20% | 중첩 격자·overlay·레이아웃 제어 불가 |
| Python diagrams (mingrammer) | ~25% | graphviz 한계로 격자/overlay 불가, 정적 이미지 |
| cdk-dia / Structurizr / isoflow·fossflow / eraser.io | <30% | CDK 종속 / C4 모델 전용 / 아이소메트릭 수동 배치 / SaaS |
| draw.io / PPT | — | 수동 배치, diff 불가 — 탈피 대상 |

→ **"중첩 + 격자 + 겹침 그룹 + 직교 라우팅 + 인터랙티브 HTML"** 조합은 직접 구축이 타당 (리뷰 재검증으로 확정).

---

## 3. 전체 아키텍처

```
diagram.ts (TS DSL)
   │  bun으로 실행 → Diagram 모델 객체
   ▼
[1] Model & Validate     그래프 모델, 참조/중첩/격자/overlay 정합성 검증 (에러 수집 후 일괄 보고)
   ▼
[2] Measure              텍스트 폭 측정 (vendored 폰트 + opentype 메트릭) → 모든 박스 크기 확정
   ▼
[3] Place (bottom-up)    컨테이너별 배치 — ELK는 배치 전용, 컨테이너 내부만 담당
   │                       - grid: AZ×티어 격자 (자체 구현, overlay 멤버 군집화 포함)
   │                       - pack: 연결 적은 박스 무리 → ELK rectpacking + aspectRatio
   │                       - layered: 흐름 있는 노드 → ELK layered (SEPARATE_CHILDREN)
   │                     부모에게는 고정 크기 불투명 박스로 전달, 절대좌표로 합성
   ▼
[4] Overlay resolve      셀 내 sub-slot 군집화 결과로부터 overlay 박스 확정, 라벨 배치
   ▼
[5] Route (global)       단일 전역 직교 라우팅 패스 — libavoid-js (전체 장애물 인지)
   │                     팬인/팬아웃 번들링(JunctionRef), 라벨 배치, side 힌트
   ▼
[6] Render               씬그래프 → ① 인터랙티브 SVG+HTML ② 정적 SVG(속성 베이크) → PNG
   ▼
out/<name>.html (+ .svg / .png)
```

### 기술 스택 (전부 bun 로컬 실증 완료)
- **런타임/빌드**: Bun (실행·번들·테스트·dev server)
- **언어**: TypeScript (DSL도 TS)
- **배치**: `elkjs` (정확 버전 고정) — **주의: bun에서 기본 로딩 깨짐** (oven-sh/bun#15737). `elk-api.js` + 실제 `Worker`로 로드 (실증 완료). `src/layout/elk-loader.ts` 단일 모듈로 캡슐화 + 기동 스모크 테스트(5초 타임아웃) 포함
- **라우팅**: `libavoid-js` (정확 버전 고정; bun 동작 실증 완료 — 베타 API 특이점: 라우팅 플래그는 정수, 경로는 `route.ps`의 get/size로 접근) → `src/route/avoid-adapter.ts`로 격리. 유지보수 중단 시 폴백: 자체 visibility-graph 직교 라우터 (2-4주 견적)
- **텍스트 측정**: `opentype.js`(정확 버전 고정) + vendored OFL 폰트 (§7)
- **PNG**: `@resvg/resvg-js` (bun 동작 실증 완료; 폴백 `@resvg/resvg-wasm`)
- **아이콘**: AWS 공식 Asset Package → 정규화 산출물을 git 커밋 (§6)

---

## 4. 입력 DSL 설계 (TypeScript)

TS 빌더 API가 1차 인터페이스. **참조는 빌더가 반환하는 타입드 객체가 기본**이고, 문자열 id는 명시적 탈출구(부모 스코프 경로 `"vpc/az-a/node-grp"`, 부모 단위 유일성)로 강등 — 루프/함수로 반복 패턴을 조립할 때 id 충돌이 나지 않도록 스코프 규칙을 모델에 명시한다.

### 예시 — 스크린샷 2(EKS) 패턴 (v2 확장 반영)

```ts
import { diagram } from "../src/dsl";

export default diagram("prod-eks", (d) => {
  const users  = d.actor("users",  { icon: "users", side: "left" });
  const devops = d.actor("devops", { icon: "user", label: "DevOps Engineers", side: "left" });

  const cloud  = d.group("aws-cloud", { kind: "aws-cloud" });
  const region = cloud.group("region", { kind: "region", label: "ap-northeast-2" });

  // ── AZ(열) × 티어(행) 격자 — 트랙에 라벨/아이콘 부여 가능 ──
  const vpc = region.grid("vpc", {
    kind: "vpc",
    columns: [
      { id: "az-a", label: "Availability Zone A" },
      { id: "az-b", label: "Availability Zone B" },
      { id: "az-c", label: "Availability Zone C" },
    ],
    rows: ["public", "private", "intra"],
  });

  // ── 보더 도킹 아이콘 레일 (S2의 ECR/EKS/EC2/EBS) ──
  vpc.rail("W", [
    { id: "ecr", icon: "ecr" }, { id: "eks", icon: "eks" },
    { id: "ec2", icon: "ec2" }, { id: "ebs", icon: "ebs" },
  ]);

  const enis = [];
  for (const az of ["a", "b", "c"] as const) {
    vpc.cell(`az-${az}`, "public",  { kind: "public-subnet" });
    const priv = vpc.cell(`az-${az}`, "private", { kind: "private-subnet" });
    priv.node(`nodes-${az}`, { icon: "ec2.instances", label: "c7g / m7g" });
    priv.node(`addons-${az}`, { icon: "x.karpenter", label: "Karpenter" });
    const intra = vpc.cell(`az-${az}`, "intra", { kind: "private-subnet", label: `Intra ${az}` });
    enis.push(intra.node(`eni-${az}`, { icon: "eni", label: "EKS Managed ENI" }));
  }

  // ── overlay: 레이아웃 입력. 같은 셀 안에서 멤버를 인접 군집으로 배치 ──
  vpc.overlay("karpenter-pool", {
    label: "Karpenter NodePool", style: "dashed-green",
    members: ["vpc/az-a/nodes-a", "vpc/az-b/nodes-b", "vpc/az-c/nodes-c"],
  });
  vpc.overlay("mng", {
    label: "Critical Addons EKS MNG", style: "dashed-orange",
    members: ["vpc/az-a/addons-a", "vpc/az-b/addons-b", "vpc/az-c/addons-c"],
  });

  const nlb = region.node("nlb", { icon: "nlb", label: "Network Load Balancer" });
  // ── 캔버스 밴드: 우측 모니터링 열, 하단 IAM 행 ──
  d.band("right", (b) => {
    b.node("amg", { icon: "amg" });
    b.node("amp", { icon: "amp" });
  });
  d.band("bottom", (b) => {
    for (const r of ["Cluster Admin", "Admin", "Editor", "Reader"])
      b.node(r.toLowerCase().replace(/ /g, "-"), { icon: "iam-role", label: `${r} Role` });
  });

  d.edge(users, nlb, { label: "HTTPS" });
  for (const eni of enis) d.edge(nlb, eni, { layer: "network" });

  // ── 스텝 마커 (S2의 검은 원 번호) ──
  d.step(1, { at: devops });
  d.step(5, { at: "vpc/az-b/addons-b", anchor: "nw" });
});
```

### 모델 핵심 타입 (v2)

```ts
type Diagram = { id; groups; nodes; edges; overlays; actors; bands; markers; meta }

type Group = { id; kind: GroupKind; label?; badges?: IconRef[]; stack?: true | number;
               layout?: "auto"|"grid"|"pack"|"layered"; children; rails?: Rail[]; hints? }
type GridGroup = Group & {
  columns: Array<string | { id; label?; icon? }>;   // AZ 헤더는 공식 규격상 라벨 전용
  rows:    Array<string | { id; label?; icon? }>;
  cells:   Map<[col, row], Group> }
type Rail   = { side: "N"|"S"|"E"|"W"; items: { id; icon; label? }[] }
              // 컨테이너 내부 레이아웃에서 제외, 보더 위 균등 배치, 엣지 endpoint 가능
type Node   = { id; icon: IconRef; label?; sublabel?; badges?: IconRef[]; meta? }
type Actor  = { id; icon; label?; side?: "left"|"right"|"top"|"bottom" }
type Band   = { position: "top"|"bottom"|"left"|"right"|"top-left"|...; children }
              // 코어 레이아웃과 독립 배치 후 캔버스 주변에 합성; 엣지는 전역 라우터가 처리

type Edge = { from: Ref; to: Ref;            // Ref = NodeRef|GroupRef|ActorRef|RailItemRef|string경로
              label?; labelPlacement?: "source"|"center"|"target"|number;
              style?: EdgeStyle; layer?: string;   // layer → HTML 토글용 CSS 클래스
              hints?: { sourceSide?; targetSide?; waypoint?; bundle? } }
              // group endpoint는 그룹 보더에 접속(side 힌트 존중)
type EdgeStyle = { preset?: "default"|"dotted"|"dashed"; color?; arrowhead?: "none"|"end"|"both" }

type Overlay = { id; members: string[]; kind?: GroupKind;  // kind 지정 시 공식 스타일 상속(예: ASG)
                 style?; label?; labelCorner? }
type Marker  = { n: number; at: Ref; anchor?: "nw"|"ne"|"sw"|"se"|"mid"; offset?; note? }

type GroupKind = "aws-cloud"|"region"|"availability-zone"|"account"|"vpc"
               | "public-subnet"|"private-subnet"|"security-group"|"auto-scaling"
               | "corporate-data-center"|"server-contents"|"spot-fleet"|"generic"
```

### 힌트 체계 (탈출구)
- 노드/그룹: `rank`, `order`, `align`, `minWidth`, `onBorder: {side, offset}` (보더 부착 노드)
- 엣지: `sourceSide`/`targetSide`(v1은 N/S/E/W, 추후 16방위), `waypoint`, `bundle`(양방향 — 팬인·팬아웃 모두)
- 최후의 수단: `pin: {x, y}` (사용 시 경고)

### 에러 모델
- 빌더 호출 시점에 콜사이트 캡처(`Error.captureStackTrace`) → 모든 검증 에러가 `diagram.ts:줄번호`를 가리킴
- 에러는 수집 후 일괄 보고 (첫 에러에서 중단하지 않음)
- `--debug`: 검증 실패 요소를 하이라이트한 채로 강제 렌더

---

## 5. 레이아웃 & 라우팅 (핵심, v2 전면 개정)

> v1 설계의 "ELK INCLUDE_CHILDREN으로 엣지 일괄 라우팅"은 **모순으로 판명** (리뷰 blocker × 2, 로컬 재현):
> INCLUDE_CHILDREN은 단일 layered 런이 전 계층을 배치한다는 뜻이므로, 커스텀 grid·rectpacking 컨테이너와 양립 불가.
> 다른 알고리즘이 배치한 컨테이너 내부로 향하는 엣지는 UnsupportedGraphException 또는 무음 탈락.
> S1의 TGW 팬인, S2의 NLB→ENI가 정확히 이 케이스. → **ELK는 배치 전용, 라우팅은 전역 단일 패스**로 재설계.

### 5.1 배치(Place): 컨테이너별 전략, bottom-up 합성

| 상황 | 전략 | 구현 |
|---|---|---|
| `grid` 컨테이너 (VPC의 AZ×티어) | 격자 배치 (자체 구현) | 셀 내용으로 트랙 크기 산출(CSS grid 방식), AZ 헤더/티어 라벨 공간 예약, overlay 군집화(§5.2) |
| 엣지가 거의 없는 박스 무리 (S1 계정 필드) | ELK `rectpacking` + `aspectRatio` | 실측: 12박스 ar=1.6 → 실제 1.31 (소프트 타깃, ±25% 편차 허용) |
| 흐름 있는 노드 (CI/CD, User→ALB→DB) | ELK `layered` (SEPARATE_CHILDREN) | 방향은 엣지 흐름 감지 |
| 최상위 캔버스 | 합성 규칙 + 밴드 | 액터/밴드는 관례 기반 기본값(오버라이드 가능), 코어는 pack/layered |

- 각 컨테이너는 **먼저 내부를 배치해 크기를 확정**하고, 부모 레이아웃에는 고정 크기 불투명 박스로 참여 (ELK 고정 크기 자식 — 실증 완료). 최종적으로 절대좌표로 합성.
- 컨테이너 크롬: GroupKind별 top/left/bottom/right 패딩(타이틀 스트립 + 보더 여백)을 정의해 ELK `elk.padding`/grid 인셋으로 일관 적용. ELK의 NODE_LABELS 크기 계산은 쓰지 않음(자식을 타이틀 '옆'에 놓는 문제).
- **S1 종횡비 함정 (실측)**: TGW 팬인같이 연결이 많은 토폴로지를 layered에 넣으면 aspect 0.10 수직 스트라이프가 됨 (`elk.aspectRatio`는 connected layered에서 no-op). → S1의 계정 필드는 rectpacking으로 배치하고 팬인 엣지는 전역 라우터가 담당.

### 5.2 Overlay: 후처리가 아니라 레이아웃 입력 (v2 개정)

v1의 "멤버 union bbox + 비연속이면 에러"는 **S2 자체를 재현 못 함** — Karpenter NodePool과 EKS MNG의 멤버가 같은 3개 private 서브넷 셀 안에 섞여 있어, bbox가 겹치거나 검증 에러가 남 (사용자가 고칠 방법도 없음).

개정 설계:
1. 셀 내부 배치 시 **같은 overlay 멤버를 인접 밴드(sub-slot)로 군집화** (스택 방향 프리미티브: 셀은 세로/가로 밴드 스택)
2. overlay 박스 = 멤버가 속한 **셀별 sub-rect들의 union** (셀들을 가로지르는 직사각형; 필요시 셀 연속 구간별 1개 rect)
3. 교차 검증: 두 overlay가 같은 셀에서 겹치는 멤버를 갖는 경우(부분집합/교차)만 에러 — 인터리브는 군집화가 해소
4. `kind` 지정 시 공식 그룹 스타일 상속 → S3의 멀티 AZ ASG도 overlay로 표현 (스팬 그룹과 overlay 개념 통일)
5. 라벨은 4코너 중 충돌 없는 곳 자동 선택; z-order: 컨테이너 배경 < overlay < 노드

### 5.3 라우팅(Route): 전역 단일 패스 (v2 개정 — v1.5에서 승격)

1. 배치 완료 후, **평탄화된 전체 장애물 집합**(모든 노드/컨테이너/레일/밴드 rect + 여백) 위에서 libavoid-js 직교 라우팅 1회 실행
2. 그룹 endpoint 엣지: 그룹 보더에 접속, side 힌트는 ConnEnd 방향/ShapeConnectionPins로 매핑
3. **번들링(양방향)**: 같은 (target, 접근면) 팬인 ≥ 4 또는 `bundle` 힌트 → JunctionRef를 타깃에서 한 마진 밖에 두고 가지→정션→단일 트렁크. 팬아웃(S1 SCP→7 OU)은 소스 측 대칭 적용. 감지·라벨 축약(동일 라벨 1개로)은 자체 코드
4. 라벨 배치: `labelPlacement` 기본 center, 번들 엣지는 source 기본; 노드/타 라벨 충돌 시 세그먼트 따라 이동
5. **불변식**: 모든 모델 엣지는 라우팅된 섹션을 가져야 함 — 위반 시 해당 엣지 id와 함께 렌더 실패 (무음 탈락 방지)
6. ELK INCLUDE_CHILDREN 라우팅은 순수 layered 서브씬(예: S3 CI/CD 흐름) 내부에서만 선택적 사용 가능

### 5.4 종횡비
- 목표 종횡비(기본 16:10)를 pack 컨테이너와 최상위 합성에 전파; grid는 구조적으로 균형; 밴드는 캔버스 주변 배치라 영향 없음

### 5.5 결정론 (조건 명시)
- 자식 정렬: 선언 순서 고정, ELK 옵션 전부 명시(기본값 의존 금지), 난수 없음
- **elkjs는 입력을 변조하고 비결정 `$H` 키를 주입** (실측) → `structuredClone`으로 모델 보호, 결과는 **정규 레이아웃 타입**(id/x/y/w/h/sections/labels만)으로 추출해 직렬화 — 스냅샷·`.layout.json` 캐시 모두 이 타입 기준 (실측: 정규화 좌표는 3회 연속 동일)
- libavoid: 정확 버전 고정, 도형/커넥터를 안정 정렬 순서로 등록, 라우팅 파라미터 전부 명시. 라이브러리 업그레이드 = 스냅샷 갱신 커밋
- SVG 출력 좌표는 소수 2자리 반올림; 측정 폰트·opentype.js는 lockfile로 고정

---

## 6. 아이콘 파이프라인 (v2 개정: 산출물 커밋)

> v1의 "아이콘은 커밋하지 않고 각자 fetch"는 **결정론 목표와 모순** (리뷰 blocker): 다운로드 URL이 콘텐츠 해시 포함으로 분기마다 바뀌고 프로그램적 발견 불가, 패키지 구조도 릴리스 간 변동. → 정책 반전.

- **정규화 산출물을 git에 커밋**: `src/icons/svg/<key>.svg` (아이콘당 1파일 — diff 리뷰 가능) + `manifest.gen.ts`(IconKey 유니온 + key→경로 맵만) + `icons.lock.json`(소스 패키지 버전·URL·sha256)
- `scripts/build-icons.ts` = **유지보수자용 업그레이드 도구** (현재 04302026 패키지 URL 고정). 일반 빌드는 네트워크 불필요
- 검증된 경로 문법 (04302026 기준 파싱 계약): `Arch_<Category>/48/Arch_<Service>_48.svg`, `Res_<Category>/Res_<Service>_<Resource>_48.svg`, 그룹 아이콘은 평면 `<Name>_32.svg`
- 정규화 규칙: `__MACOSX`/`._*`/`.DS_Store`/PNG 제외, XML 선언·`<title>`·`<desc>` 제거만 수행 — **아트워크 자체는 절대 수정 금지**, © 고지 헤더를 manifest에 포함
- 키 체계: `ec2`, `ec2.instance`(리소스), `group.vpc`, `<key>@dark`, `x.<name>`(비 AWS). 벤더 프리픽스 충돌 시 풀네임 유지. 수기 별칭 테이블(`aliases.ts`: eks/s3/alb/tgw...)은 코드로 관리
- 렌더 시 사용된 아이콘만 `<symbol id="i-<key>">`로 1회 삽입, `<use>` 참조 — id 네임스페이스는 다이어그램 노드 id와 분리 (아이콘 내부 id는 정규화 시 정리)
- **그룹 보더 규격은 Group-Icons가 정의하지 않음** (실측: 코너 글리프 15종뿐) → GroupKind→스타일 테이블은 공식 문서에서 **수기 전사** (`src/render/group-styles.ts`). AZ·Security Group은 글리프 없는 kind (보더+라벨만)
- 팔레트: 현행 공식(aws-2025 — VPC 보라 `#8C4FFF`, Account 핑크 `#E7157B`, 서브넷 green/teal, 실측 추출)이 기본. 스크린샷의 VPC 초록은 2021 이전 구팔레트 — 테마 옵션(`aws-legacy`)으로만 제공
- 비 AWS 아이콘: `scripts/fetch-extra-icons.ts`가 고정 URL로 수집 후 커밋 — CNCF artwork(kubernetes, cert-manager, external-secrets), Karpenter(Apache-2.0). **Grafana·GitHub 등 상표 제약 마크는 번들 금지, 사용자 공급 전용** (`assets/extra-icons/`에 직접 추가)
- c7g/m7g 등 인스턴스 패밀리별 아이콘은 공식 패키지에 없음 → 제네릭 인스턴스 아이콘 + 텍스트 칩으로 렌더

---

## 7. 타이포그래피 & 텍스트 측정 (v2 신설)

박스 크기가 라벨 폭에 의존하는데 bun에는 DOM/canvas가 없음 — v1에 전략 부재 (리뷰 blocker).

- **vendored OFL 폰트**를 git에 커밋하고, **측정과 렌더링에 같은 폰트 사용** (시스템 폰트 스택은 무겹침 보장을 깨뜨림): Pretendard(라틴+한글 단일 폰트, OFL) 우선 검토, 대안 Inter+Noto Sans KR 페어. 스크린샷의 Amazon Ember는 상용 — 번들 불가, 유사 오픈 폰트로 대체함을 명시
- 측정: `opentype.js` `getAdvanceWidth`(커닝 포함) — bun 동작 및 fontkit과 소수 3자리 일치 검증됨. 모든 §5.1 박스 크기는 이 측정값을 고정 치수로 소비
- HTML 출력: 사용 글리프만 `subset-font`로 서브셋 → base64 woff2 data URI `@font-face` 인라인, `font-family`는 vendored 폰트 단독 지정
- 정적 SVG 내보내기: data URI @font-face는 SVG-as-image 컨텍스트에서 비신뢰 → **텍스트를 패스로 변환** (`opentype.js Path.toSVG()`; satori가 같은 접근으로 검증). HTML 내 SVG는 실 `<text>` 유지(선택 가능·접근성)
- PNG: `@resvg/resvg-js`에 정적 SVG + **동일 vendored TTF** (`fontFiles`, `loadSystemFonts: false`) → 머신 간 바이트 안정

---

## 8. 출력 스펙 (2-variant 렌더러)

하나의 씬그래프에서 두 산출물:
1. **인터랙티브** (HTML 내장 SVG): 클래스 + CSS 변수 + 인라인 JS
   - 팬/줌, hover 시 인접 엣지·이웃 하이라이트 + 나머지 dim
   - `layer`별 엣지 토글 (network/deploy/monitoring...)
   - 노드 클릭 → `meta` 툴팁 (계정 ID, CIDR...), `#node-id` 딥링크
   - 라이트/다크 테마 (`prefers-color-scheme` + 토글; 아이콘 `@dark` 변형 연동)
   - 외부 요청 0 (아이콘·폰트·JS 전부 인라인)
2. **정적 SVG** (`--theme` 플래그로 테마 1개 선택): 모든 스타일을 표현 속성으로 베이크, 스크립트/클래스 없음, 텍스트는 패스 → `.svg` 단독 배포 및 resvg PNG 래스터라이즈 입력

---

## 9. CLI / 워크플로

```bash
bun ia render examples/eks-cluster.ts          # → out/eks-cluster.html (+ .svg)
bun ia watch  examples/eks-cluster.ts          # dev server + 변경 시 자동 리로드
bun ia export examples/eks-cluster.ts --png    # 정적 SVG → PNG
bun ia icons upgrade [zip-url]                 # (유지보수) Asset Package 업그레이드
```

일상 흐름: `diagram.ts` 수정 → watch로 확인 → 입력 TS + 출력 HTML 모두 커밋 (PR에서 결과 diff 리뷰).

---

## 10. 저장소 구조

```
test_infra_architect/
├── src/
│   ├── model/          # 모델 타입 + 검증 (geometry.ts, 순수 모델)
│   ├── dsl/            # TS 빌더 (diagram/group/grid/cell/rail/band/node/edge/overlay/step)
│   ├── text/           # opentype 메트릭 모듈 (vendored 폰트 측정)
│   ├── layout/         # elk-loader, grid 레이아웃, pack, 합성(compose)
│   ├── route/          # avoid-adapter, 번들링, 라벨 배치
│   ├── render/         # 씬그래프, SVG 2-variant, group-styles, 테마, 인터랙션 JS
│   ├── icons/          # svg/ (커밋된 정규화 아이콘), manifest.gen.ts, aliases.ts, icons.lock.json
│   └── cli/
├── scripts/            # build-icons.ts, fetch-extra-icons.ts (유지보수용)
├── assets/
│   ├── fonts/          # vendored OFL 폰트 (커밋)
│   ├── extra-icons/    # 비 AWS 아이콘 소스 (커밋)
│   └── aws-asset-package/  # 원본 패키지 (gitignore, 업그레이드 시에만)
├── examples/           # 스크린샷 3종 재현 = acceptance + 갤러리
├── tests/              # 레이아웃 불변식 + 정규화 지오메트리 골든 스냅샷
└── out/                # 렌더 결과 (gitignore 여부는 §12)
```

---

## 11. 마일스톤 (v2 조정)

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| **M0** ✅ | 스캐폴드 + 아이콘 파이프라인 + 스택 실증 | 정규화 아이콘 838종 커밋, elkjs/libavoid/resvg bun 동작 확인 |
| **M1** | 모델 + DSL + 검증 + 텍스트 측정 | 예제 3종 DSL 기술 가능, 측정 모듈 단위 테스트 |
| **M2** | 배치 v1: ELK 어댑터(pack/layered) + bottom-up 합성 + 크롬 | S1 계정 필드가 목표 종횡비 ±40%로 배치 |
| **M3** | grid + overlay 군집화 + rail/band | S2 격자 + 이중 overlay 재현 |
| **M4** | 전역 라우팅: avoid-adapter + 번들링 + 라벨 + 불변식 | S1 TGW 팬인 번들 + 모든 엣지 라우팅 보장 |
| **M5** | 렌더러 2-variant + HTML 패키징 + 폰트 서브셋 | 셀프컨테인드 HTML, 인터랙션 동작, PNG 내보내기 |
| **M6** | CLI + 예제 3종 + 테스트 완성 | 불변식·골든 통과, 시각 검증 |

리스크 순위: M3(overlay 군집화) > M4(번들링 품질) > M2(합성 정합). M2 완료 시 중간 시각 점검.

### 테스트 (tests/)
- 불변식: ①노드-노드 비겹침 ②엣지-무관 노드 비관통 ③라벨 비겹침 ④종횡비 목표 ±40% ⑤**모든 엣지 라우팅 존재** ⑥overlay 박스가 멤버를 모두 포함하고 비멤버와 교차 최소
- 골든: 정규화 지오메트리(JSON) + 최종 SVG 스냅샷 (elkjs `$H` 오염 차단은 §5.5)

---

## 12. 결정 사항 (v2에서 확정)

1. **DSL = TypeScript 우선** (YAML은 v2+ 선택)
2. **입력 TS + 출력 HTML 모두 커밋**
3. **아이콘: 정규화 산출물 커밋** (v1에서 반전) — fetch는 업그레이드 도구
4. **폰트: OFL 폰트 vendored 커밋** — 측정·렌더 동일 폰트, 서브셋 임베드
5. **라우팅: libavoid-js 전역 패스가 v1** (v1.5에서 승격) — ELK는 배치 전용
6. 기각된 대안 (재론 방지 기록): ELK INCLUDE_CHILDREN 일괄 라우팅(모순), ELK 고정 포트를 1차 라우팅으로(열등, side 힌트 매핑에만 잔존 후보), canvas 폴리필/satori 텍스트 측정(형상 부적합), sharp PNG(비적합), 아이콘 fetch-only 정책(결정론 모순)

---

## 13. 갭 체크 반영 (크로스커팅)

리뷰 완료 후 완전성 비평가가 지적한 사일로 밖 이슈들과 대응:

1. **출력물 git 워크플로**: PR에서 리뷰하는 정본 아티팩트는 **정규 레이아웃 JSON**(§5.5 타입 — 작고 의미론적, 라인 diff 가능). HTML/SVG도 커밋하되 `.gitattributes`에 `out/*.html linguist-generated -diff`로 diff 소음 차단. `out/` gitignore 해제 (M6)
2. **버전 고정 실천**: package.json의 elkjs/libavoid-js/opentype.js/subset-font/@resvg/resvg-js는 캐럿 없는 정확 버전 + dependencies로 이동, @types/bun도 고정 (M6에서 일괄). §5.5 핀 목록에 subset-font(+harfbuzzjs 전이 의존성) 추가
3. **성능 예산**: 스케일 타깃 200노드/300엣지, 콜드 렌더 <2초를 M4 수용 기준에 추가; 스트레스 예제를 tests/에 생성. libavoid nudging 파라미터 세트 명시
4. **접근성**: SVG 루트 `role="graphics-document"` + 다이어그램 `<title>/<desc>`; 노드/그룹마다 모델 기반 `<title>`(라벨+종류) — 아이콘에서 제거한 title과 별개; 노드 tabindex=0 + 키보드 포커스 시 하이라이트. 정적(텍스트 패스화) SVG는 인쇄/래스터용으로 명시하고 접근성 채널은 HTML 변형이 담당
5. **라벨 줄바꿈 정책**: 노드 라벨 최대폭(§7 측정 모듈의 wrap) — 라틴은 공백, 한글은 keep-all 공백 우선 + 초과 시 음절 단위 폴백(현 구현이 이 동작). 그룹 타이틀은 줄바꿈 없이 박스 최소폭에 기여
6. **DSL 버저닝**: v1 스코프는 "다이어그램은 이 저장소 안에서 관리" — 외부 배포 시 semver + `meta.dslVersion`을 모델·HTML 주석에 스탬프 (로드맵)
7. **테스트 확장**: 시드 기반 property/fuzz 입력(랜덤 계층/격자/overlay) 위에 불변식 실행 + 예제 3종 PNG 픽셀 diff 회귀 (M6)
8. **파이프라인 전 단계 에러 모델**: 엔티티→콜사이트 레지스트리를 Place/Route까지 유지, 라우팅 불변식 실패 시 장애물/실패 엣지를 그린 디버그 HTML 출력 (M4)
9. **watch 재실행**: 사용자 TS는 변경마다 자식 프로세스(Bun.spawn)로 렌더 — ESM 캐시 무효화 문제 회피, 행/크래시 격리 (M6)
10. **DOM id 규약**: `#딥링크`는 data-path 조회로 처리(경로의 `/`는 DOM id에 넣지 않음), 셀렉터 보간 금지
11. **접기/LoD/멀티뷰**: v1 비목표로 명시. 로드맵: 하나의 모델 위에 named view(collapse/exclude/layers)를 Measure 이전에 해석
