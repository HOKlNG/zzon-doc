<p align="center">
  <a href="https://www.youtube.com/@김쫀떡">
    <img src="assets/zzon-ddeok.jpg" width="120" alt="쫀떡 — 유튜브 채널 김쫀떡" />
  </a>
</p>

# zzon-doc — Claude Code 플러그인 마켓플레이스

[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-plugin-d97757)](https://docs.claude.com/en/docs/claude-code/plugins) [![License: MIT](https://img.shields.io/badge/License-MIT-3da639)](./LICENSE) ![Zero dependencies](https://img.shields.io/badge/dependencies-0-2563eb)

**한국어** · [English](./README.en.md)

> **Claude Code 플러그인(스킬)** — Anthropic Claude Code에서 코드베이스를 인터랙티브 아키텍처 다이어그램으로 그려주는 스킬

코드를 분석해 **인터랙티브 아키텍처 다이어그램**을 그리는 Claude Code 플러그인
이 레포는 그 자체로 plugin marketplace다. 출력은 **의존성 0짜리 단일 `.html`** — 서버·라이브러리·CDN 없이 브라우저로 그냥 연다.

## 미리보기

| 통합 문서 (메뉴 + 전체보기) | 플로우 강조 (순번 배지 + 단계 패널) |
|---|---|
| ![통합 문서](assets/integrated-doc.png) | ![플로우 강조](assets/diagram-flow.png) |

![대형 ERD](assets/diagram-erd.png)

> 위 이미지는 번들 샘플로 만든 결과물이다. 모든 다이어그램은 클릭·호버·팬/줌이 되는 인터랙티브 HTML이다.

## 수록 플러그인

| 플러그인 | 설명 |
|---|---|
| [`zzon-doc`](./zzon-doc) | 코드베이스를 분석해 DiagramSpec JSON을 작성하고, 의존성 0짜리 인터랙티브 단일 `.html`로 렌더링한다. infra / data-flow / erd / agent-topology 지원. |

## 설치

Claude Code에서 이 레포를 마켓플레이스로 추가한 뒤 플러그인을 설치한다.

```
/plugin marketplace add HOKlNG/zzon-doc
/plugin install zzon-doc@zzon
```

## 사용

`/zzon-doc:zzon-doc <대상>` 으로 명시 호출하거나, 그냥 자연어로 요청해도 `zzon-doc` 스킬이 동작한다.
(플러그인 스킬은 `플러그인명:스킬명` 으로 네임스페이스가 붙는다 — 그래서 `/zzon-doc` 가 아니라 `/zzon-doc:zzon-doc` 다.)

```
/zzon-doc:zzon-doc 이 레포의 인프라
/zzon-doc:zzon-doc prisma 스키마로 ERD
.claude 에이전트 구조를 시각화해줘
```

Claude가 (1) 코드를 분석해 DiagramSpec JSON을 저작하고 (2) `render.mjs`로 단일 `.html`을 뽑는다.

> 요청이 넓으면(예: "이 프로젝트 그려줘") 바로 한 장을 떠넘기지 않는다 — 먼저 구조를 훑고 **무엇을·어느 수준으로·몇 장으로** 그릴지 같이 정한 뒤 그린다.

### .html에서 되는 것

노드 클릭 하이라이트 + 상세 패널 · 플로우 순번 강조 + 단계 패널 · **순번 배지/단계 클릭 강조** · **호버 툴팁** · 팬/줌 · 범례 · 다크/라이트 토글.

### 여러 개를 한 문서로

아키텍처를 여러 장 그리면 **통합 문서**로 쌓인다. 기본 출력 폴더 `zzon-doc/` 아래에
스펙(`specs/`)·개별 다이어그램(`diagrams/`)·통합 `index.html`이 정리된다.
`index.html` 하나만 열면 **좌측 메뉴 + 전체보기(홈) + 뷰어**로 모든 다이어그램을 오간다.

## 직접 렌더링 (선택)

스킬 없이 손으로 만든 스펙도 렌더링할 수 있다.

```bash
# 단일 .html 한 장
node zzon-doc/skills/zzon-doc/scripts/render.mjs <spec.json> [-o out.html]

# 여러 스펙 → 통합 문서 (zzon-doc/specs/*.json → zzon-doc/index.html)
node zzon-doc/skills/zzon-doc/scripts/build-docs.mjs ./zzon-doc --title "문서 제목"
```

Node 20+ 내장 모듈만 쓴다. 설치할 의존성 없음.

## 요구사항

- Claude Code (플러그인/스킬 지원 버전)
- Node.js 20+ (`render.mjs` 실행용)

## [기타] 이름에 대하여

`zzon-doc`은 내가 좋아하는 고양이 **쫀떡(zzon-ddeok)**이의 이름에서 나왔다. 유튜브 채널 [김쫀떡](https://www.youtube.com/@김쫀떡)의 바로 그 쫀떡이다. 문서·다이어그램(**doc**)을 다루는 도구라, `zzon-ddeok`을 언어유희로 비틀어 **`zzon-doc`**으로 지었다. 🐱

## 라이선스

[MIT License](./LICENSE) — 상업적 사용 포함 **자유롭게 사용·수정·재배포**할 수 있다. 저작권·라이선스 고지만 유지하면 된다.

## 크레딧

아이콘은 [Lucide](https://lucide.dev)(ISC) — [Feather Icons](https://github.com/feathericons/feather)(MIT)에서 파생 — 를 SVG로 인라인해 쓴다. 자세한 고지는 [`NOTICE`](./NOTICE) 참고.
