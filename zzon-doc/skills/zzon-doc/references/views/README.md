# 뷰 카탈로그 — 유형별 작도 문법

이 문서들은 **무엇을 그릴지(뷰)와 얼마나 복잡하게 그릴지(등급)를 정한 뒤에** 읽는다.
그 결정은 `../selection-rubric.md`가 내린다. 여기서는 정해진 뷰를 **어떻게** 그리는지만 다룬다.

| 뷰 | 문서 | docKind | 기본 등급 | 담당 |
|---|---|---|---|---|
| 컨텍스트 · 랜드스케이프 | `context.md` | infra | T1 | zzon-doc |
| 컨테이너 · 컴포넌트 | `container.md` | infra | T2 | zzon-doc |
| 배포 · 인프라 · 쿠버네티스 · 네트워크 · 보안 경계 | `deployment.md` | infra | T2 (환경 전체는 T3) | IaC(tf)가 있으면 terra-form |
| 기능 흐름 · 이벤트 · CI/CD · 데이터 파이프라인 · 리니지 | `flow.md` | data-flow | T2 | zzon-doc |
| ERD | `erd.md` | erd | T2 (장당 ≤12 테이블) | zzon-doc |
| 상태 전이도 | `state.md` | state | T2 | zzon-doc |
| 플로우차트 (분기 로직·절차) | `flowchart.md` | flowchart | T2 | zzon-doc |
| 모듈 의존성 | `dependency.md` | dependency | 모듈 수로 결정 | zzon-doc (`scan-deps.mjs` 생성) |
| 화면 흐름 | `screen-flow.md` | screen-flow | T2 | zzon-doc |
| 도메인 모델 (클래스) | `domain-model.md` | class | T2 | zzon-doc |
| 에이전트 토폴로지 | `agent-topology.md` | agent-topology | T1 | zzon-doc |
| 시퀀스 | — | sequence | 액터 ≤8 · 메시지 ≤28 | `../../../zzon-seq/SKILL.md` |

## 모든 뷰의 공통 계약

- **파일 위치**: `<docsDir>/terra/<slug>.ts`. 첫 줄은 `import { diagram } from "../src/dsl/index.ts";`이다.
  엔진은 이 파일을 자기 `examples/` 옆에 임시 복사해서 해석한다. 그래서 대상 프로젝트에서는 이 import가 풀리지 않는다.
  대상 프로젝트의 tsconfig가 `docs/`를 포함하면 `exclude`에 `docs/zzon-doc/terra`를 넣으라고 안내한다.
- **머리**: `diagram("<slug>", { title, view, tier, docKind?, direction? }, (d) => { … })`.
  - `view`·`tier`는 품질 게이트(`bun ia check`)의 판정 기준이다. 반드시 넣는다.
- **노드 어휘**: 한 장에 한 어휘만 쓴다.
  - `category:` 카드(32종) — `user frontend mobile backend service worker lambda scheduler db table cache queue storage cdn gateway auth agent skill hook doc other lb dns firewall monitor secret ml analytics topic pipeline device external`
  - `icon:` AWS 공식 838종 + lucide. 실재 여부는 `grep '"<키>"' engine/src/icons/manifest.gen.ts engine/src/icons/aliases.ts`로 확인한다.
  - `table:` ERD 테이블
  - 뷰 전용 모양(`shape`)은 해당 뷰 문서를 본다.
- **캔버스 텍스트는 절제한다**.
  - `label`은 이름만 쓰고 `sublabel`·`tech`는 한 줄로 쓴다.
  - 설명 문장은 `description:`에 넣는다. 클릭하면 우측 사이드바에 나온다.
  - 카드 안에 설명 문장을 그리는 `nodeDescriptions: true`는 컨텍스트(T1) 관례에서만 켠다.
- **배치**는 `../layout-guide.md`의 작성 순서와 처방을 따른다(방향, 주 경로 열, 줄, 묶기, 되돌아가는 선, 진입면).
- **독자가 읽는 글**(`title`, `description`, 플로우 `title`·`text`)은 `../writing-style.md`의 여섯 규칙을 따른다. 근거 파일 경로는 스펙 stub의 `sources`에 두고 사이드바 설명에 쓰지 않는다.
- **배치 의도는 힌트로 밝힌다** (`hints`는 노드·그룹 옵션이다).
  - `direction: "RIGHT" | "DOWN"`(다이어그램 옵션): 주 흐름 방향. 선언하면 엔진이 종횡비 때문에 방향을 뒤집지 않는다.
  - `hints: { layer: n }`: 몇 번째 열(DOWN이면 행)인지 정한다. 같은 값은 같은 열이고, 빈 번호는 접힌다.
  - `hints: { order: n }`: 열 안의 순서다. 작을수록 위(왼쪽)에 놓인다.
  - 힌트를 생략하면 자동 배치된다. 자동 결과가 게이트 경고를 받으면 그때 힌트로 고친다.
  - `rank`·`onBorder`·`minWidth`·`waypoints`는 동작하지 않는다(검증 경고). 쓰지 마라.
- **표기 헬퍼**(뷰 전용 모양): 상태도 `d.initial/state/choice/final` + `d.transition`, 플로우차트 `d.terminal/process/decision`, 화면 흐름 `d.screen`, 도메인 모델 `d.classNode` + `d.composes/aggregates/associates/inherits/implements`, 의존성 `d.module` + `d.dependsOn`. 그룹 안에서도 쓸 수 있다(`g.state(…)`).
- **엣지**
  - `layer:`는 필수다. 뷰어의 레이어 토글 단위이고, 값 예시는 http, data, async, deploy, monitor다. 헬퍼는 기본값을 넣는다(transition, inherit, depends …).
  - 라벨은 동사로 2어절 이내로 쓴다. 뻔한 엣지는 라벨을 생략한다.
  - **되돌아가는 엣지**(재시도·"쇼핑 계속"·되돌리기)는 `back: true`를 단다. 배치에서 역방향으로 취급해 본선의 읽는 순서를 지킨다. 필요하면 `hints: { sourceSide, targetSide }`로 캔버스 바깥을 돌게 한다.
  - 같은 면을 여러 관계가 다투면 `hints: { sourceSide: "E" }`처럼 진입면을 고정한다.
- **플로우**: 대표 경로가 코드에서 읽히면 `d.flow(id, { title, steps: [{ edge, text }] })`를 1~2개 넣는다. T3에서는 필수다.
- **드릴다운**: `href: "<다른 slug>"`. 상위 개괄 장의 노드에서 상세 장으로 잇는다.
- **근거 기록**: 스펙 stub의 `sources`에 이 장을 그리며 실제로 읽은 파일 glob을 적는다.
  비우면 코드가 바뀐 뒤 이 장이 낡았는지 판정할 수 없다.
