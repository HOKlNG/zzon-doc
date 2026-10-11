---
name: zzon-doc
description: 코드베이스를 근거로 다이어그램을 그리는 메인 스킬이다. 무엇을 그릴지(뷰)와 얼마나 복잡하게 그릴지(등급)를 객관 기준으로 고른다. 지원하는 뷰는 아키텍처, 시스템 컨텍스트, 컨테이너, 컴포넌트, 인프라·배포 구성도, 쿠버네티스, 네트워크·보안 경계, 데이터·이벤트 흐름, 파이프라인, ERD, 상태 전이도, 플로우차트, 모듈 의존성 그래프, 화면 흐름, 도메인 모델(클래스), 에이전트 구성이다. 시퀀스와 Terraform은 형제 스킬 절차로 넘긴다. 코드가 바뀐 뒤 기존 다이어그램을 대조해 갱신한다. 산출물은 의존성 0 인터랙티브 .html이다.
when_to_use: 다이어그램·구성도·도식·시각화 요청 전반에 쓴다("~그려줘", "구조 보여줘", "draw/diagram/visualize architecture·ERD·state machine·flowchart·dependency graph"). "다이어그램 업데이트/다시 훑어/최신화/재생성/코드 바뀌었어"처럼 기존 그림을 갱신하는 요청에도 쓴다. 문서 위키 전체를 만들거나 채우는 요청은 zzon-wiki가 맡는다.
argument-hint: '[그릴 대상 — 예: 이 레포 아키텍처 / 주문 상태 전이 / 모듈 의존성 / 다이어그램 업데이트]'
---

# 다이어그램 메인 (zzon-doc)

코드를 근거로 그림을 그린다. 순서는 고정이다.
**분기 → 신호 → 뷰·등급 → 위임/저작 → 게이트 → 빌드·스탬프 → 보고.** 단계를 건너뛰지 마라.

경로 표기:
- `$Z` = `${CLAUDE_PLUGIN_ROOT}`
- `<docsDir>` = 대상 프로젝트의 `docs/zzon-doc/`. 구버전 루트 `zzon-doc/` 산출 폴더가 이미 있으면 그것을 쓴다.
- 엔진은 최초 1회 `cd $Z/engine && bun install`이 필요하다. bun이 없으면 설치를 안내하고 멈춘다.

## 0. 분기 — 첫 행동

- **`<docsDir>/specs/`가 이미 있으면 재진입이다.** 첫 행동은 무조건 다음 명령이다.
  `node $Z/skills/zzon-doc/scripts/build-docs.mjs <docsDir> --status`
  - 요청이 "업데이트·다시 훑어·최신화"류든 새 그림 요청이든 똑같다.
  - status 출력 없이 "최신이다/반영했다"고 말하지 마라. 판정은 출력이 한다.
  - **stale** 장: 변경 파일을 실제로 읽고(출력의 `git diff` 명령 포함) DSL을 고친다. 그다음 빌드한다. 빌드가 재스탬프한다.
    읽어 보니 그림을 바꿀 필요가 없으면 `--stamp <slug>`로 명시하고, 그 이유를 보고한다.
  - **untracked** 장: 근거 파일을 다시 확인해 스펙 stub의 `sources`를 채운다.
  - **신호 변화**(테이블·배포 단위·화면 수 등): 출력이 짚는 뷰의 장을 재검토하거나 새 장을 제안한다.
- `<docsDir>/wiki.json`이 있으면 index.html은 위키 소유다. 이 스킬은 다이어그램만 다루고, 문서 갱신은 zzon-wiki 절차를 따른다.

## 1. 신호 — 코드 사실을 센다

`node $Z/skills/zzon-doc/scripts/scan.mjs <프로젝트 루트>`

출력은 IaC 리소스·배포 단위·테이블·라우트·큐·상태 enum·화면·에이전트·소스 모듈 수와 뷰 후보다.
판단의 입력은 **이 출력 + 요청어 + 독자 + 매체**다. 훑어본 인상으로 정하지 마라.

## 2. 뷰·등급 — `references/selection-rubric.md`를 읽고 따른다

- **뷰**(§2): 요청어(지명 10점, 관심사 5점) + 코드 신호(2점)로 점수를 낸다.
  최고점이 10 이상이고 2위와 5점 이상 차이 나면 확정한다. 그렇지 않으면 상위 2개를 이유와 함께 한 질문으로 묻는다.
- **등급**(§3): T1 개괄 ≤9 · T2 표준 10–20 · T3 원장 21–50이다. T3는 세 조건(운영·감사·전체 관심사 / 전체화면 / 상위 T1 장과 드릴다운)을 모두 충족할 때만 쓴다.
- **포괄 요청**("아키텍처 그려줘", "문서화해줘"): §2.3 기본 세트를 장 목록 + 등급 + 근거 수치로 제안하고, **승인 후** 그린다. 예:
  > "scan: 배포 단위 4, 테이블 23, 라우트 41, 상태 enum 2. 컨텍스트(T1) + 컨테이너(T2) + ERD 2장(T2, 주문·회원 도메인) + 시퀀스 2장(로그인·결제) + 주문 상태 전이(T2). 진행할까?"
- **구체 요청**("결제 상태 전이 그려줘"): 바로 그 한 장을 그린다. 뷰와 등급만 밝힌다.
- **큰 그림과 세부**(§3.4): 같은 리소스를 두 장으로 낼지는 세부 모델을 그린 뒤 `bun ia check`의 "줌 판단"을 따른다. 21개 이상이면 필수, 10~20개면 문서 세트이거나 독자·매체가 섞일 때 낸다. 큰 그림은 따로 그리지 않는다 — 스펙 stub에 `"overview": true`를 쓰면 build-docs가 같은 모델을 접어 만들고, 큰 그림 노드에서 세부로 드릴다운된다. 판단이 "다시 구성하라"면 세부 모델을 묶음(계정·도메인·계층) 단위로 다시 짠다.

## 3. 위임 또는 저작

| 뷰 | 하는 일 |
|---|---|
| 시퀀스 | `$Z/skills/zzon-seq/SKILL.md`를 읽고 그 절차로 SeqSpec을 저작한다 |
| 배포·인프라이고 `*.tf`가 있음 | `$Z/skills/terra-form/SKILL.md`를 읽고 그 절차를 따른다 |
| 그 외 전부 | `references/views/README.md`(공통 계약)와 해당 `references/views/<뷰>.md`를 읽고 엔진 DSL을 저작한다 |

뷰 문서 목록:
- `context`(컨텍스트·랜드스케이프), `container`(컨테이너·컴포넌트), `deployment`(인프라·k8s·네트워크·보안, tf 없음)
- `flow`(기능 흐름·이벤트·CI/CD·파이프라인), `erd`, `state`, `flowchart`
- `dependency`(**`scripts/scan-deps.mjs`로 기계 생성**), `screen-flow`, `domain-model`, `agent-topology`

틀리기 쉬운 계약(상세는 views/README.md):
- DSL은 `<docsDir>/terra/<slug>.ts`에 둔다. 머리는 `diagram(slug, { title, view, tier, direction? }, d => …)`이다. **view·tier는 게이트 기준**이니 빠뜨리지 마라.
- **캔버스 텍스트를 절제한다.** 설명 문장은 `description:`(사이드바)에 넣는다. 라벨은 짧게, 엣지 라벨은 2어절 이내로 쓴다.
- **독자가 읽는 글**(제목, 요약, `description`, 플로우 단계)은 `references/writing-style.md`의 여섯 규칙을 따른다. 필드 이름, 등급 코드, 화살표 사슬, 그림 제작 설명을 넣지 마라.
- **배치 의도는 힌트로 밝힌다.** 열은 `hints.layer`, 열 안 순서는 `hints.order`, 방향은 `direction`이다.
- 엣지에는 `layer:`가 필수다. 대표 경로는 `d.flow()`로 넣는다(T3에서는 필수).
- **축소는 rubric §3.3 사다리 순서로만** 한다. 줄인 내용은 충실도 장부로 보고한다.

스펙 stub `<docsDir>/specs/<slug>.json`:

```json
{ "renderer": "engine", "kind": "infra", "view": "container", "title": "…", "section": "…", "order": 1,
  "description": "이 그림이 보여 주는 시스템을 한두 문장으로 쓴다",
  "source": "terra/<slug>.ts", "sources": ["services/order/**", "docker-compose.yml"] }
```

- `kind`: `infra | data-flow | erd | agent-topology | state | flowchart | dependency | screen-flow | class`(시퀀스는 `sequence`)
- **`sources`** = 이 장을 그리며 실제로 읽은 파일 glob이다(프로젝트 루트 기준). 비우면 코드가 바뀐 뒤 이 장이 낡았는지 판정할 수 없다. 반드시 채운다.

## 4. 게이트 (필수)

`cd $Z/engine && bun ia check <docsDir>/terra/<slug>.ts`

- **✗**(불변식, 노드·엣지 예산 초과, 라벨 가림): 고친 뒤에만 전달한다.
- **!**(선 겹침·교차·꺾임·색 그룹·흐름 방향·종횡비): `references/layout-guide.md` 4절의 처방대로 고친다. 선 겹침과 라벨 가림은 엔진이 간격을 넓혀 한 번 더 배치한 뒤에도 남은 것이니 구조(열·묶음·중간 노드)를 고친다. 그래도 남으면 이유를 보고한다.
- **배치는 저작할 때 잡는다**: DSL을 쓰기 전에 `references/layout-guide.md` 2절 순서(방향 → 주 경로 열 → 줄 → 묶기 → 횡단 관심사 띠 → 되돌아가는 선 → 몰리는 선 → 라벨 → 진입면)를 따른다.
- `bun ia export <소스> --png --out <docsDir>/diagrams`로 PNG를 만들어 **열어 보고** 확인한다. 게이트는 충돌을 잡고, 의미가 맞는지는 눈으로 확인한다.

## 5. 빌드·스탬프

`node $Z/skills/zzon-doc/scripts/build-docs.mjs <docsDir> --title "<제목>"`

- 렌더(엔진·시퀀스) + manifest(뷰·등급·게이트 결과) + `diagrams.lock.json` 근거 스탬프를 만든다. 스펙이 바뀐 장은 자동으로 스탬프된다.
- 빌드 출력의 "품질 게이트 실패"와 "sources 미기록" 줄을 그냥 넘기지 마라.
- `wiki.json`이 있으면 이어서 `node $Z/skills/zzon-wiki/scripts/build-wiki.mjs <docsDir>`를 실행한다.

## 6. 보고 (장마다)

- 뷰·등급과 그 근거(scan 수치·요청어)
- 게이트 결과(경고가 남았다면 이유)
- **충실도 장부**: 원천 X개 → 그림 Y개 (병합 · 접음 · 생략 목록)
- `sources`
- 재진입이었다면: stale 장별로 무엇이 바뀌었고(노드·엣지 추가·삭제·변경) 무엇을 스탬프만 했는지

## 출력 .html에서 되는 것 (사용자에게 안내)

- 팬·줌, hover 시 인접 강조, **layer 토글**
- **플로우 버튼 + 순번 배지 + 단계 스트립**
- **노드 클릭 → 상세 사이드바**(설명·연결 목록·드릴다운), `href` 드릴다운(통합 문서에서 장 이동)
- ERD 까마귀발, 자동 범례, 다크·라이트 모드, SVG·PNG 내보내기

## 절대 규칙

- 그릴 때 엔진 코드를 고치지 마라. 만드는 건 DSL `.ts` + 스펙 stub까지다.
- 추측하지 마라. 읽은 것만 그리고, `sources`에는 실제로 읽은 파일만 적는다. 모르면 묻는다.
- 게이트 ✗가 남은 채 전달하지 마라. 재진입에서 `--status` 없이 "최신"이라고 단정하지 마라.
- 레거시 DiagramSpec JSON은 신규 저작 금지다(deprecated — 기존 스펙은 그대로 렌더된다).
