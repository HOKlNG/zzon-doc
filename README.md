<p align="center">
  <a href="https://www.youtube.com/@김쫀떡">
    <img src="assets/zzon-ddeok.jpg" width="120" alt="쫀떡 — 유튜브 채널 김쫀떡" />
  </a>
</p>

<h1 align="center">zzon-doc</h1>

<p align="center">
  코드를 분석해 아키텍처 다이어그램 · 시퀀스 다이어그램 · 문서 위키를 만들어 주는 Claude Code 플러그인입니다.<br />
  결과물은 의존성 없는 단일 <code>.html</code> — 브라우저로 열기만 하면 됩니다.
</p>

<p align="center">
  <a href="https://docs.claude.com/en/docs/claude-code/plugins"><img src="https://img.shields.io/badge/Claude_Code-plugin-d97757" alt="Claude Code Plugin" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-3da639" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/output_dependencies-0-2563eb" alt="Zero-dependency output" />
</p>

<p align="center">
  <b>한국어</b> · <a href="./README.en.md">English</a>
</p>

## 소개

**zzon-doc**은 Claude Code에 문서화 스킬 4종을 더해 주는 플러그인입니다. 코드베이스를 분석해 다이어그램과 문서를 저작하고, 서버·라이브러리·CDN 없이 브라우저에서 바로 열리는 **self-contained 단일 `.html`**로 렌더링합니다.

| 스킬 | 하는 일 |
|---|---|
| **zzon-doc** | 코드를 분석해 인프라 · 데이터 흐름 · ERD · 에이전트 구조 등 아키텍처 다이어그램을 그립니다 |
| **zzon-seq** | 기능의 코드 경로를 추적해 액터 간 요청/응답 왕복을 시간축 시퀀스로 그립니다 |
| **terra-form** | Terraform(`*.tf`)을 읽어 클라우드 인프라를 AWS 공식 아이콘으로 그립니다 |
| **zzon-wiki** | 프로젝트 개발 문서 위키를 만들고, 코드 스캔과 질문으로 내용을 채웁니다 |

## 미리보기

| 통합 문서 (메뉴 + 전체보기) | 시퀀스 다이어그램 (zzon-seq) |
|---|---|
| ![통합 문서](assets/integrated-doc.png) | ![시퀀스 다이어그램](assets/diagram-seq.png) |

플로우 버튼을 누르면 경로가 **순번 배지(①②③)** · **순번 스트립** · **우측 단계 사이드바**와 함께 강조됩니다.

![플로우 강조](assets/diagram-flow.png)

| ERD + 상세 사이드바 (컬럼 · FK 연결) | 문서 위키 (zzon-wiki) |
|---|---|
| ![ERD](assets/diagram-erd.png) | ![문서 위키](assets/wiki-home.png) |

> 모두 번들 샘플과 예제로 만든 화면입니다. 의존성 없는 단일 `.html`을 브라우저로 연 모습입니다.

## 주요 기능

- **5종 다이어그램** — 인프라 · 데이터 흐름 · 시퀀스 · ERD · 에이전트(`.claude`) 구조를 지원합니다. 컨텍스트, 멀티리전 HA, 데이터 파이프라인, 풀뎁스 원장 등 유형 카탈로그를 갖추고 있습니다.
- **의존성 0 출력** — 라이브러리 · CDN 없이 self-contained 단일 `.html`을 만듭니다.
- **인터랙티브 뷰어** — 노드 클릭, 플로우 강조, 순번 배지, 드릴다운(⊕ 더블클릭), 호버 툴팁, 팬/줌, 다크 모드, SVG/PNG 내보내기(순수 벡터)를 지원합니다.
- **통합 문서** — 여러 장을 좌측 메뉴와 전체보기로 묶어 하나의 문서 사이트로 만듭니다.
- **시퀀스 다이어그램** — 전체/간소화 토글, 단계 상세(근거 코드 위치), 둘러보기(단계 재생), alt/opt/loop/par 분기를 지원합니다.
- **Terraform 인프라** — AWS는 공식 아이콘 838종과 AZ×티어 격자 · 스팬 overlay로, 다른 클라우드는 카테고리 카드와 확장 아이콘으로 그립니다.
- **문서 위키** — 진행 현황과 열린 질문을 추적하는 위키 사이트를 생성하고, 아키텍처 문서에 다이어그램을 임베드합니다.
- **범위 제안** — 큰 프로젝트는 구조를 먼저 파악해 몇 장을 어느 깊이로 그릴지 제안합니다.
- **로컬 분석** — 코드는 로컬에서만 분석합니다. 네트워크 요청과 텔레메트리가 없습니다.

## 시작하기

### 요구 사항

- Claude Code (플러그인/스킬 지원 버전)
- Node.js 20+ — 빌드 스크립트 실행에 필요합니다
- [bun](https://bun.sh) — 다이어그램 엔진 실행에 필요합니다. **새로 그리는 구조 · 인프라 다이어그램과 terra-form은 bun이 필수**이며, 없으면 레거시 DiagramSpec JSON 렌더 · 시퀀스 · 위키만 동작합니다(자동 폴백)

### 설치

```
/plugin marketplace add HOKlNG/zzon-doc
/plugin install zzon-doc@zzon
```

다이어그램 엔진은 최초 1회 준비가 필요합니다.

```bash
cd zzon-doc/engine && bun install
```

## 사용법

`/zzon-doc:zzon-doc <요청>`으로 부르거나, 자연어로 요청하면 자동으로 동작합니다. (플러그인 스킬은 `플러그인명:스킬명` 네임스페이스를 씁니다.)

**① 프로젝트 전체 아키텍처** — 구조를 먼저 파악해 **무엇을 몇 장으로 그릴지 제안**하고, 합의하면 여러 문서로 만들어 통합 뷰(좌측 메뉴 + 전체보기)로 묶어 줍니다.

```
/zzon-doc:zzon-doc 이 프로젝트의 아키텍처 그려줘
```

**② 특정 부분만** — 원하는 한 부분을 한 장으로 그립니다.

```
/zzon-doc:zzon-doc 이 repo의 클라우드 아키텍처 그려줘
```

**③ 기능 시퀀스 다이어그램** — 특정 기능의 코드 경로(라우트→서비스→큐→워커)를 추적해 시간축 시퀀스로 그립니다.

```
/zzon-doc:zzon-seq 결제 흐름 시퀀스 다이어그램 그려줘
```

**④ Terraform 인프라** — `*.tf`를 읽어 클라우드 인프라를 그립니다. AWS는 공식 아이콘과 AZ×티어 격자, 다른 클라우드는 카테고리 카드로 표현합니다.

```
/zzon-doc:terra-form ./infra
```

**⑤ 프로젝트 문서 위키** — 티어(라이트/표준/풀)를 합의한 뒤, 코드에서 읽히는 내용은 자동으로 쓰고 모르는 내용은 질문으로 채웁니다. 이미 만든 위키는 빠진 내용과 사람이 고친 문서를 감지해 이어서 채웁니다.

```
/zzon-doc:zzon-wiki 이 프로젝트 문서 위키 만들어줘
```

생성된 `.html`은 **노드 클릭 · 플로우 강조 · 순번 배지 · 호버 툴팁 · 팬/줌 · 다크 모드**가 되는 인터랙티브 문서입니다.

### 산출물 위치

산출물(스펙 · 다이어그램 · 위키 상태)은 대상 프로젝트의 **`docs/zzon-doc/`** 아래에 생성됩니다. 이전 버전 기본값인 루트 `zzon-doc/` 폴더가 이미 있으면 그대로 이어서 사용합니다.

## 직접 렌더링 (선택)

스킬 없이 손으로 만든 스펙도 렌더링할 수 있습니다.

```bash
# 단일 .html 한 장
node zzon-doc/skills/zzon-doc/scripts/render.mjs <spec.json> [-o out.html]

# 여러 스펙 → 통합 문서 (docs/zzon-doc/specs/*.json → docs/zzon-doc/index.html)
node zzon-doc/skills/zzon-doc/scripts/build-docs.mjs ./docs/zzon-doc --title "문서 제목"
```

빌드 스크립트는 Node 20+ 내장 모듈만 사용합니다. 구조 다이어그램의 렌더러는 내장 엔진(bun)이고, bun이 없으면 **레거시 DiagramSpec JSON에 한해** 레거시 렌더러로 자동 폴백됩니다. 어느 쪽이든 출력 `.html`은 외부 요청 0의 self-contained입니다.

## 최근 변경 사항

- **v0.8.2 — 어휘 정책 · 시퀀스 슬롯 · 플로우 품질** : terra-form이 클라우드 전반(IaC 기반)으로 확장되었습니다. 레거시 DiagramSpec에 `"vocabulary": "aws"` 한 줄로 클라우드 아이콘 어휘를 선택할 수 있고(혼용은 validator가 차단합니다), zzon-wiki 카탈로그에 핵심 프로세스 시퀀스(seq-flows) 슬롯이 생겨 제안 단계에서 시퀀스가 자동으로 올라옵니다. 밀집 플로우의 엣지 라벨(통로 폭 적응 · 카드 위 pill 렌더)과 스텝 포커스 강조도 개선했습니다.
- **v0.8.1 — 통합 다이어그램 엔진** : 구조 · 데이터 다이어그램(infra/data-flow/erd/agent-topology)이 **내장 TS 엔진**으로 렌더됩니다. 진짜 자동 배치(ELK), 직교 라우팅, 겹침 · 관통 불변식을 갖췄고, 뷰어는 기존 UX(사이드바 · 플로우 · 범례 · 테마)를 그대로 유지합니다. 기존 DiagramSpec JSON은 변환이 내장돼 그대로 렌더되며, 레거시 렌더러는 `ZZON_LEGACY_RENDER=1` 또는 스펙의 `"renderer":"legacy"`로 사용할 수 있습니다.

## 이름에 대하여

`zzon-doc`은 제가 좋아하는 고양이 **쫀떡(zzon-ddeok)**이의 이름에서 왔습니다. 유튜브 채널 [김쫀떡](https://www.youtube.com/@김쫀떡)의 바로 그 쫀떡이입니다. 문서와 다이어그램(**doc**)을 다루는 도구라, `zzon-ddeok`을 언어유희로 비틀어 **`zzon-doc`**이 되었습니다. 🐱

## 라이선스

[MIT License](./LICENSE)를 따릅니다. 상업적 사용을 포함해 자유롭게 사용 · 수정 · 재배포할 수 있으며, 저작권과 라이선스 고지만 유지하면 됩니다.

## 크레딧

아이콘은 [Lucide](https://lucide.dev)(ISC)를 SVG로 인라인해 사용합니다. Lucide는 [Feather Icons](https://github.com/feathericons/feather)(MIT)에서 파생되었습니다. 자세한 고지는 [`NOTICE`](./NOTICE)를 참고해 주세요.
