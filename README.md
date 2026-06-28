# zzon-doc — Claude Code 플러그인 마켓플레이스

코드를 분석해 **인터랙티브 아키텍처 다이어그램**을 그리는 Claude Code 플러그인 모음.
이 레포는 그 자체로 plugin marketplace다.

## 수록 플러그인

| 플러그인 | 설명 |
|---|---|
| [`zzon-doc`](./zzon-doc) | 코드베이스를 분석해 DiagramSpec JSON을 저작하고, 의존성 0짜리 인터랙티브 단일 `.html`로 렌더링한다. infra / data-flow / erd / agent-topology 지원. |

## 설치

Claude Code에서 이 레포를 마켓플레이스로 추가한 뒤 플러그인을 설치한다.

```
/plugin marketplace add /Users/dpx/Documents/src/plugins-zzon-doc
/plugin install zzon-doc@zzon
```

> 원격 git 레포로 호스팅한다면 경로 대신 git URL을 써도 된다:
> `/plugin marketplace add <owner>/<repo>`

## 사용

`/zzon-arch <대상>` 으로 명시 호출하거나, 그냥 자연어로 요청해도 `zzon-arch` 스킬이 동작한다.

```
/zzon-arch 이 레포의 인프라
/zzon-arch prisma 스키마로 ERD
.claude 에이전트 구조를 시각화해줘
```

Claude가 (1) 코드를 분석해 DiagramSpec JSON을 저작하고 (2) `render.mjs`로 단일 `.html`을 뽑는다.
생성된 `.html`은 **브라우저로 그냥 열면** 된다 — 서버·인터넷·라이브러리 전부 불필요.

### .html에서 되는 것

노드 클릭 하이라이트 + 상세 패널 · 플로우 순번 강조 + 단계 패널 · 팬/줌 · 범례 · 다크/라이트 토글.

## 직접 렌더링 (선택)

스킬 없이 손으로 만든 스펙을 렌더링할 수도 있다.

```bash
node zzon-doc/skills/zzon-arch/scripts/render.mjs <spec.json> [-o out.html]
```

Node 20+ 내장 모듈만 쓴다. 설치할 의존성 없음.

## 요구사항

- Claude Code (플러그인/스킬 지원 버전)
- Node.js 20+ (`render.mjs` 실행용)
