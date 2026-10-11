# 배포 · 인프라 · 쿠버네티스 · 네트워크 · 보안 경계

**질문**: 어디서, 어떻게 돌아가나. 신뢰 경계와 허용 경로는 무엇인가.
**독자**: 운영자, 인프라 담당, 보안 담당.
**등급**: 기본은 T2다. "환경 전체·빠짐없이·감사" 요청이고 전체화면으로 볼 때만 T3 원장이다(rubric §3.2 세 가지 조건).

> **`*.tf`가 있으면** 이 문서가 아니라 `../../../terra-form/SKILL.md` 절차를 따른다. 그쪽은 리소스를 읽고 공식 아이콘(AWS·Azure·쿠버네티스·SAP)으로 그린다.
> 이 문서는 IaC가 없거나(compose·k8s 매니페스트·문서·인터뷰 기반), 논리 수준 배포도를 그릴 때 쓴다.

## 어휘 고르기

- 클라우드·네트워크 토폴로지 → **아이콘 어휘**. AWS 838종(`lambda`), Azure 636종(`azure.aks`), 쿠버네티스 39종(`k8s.pod`), SAP BTP 125종(`sap.*`)이 있고 한 장에 섞어도 된다. 아이콘 키는 `engine/src/icons/manifest.gen.ts`와 `aliases.ts`를 grep해 실재를 확인한다. GCP·네이버 클라우드 등 그 밖의 업체는 아이콘이 없으므로 카테고리 카드로 그린다.
- 논리 배포(서버·컨테이너 이름 수준) → **카드 어휘**(`category:`).
- 한 장에 섞지 않는다. 섞어야 할 이유가 명확하면 `allowMixedVocabulary: true`.

## 하위 유형별 문법

| 하위 유형 | 구조 | 핵심 DSL |
|---|---|---|
| 클라우드 배포 | `aws-cloud ▸ region ▸ vpc ▸ subnet`. 진입(LB·GW)은 한쪽, 복제는 `sublabel: "AZ ×2"`로 표기 | `d.group(kind)`, `region.grid("vpc", { columns: AZ, rows: 티어 })`, `vpc.cell(az, tier)` |
| AZ×티어 격자 | 열=AZ, 행=public/private/intra. 격자를 가로지르는 논리 묶음(ASG·노드풀)은 오버레이 | `vpc.overlay(id, { members, style: "dashed-green", label })` |
| 쿠버네티스 | 1레이어(클러스터 뷰): 워크로드=Deployment 단위 노드, 복제 수는 `sublabel: "×3"`. 2레이어: 워크로드별 파드 그룹을 같은 모양으로 반복 | `cluster` 그룹 안 노드, 오토스케일러는 엣지 없는 주석 노드 |
| 멀티리전 HA | 위에 글로벌 층(DNS) → 좌우 대칭 region 그룹. 리전 간 엣지는 복제만 | `direction: "DOWN"`, 평시·페일오버 `d.flow` 2개 |
| 네트워크·하이브리드 | 허브 앤 스포크. 온프렘은 `kind: "corporate-data-center"`. 중첩이 깊으면 엣지는 최소로 | 그룹 위계가 정보의 전부다 |
| 보안·신뢰 경계 | 존을 열로 둔다: 인터넷(0) → DMZ(1) → 내부(2) → 데이터(3) | `kind: "security-group"` 그룹 + `hints.layer` |
| 계정 위계(랜딩존) | 흐름 없는 위계 지도. 계정 그룹을 열로 배치 | 엣지 최소 |

공통 규칙:
- 외부 SaaS·관리형 부속은 `d.band("right", b => …)`, 공통 IAM·모니터링 행은 `d.band("bottom", …)`에 둔다.
- 사람·인터넷은 `d.actor(id, { icon, side: "left" })`로 둔다.
- 순번 마커 `d.step(n, { at })`는 AWS 관례(①②③)를 따른다. 경로 설명은 `d.flow`가 낫다.
- **축소 사다리 2단계**: 관심사가 보안·운영이 아니면 IAM·로그·모니터링·시크릿은 생략하거나 하단 밴드로 모은다. 생략했으면 보고한다.

## 템플릿 (카드 어휘, compose 기반)

```ts
export default diagram("deploy", { title: "운영 배포 구성 (compose)", view: "deployment", tier: "standard", direction: "RIGHT" }, (d) => {
  const users = d.node("users", { category: "user", label: "사용자", hints: { layer: 0 } });
  const host = d.group("host", { kind: "generic", label: "운영 서버 (docker compose)" });
  const proxy = host.node("proxy", { category: "lb", label: "nginx", tech: "리버스 프록시", hints: { layer: 1 } });
  const api = host.node("api", { category: "service", label: "api", tech: "×2 replica", hints: { layer: 2 } });
  const db = host.node("db", { category: "db", label: "postgres", tech: "볼륨 pgdata", hints: { layer: 3 } });
  d.edge(users, proxy, { label: "HTTPS", layer: "network" });
  d.edge(proxy, api, { layer: "network" });
  d.edge(api, db, { layer: "data" });
});
```

## 점검

- [ ] 경계(리전·VPC·서브넷·존)는 코드나 설정에서 읽힌 것만 그렸다.
- [ ] 복제·AZ 반복은 노드 1개 + sublabel로 압축했다(축소 사다리 1단계).
- [ ] 생략한 횡단 관심사를 보고에 적었다.
- [ ] `bun ia check` 통과. T3라면 flow가 1개 이상 있고 상위 T1 장과 href로 연결된다.
