---
name: terra-form
description: Terraform(*.tf) 코드를 읽어 클라우드 인프라 구성도를 그리는 스킬이다(AWS·GCP·Azure 등). AWS·Azure는 공식 아이콘(AWS 838종, Azure 636종)으로, 쿠버네티스·SAP BTP도 공식 아이콘으로, 그 밖의 클라우드는 카테고리 카드로 그린다. 내장 엔진(TS DSL → 자동배치 → 셀프컨테인드 HTML)으로 렌더한다.
when_to_use: 사용자가 "terraform", "tf", "테라폼"을 지명하며 인프라를 그려 달라고 할 때 쓴다. 메인 zzon-doc이 배포·인프라 뷰에서 *.tf를 발견해 넘길 때도 쓴다. tf가 없는 인프라는 zzon-doc의 deployment 뷰가 맡는다.
argument-hint: '[tf 경로 — 비우면 ./infra 탐색]'
---

# Terraform → 클라우드 인프라 다이어그램

`*.tf`를 읽어 내장 엔진의 **TS DSL**을 저작하고 렌더한다. 산출물은
자동배치·직교 라우팅이 적용된 단일 `.html`(+`.png`/`.svg`)이다.

> **역할 분담**: `*.tf`가 있는 클라우드 인프라(프로바이더 무관)는 이 스킬이 맡는다. tf가 없으면 zzon-doc `references/views/deployment.md`가 맡는다.
> 이 스킬은 메인 스킬 zzon-doc의 배포 뷰 하나다. 재진입(`--status`)·등급(selection-rubric)·게이트·보고 규칙은 `../zzon-doc/SKILL.md`를 따른다.
> 같은 프로젝트에서 zzon-doc 개요(컨텍스트)와 terra-form 인프라 상세가 공존하는 게 정상이다.
> **어휘 규칙**: IaC 기반 클라우드/네트워크 장 = 클라우드 아이콘, 프로젝트 단위·C4 레이어 장 = 카테고리 카드(zzon-doc).
> 레거시 DiagramSpec을 클라우드 아이콘으로 올리려면 스펙에 `"vocabulary": "aws"` 한 줄이면 된다(매핑 불가 노드가 있으면 전체 카드 유지 — 혼용 없음).

## 프로바이더별 어휘 (스캔 단계에서 provider 블록으로 감지)

| 프로바이더 | 노드 어휘 | 그룹 |
|---|---|---|
| `aws` | 공식 AWS 아이콘 838종 (`grep manifest.gen.ts`) | vpc/region/subnet/account + AZ×티어 `grid()`·`overlay()` |
| `azurerm` | 공식 Azure 아이콘 636종 `azure.<이름>` (`grep "azure\." manifest.gen.ts`). 자주 쓰는 것은 짧은 이름: `azure.vm` `azure.aks` `azure.sql` `azure.redis` `azure.storage` `azure.vnet` `azure.appgw` `azure.front-door` `azure.key-vault` `azure.app-insights` 등 (`aliases.ts`) | `generic` 그룹 + 라벨 (구독·리소스 그룹·VNet·서브넷은 그룹 라벨로) |
| `kubernetes`·`helm` | 쿠버네티스 공식 아이콘 39종 `k8s.<이름>`: `k8s.pod` `k8s.deployment` `k8s.service` `k8s.ingress` `k8s.configmap` `k8s.secret` `k8s.statefulset` `k8s.hpa` `k8s.namespace` 등 | 클러스터·네임스페이스는 `generic` 그룹 |
| `btp` (SAP) | SAP BTP 공식 아이콘 125종 `sap.<이름>` | `generic` 그룹 |
| `google`·`ncloud`·`alicloud` 등 | **카테고리 카드**(category/tech). 이 업체들은 아이콘 재배포를 허락하지 않아 레포에 아이콘이 없다. 공식 아이콘을 내려받게 하는 절차는 만들지 않는다 | `generic` 그룹 + 라벨 |

AWS·Azure·쿠버네티스·SAP 아이콘은 같은 아이콘 어휘라 한 장에 섞어도 된다(멀티클라우드). 카드와 아이콘을 섞는 것만 validator가 막는다(`allowMixedVocabulary`는 의도가 명확할 때만).
아이콘은 원본 그대로 쓴다 — 색을 바꾸거나 자르거나 돌리지 않는다(각 업체 조건, 루트 NOTICE). 업체 로고(Datadog·GitLab·Grafana 등)는 레포에 넣지 않고 카테고리 카드와 이름 라벨로 그린다.

## 0. 엔진 위치

**플러그인 동봉**: `${CLAUDE_PLUGIN_ROOT}/engine` (bun+TS). 최초 1회 `cd engine && bun install`.
`$ENGINE`은 이후 이 경로를 뜻한다. bun이 없으면 설치 안내 후 멈춘다.

## 1. 범위 잡기 (게이트 — 어기지 마라)

**① tf 스캔 → ② 제안·승인 → ③ 작성.** 승인 전에 DSL 파일을 만들지 마라.

1. **스캔**: `envs/*/main.tf`(모듈 조합 = 그림의 그룹 구조) → 각 모듈의 resource 종류·수를 센다.
   env 간 변수 불일치(stale env — 모듈이 안 받는 변수를 넘기는 등)를 발견하면 **그리기 전에 보고한다.**
2. **제안은 반드시 이 형태로** — 리소스 ~20개 이하 & 목적 자명이면 기본값 명시 후 바로 진행, 그 외엔 한 묶음(최대 4문)으로 묻는다:
   - **환경/스코프**: dev / prd / 특정 모듈만 (env가 갈리면 그림이 다르다 — 현행 env를 근거와 함께 추천). 멀티 프로바이더면 어느 클라우드를 그릴지도 함께
   - **상세 수준**: 개요(서비스 단위) / 표준(리소스 단위) / 상세(서브넷·IAM까지)
   - **강조 관점**: 요청 흐름 / 데이터 파이프라인 / 네트워크 경계 / CI·CD / 보안 → 엣지 `layer` 구성이 된다
   - **생략 규칙**: IAM·로그·모니터링 생략 여부 — "전부 표시"는 명시적 동의를 받는다
3. 답을 **한 줄로 복창**하고 시작한다. 무엇을 생략했는지는 전달 시에도 반드시 명시한다.

## 2. DSL 저작 — 계약

- **파일 위치**: 대상 프로젝트의 `docs/zzon-doc/terra/<slug>.ts` (다이어그램 소스도 그 프로젝트가 버전 관리한다).
  구버전 기본값인 루트 `zzon-doc/` 산출 폴더가 이미 있으면 그걸 계속 쓴다 — 아래 경로도 전부 그 폴더 기준으로 바꾼다.
- **API 정본은 엔진의 `examples/*.ts` 중 AWS 4종이다.** 반드시 하나를 먼저 읽는다 (`serverless-sample.ts`가 서버리스, `eks-cluster.ts`가 격자+overlay, `multi-account-lz.ts`가 멀티계정, `multi-region-cicd.ts`가 멀티리전).
- 계층: `d.group(kind:"aws-cloud")` ▸ `region` ▸ 리소스. VPC의 AZ×티어는 `grid()`+`cell()`, 격자를 가로지르는 논리 그룹(ASG·노드풀)은 `overlay()`.
- 액터는 `d.actor(side:)`, 외부 SaaS·부속 행은 `d.band("right"|"bottom")` — 외부 관리형(DB SaaS 등)은 오른쪽 밴드가 관례.
- 엣지는 **`layer:` 필수**(request/pipeline/deploy/monitor…) — HTML 레이어 토글의 단위다.
- 같은 의미의 반복 리소스(크론 N개, ECR N개)는 노드 1개 + `sublabel`로 압축. 흐름 순번은 `d.step()`.
- 설명 문장은 캔버스에 그리지 않는다 — `description:`(클릭 시 사이드바)에 담고, 라벨은 리소스 이름 위주로 짧게.
- 제목, 스펙 `description`, 노드 설명, 플로우 단계는 독자가 읽는 글이다. `../zzon-doc/references/writing-style.md`(AWS 기술 블로그 기준, 본문 합니다체)를 따른다(리소스 주소, 변수 이름, 그림 제작 설명 금지).
- **아이콘 키는 실재 확인**: `grep '"<키>"' $ENGINE/src/icons/manifest.gen.ts $ENGINE/src/icons/aliases.ts`.
  없으면 별칭 → 유사 서비스 → `res.*` 제네릭 순. 상표 제약 로고(Grafana 등)는 제네릭으로.
- 본질적으로 넓은/좁은 그림은 `diagram(id, { aspectRatio })`로 의도를 선언한다.
- 머리에 `view: "deployment"`와 등급 `tier`를 넣는다. 기본은 `"standard"`이고, 환경 전체를 빠짐없이 그리는 원장은 `"reference"`다(selection-rubric §3.2 조건 충족 시). 게이트가 이 등급으로 판정한다.
- tf에서 **읽은 것만** 옮긴다. 읽히지 않는 값(실 배포 상태)이 필요하면 `terraform show -json`을 요청한다.

## 3. 렌더 + 품질 게이트

```bash
cd $ENGINE
bun ia render <project>/docs/zzon-doc/terra/<slug>.ts --out <project>/docs/zzon-doc/diagrams
bun ia export <project>/docs/zzon-doc/terra/<slug>.ts --png --out <project>/docs/zzon-doc/diagrams
```

렌더 후 **반드시** 품질 게이트를 돌린다. 불변식과 등급별 가독성 지표를 함께 본다:

```bash
cd $ENGINE && bun ia check <project>/docs/zzon-doc/terra/<slug>.ts
```

✗(불변식·예산 초과·라벨 가림)는 0이 될 때까지 고친다. !(교차·꺾임 등)는 아래 방법으로 개선을 시도하고, 남기면 이유를 보고한다.

- unknown icon → 키 교체 / label-overlap → 라벨 축약 / aspect → `aspectRatio` 선언이나 밴드 재배치
- 엣지 교차가 심한 곳은 `hints: { sourceSide, targetSide }`로 진입면 고정
- **PNG를 열어 육안 확인** 후 전달한다. 검증 에러는 `diagram.ts:줄번호`를 가리킨다 — 그 줄만 고쳐라.

## 4. 통합 문서/위키 편입 (manifest 정식 편입)

렌더 산출물(`diagrams/<slug>.html`)이 놓인 상태에서, **패스스루 스펙**을 `docs/zzon-doc/specs/<slug>.json`에 쓴다:

```json
{
  "renderer": "engine",
  "kind": "infra",
  "view": "deployment",
  "title": "개발 환경 클라우드 인프라",
  "section": "아키텍처",
  "order": 2,
  "description": "이 그림이 보여 주는 인프라를 한두 문장으로 쓴다",
  "source": "terra/<slug>.ts",
  "sources": ["infra/envs/dev/**", "infra/modules/**"]
}
```

- `sources`에는 **읽은 tf 경로**를 넣는다(프로젝트 루트 기준 glob). tf가 바뀌면 `build-docs --status`가 이 장을 stale로 짚는다.
- `source` 필드가 있으면 build-docs가 엔진을 bun으로 직접 렌더한다. counts·게이트 결과는 scene에서 자동으로 나온다. (`"renderer": "terra-form"`은 같은 경로의 옛 이름이라 계속 동작한다.)

통합 빌드:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/zzon-doc/scripts/build-docs.mjs <project>/docs/zzon-doc --title "<제목>"
```

`wiki.json`이 있으면(zzon-wiki 사용 중) `build-wiki.mjs`도 실행하고, 위키 문서 본문에는 `@diagram(<slug>)` 한 줄만 쓴다.
참고: `renderer` 없는 일반 DiagramSpec JSON 스펙도 이제 같은 엔진이 렌더한다(변환 내장) — 통합 문서의 뷰어 프레임이 전부 동일해진다.

## 출력 .html에서 되는 것 (사용자에게 안내)

팬/줌(휠·드래그, 더블클릭 리셋) · 노드 hover → 인접 엣지·이웃 하이라이트 · **layer 토글**(request/pipeline/… 켜고 끄기) · **노드 클릭 → 상세 사이드바**(설명·연결 목록·드릴다운) · 플로우 순번 · 다크/라이트 · SVG/PNG 내보내기 · 폰트·아이콘 전부 인라인(외부 요청 0).

## 절대 규칙

- 엔진 코드를 고치지 마라 — 만드는 건 **DSL `.ts`와 패스스루 스펙 JSON까지**다. (엔진 개선은 별도 작업.)
- 승인 전 파일 생성 금지 / tf에 없는 리소스를 추측으로 그리지 마라 — 모르면 물어라.
- 불변식 위반이 남은 채로 전달 금지. 생략 항목 미고지 금지.
- git 커밋은 사용자가 지시할 때만.
