# zzon-doc — 인수인계 (CLAUDE 세션용)

이 레포는 **Claude Code 플러그인 마켓플레이스**다. 코드를 분석해 인터랙티브 아키텍처 다이어그램을 **의존성 0짜리 단일 .html**로 그려주는 스킬을 담는다. 나중에 문서 작성 기능까지 확장 예정.

## 네이밍 (혼동 주의)

| 층 | 이름 | 비고 |
|---|---|---|
| 마켓플레이스 | `zzon` | `.claude-plugin/marketplace.json` (레포 루트) |
| 플러그인(우산) | `zzon-doc` | `zzon-doc/.claude-plugin/plugin.json` |
| 스킬 1 | `zzon-doc` | → `/zzon-doc:zzon-doc` (플러그인 스킬은 `플러그인명:스킬명` 네임스페이스). 아키텍처 다이어그램 |
| 스킬 2 | `zzon-wiki` | → `/zzon-doc:zzon-wiki`. 프로젝트 문서 위키 (질문 기반 채움 + 다이어그램 임베드) |
| 스킬 3 | `zzon-seq` | → `/zzon-doc:zzon-seq`. 시퀀스 다이어그램 (액터 간 시간축 상호작용, `kind:"sequence"`) |

설치: `/plugin marketplace add <owner>/<repo>` → `/plugin install zzon-doc@zzon`
호출: `/zzon-doc:zzon-doc <대상>` / `/zzon-doc:zzon-wiki`. 자연어 요청으로도 자동 동작.

## 구조

```
plugins-zzon-doc/
├── .claude-plugin/marketplace.json     # name: zzon, plugins:[zzon-doc → ./zzon-doc]
├── README.md
└── zzon-doc/
    ├── .claude-plugin/plugin.json      # name: zzon-doc
    ├── README.md
    └── skills/zzon-doc/
        ├── SKILL.md                    # 코드분석 → 유형 판별 → DiagramSpec 저작 → render 실행
        ├── references/
        │   ├── document-types.md       # 유형 카탈로그 4계열(개요/구조·인프라/흐름/데이터) + 추상화 사다리 (리서치 40+ 근거)
        │   ├── diagram-spec.md         # DiagramSpec 스펙 + 레이아웃 가이드 + 자가질문 (저작 가이드)
        │   ├── sample-context.json     # 모범 답안 (C4 컨텍스트: nodeDescriptions+드릴다운 href)
        │   ├── sample-container.json   # 모범 답안 (C4 컨테이너: 경계 그룹+밖에 L1 이웃 — L1~L2 한 장)
        │   ├── sample-component.json   # 모범 답안 (C4 컴포넌트: 컨테이너 경계+이웃 — L2~L3 한 장)
        │   ├── sample-full-landscape.json # 모범 답안 (풀뎁스 원장 27노드: 경계·도메인 밴드·데이터·운영 띠+드릴다운)
        │   ├── sample-infra.json       # 모범 답안 (그룹+플로우)
        │   ├── sample-eks.json         # 모범 답안 (EKS 2레이어: cluster+파드 그룹+파드 내부, KEDA/Karpenter 주석 노드, Spot badge)
        │   ├── sample-msa-infra.json   # 모범 답안 (멀티 경계 MSA, 레인 밴드)
        │   ├── sample-platform-infra.json # 모범 답안 (대규모·균형 그리드 14노드)
        │   ├── sample-multiregion-ha.json # 모범 답안 (리전 미러 스탬프+badge+페일오버)
        │   ├── sample-event-flow.json  # 모범 답안 (이벤트드리븐 data-flow)
        │   ├── sample-data-pipeline.json # 모범 답안 (stage 밴드+횡단 거버넌스+데드레터)
        │   ├── sample-erd.json         # 모범 답안 (FK 앵커+카디널리티)
        │   ├── sample-erd-large.json   # 모범 답안 (다수 테이블·FK)
        │   └── sample-agent-topology.json # 모범 답안 (에이전트 토폴로지)
        └── scripts/
            ├── render.mjs              # DiagramSpec JSON → 단일 .html (엔진)
            ├── build-docs.mjs          # 여러 스펙 → 통합 문서 index.html (wiki.json 있으면 index 양보)
            └── layout-lint.mjs         # 스펙 저작 후 배치 검사 (그룹 겹침·비멤버 삼킴 검출, 렌더 전 실행)
    └── skills/zzon-wiki/
        ├── SKILL.md                    # 프로세스 강제: 스캔→티어 승인→섹션 루프(질문)→빌드, 재진입은 --status부터
        ├── references/
        │   ├── wiki-spec.md            # wiki.json 스키마 + md 규약(@diagram, ❓ 콜아웃) 정본
        │   ├── doc-catalog.md          # SI 12섹션 카탈로그 템플릿 (tier 태그·dynamic 규칙·질문 은행)
        │   ├── sample-wiki.json        # 모범 답안 + 검증 픽스처
        │   └── sample-docs/            # 모범 문서 md (다이어그램 임베드·콜아웃 예시)
        └── scripts/
            └── build-wiki.mjs          # wiki.json+docs/*.md → self-contained 위키 index.html (--status 지원)
    └── skills/zzon-seq/
        ├── SKILL.md                    # 판별(vs data-flow)→코드 추적→SeqSpec 저작→렌더/빌드→위키 임베드
        ├── references/
        │   ├── seq-spec.md             # SeqSpec 정본 (kind:"sequence", actors/steps/fragments, essential 규칙)
        │   ├── sample-seq-booking.json # 모범 답안 (결제 흐름: alt/else, reply 짝, async, 셀프, sourceRef)
        │   └── sample-seq-reminder.json# 모범 답안 (배치: loop/opt/par 중첩, scheduler 트리거)
        └── scripts/
            ├── render-seq.mjs          # SeqSpec 검증 + 템플릿 (seq-engine.js 인라인 주입)
            └── seq-engine.js           # 뷰어 엔진 (순수 JS 정본 — render.mjs와 같은 규칙: 수정 시 브라우저 재검증)
```

## 핵심 계약 (깨지 말 것)

1. **의존성 0.** `render.mjs`·`build-docs.mjs` 모두 Node 20+ 내장 모듈만 쓴다. 출력 .html(개별 ~60KB, 통합 index ~13KB)도 외부 `<script>`/`<link>`/CDN 없이 self-contained. 레포에 node_modules/lockfile 두지 마라.
2. **render.mjs는 이 프로젝트의 독자 엔진이다(info-hub와 무관).** 레인 레이아웃, 라운드 직교 엣지(관통 회피), 분산 앵커(fan-out/fan-in 겹침 방지), 그룹 언더레이, 플로우 순번/애니메이션, 팬·줌이 들어있다. **수정해도 되지만 반드시 브라우저 렌더로 재검증**한다(노드/엣지 수 일치, 선 겹침, pageerror 0). 원복은 git으로 가능.
3. **build-docs.mjs는 엔진을 건드리지 않는다.** render.mjs를 자식 프로세스로 호출해 개별 .html을 만든 뒤, 출력 폴더를 스캔해 통합 셸(`index.html`)만 생성한다. 통합 뷰는 각 다이어그램을 iframe으로 끼워 보여줄 뿐 — 다이어그램 자체는 독립 .html 그대로다.
4. **DiagramSpec 스키마가 계약.** 노드/그룹/엣지/플로우 평탄 배열 + slug id, 픽셀 좌표 없음(lane/order 힌트만). 통합 문서 메뉴용 선택 필드 `section`/`order`만 추가됨. 스펙 형태는 `references/diagram-spec.md` 참고.
5. **index.html 소유권**: 출력 폴더에 `wiki.json`이 있으면 index.html은 **build-wiki 소유** — build-docs는 다이어그램·manifest만 갱신하고 index를 건너뛴다(가드 내장). build-wiki는 build-docs를 자식 프로세스로 호출해 렌더를 위임한다.
6. **wiki.json이 위키의 단일 상태 소스.** 스키마는 `skills/zzon-wiki/references/wiki-spec.md`가 정본. todo 문서는 빈 md를 만들지 않는다. 상태를 md frontmatter에 이중화하지 않는다.
7. **시퀀스 엔진(zzon-seq)도 순수 JS가 정본이다 — 레포에 빌드 도구 0.** `skills/zzon-seq/scripts/seq-engine.js`는 render.mjs와 같은 규칙으로 직접 수정하고 반드시 브라우저 렌더로 재검증한다(샘플 2종 렌더, 겹침 없음·pageerror 0). SeqSpec 스키마 정본은 `skills/zzon-seq/references/seq-spec.md`. `kind:"sequence"` 스펙은 build-docs가 render-seq.mjs로 라우팅하며(형제 스킬 경로 참조), DiagramSpec과 스키마가 다르다(actors/steps — nodes/edges 아님). 뷰어는 zzon 셸 프로토콜(zzon:sidebar/zzon:sidebar-close, zzon-theme)을 구현한다. 최초 이식 출처는 ~/Documents/src/test_sequence_diagram(FlowScope TS를 1회 트랜스파일) — render.mjs의 info-hub 전례처럼 **이식 후 독립**, 다시 포팅하지 않는다.

## 최초 이식 출처 (역사적 참고 — 이제 독립)

> 엔진은 이제 이 프로젝트 독자 코드다. info-hub에 의존하지 않고, 거기서 다시 포팅하지도 않는다. 아래는 최초에 이식해 온 출처일 뿐(역사 기록).

`render.mjs`는 처음에 info-hub의 다이어그램 엔진을 바닐라 JS/CSS/SVG로 포팅한 것이다. 참고만:
- 레이아웃: `~/Documents/src/info-hub/packages/schema/src/layout.ts` (buildLayout/adjacency/flowHighlight)
- 엣지 기하: `~/Documents/src/info-hub/apps/web/src/components/diagram/geometry.ts`
- 스키마·토큰: `~/Documents/src/info-hub/packages/schema/src/{diagram,categories}.ts`
- 뷰 참고: `~/Documents/src/info-hub/apps/web/src/components/diagram/*.tsx`

## 현재 상태 (DONE)

- zzon-doc 스킬 + render.mjs 완성, 브라우저 렌더 검증 완료(노드/엣지 수 일치, 플로우 순번 배지, 다크모드, pageerror 0)
- `claude plugin validate` strict 통과(마켓플레이스+플러그인). SKILL.md frontmatter YAML 파싱 버그 수정(argument-hint 따옴표).
- 호출명 정정: 플러그인 스킬은 `플러그인명:스킬명` 네임스페이스 → **`/zzon-doc:zzon-doc`** (자연어로도 자동 동작).
- **build-docs.mjs(통합 문서) 추가** — 여러 스펙을 좌측 메뉴 + 전체보기 + iframe 뷰어의 self-contained index.html로 묶음. 데모 6종(`playground/zzon-doc/`)으로 빌드·검증 완료.
- 복잡 시나리오 모범답안 5종 추가(MSA 인프라 / 대규모 플랫폼 / 이벤트 data-flow / 대형 ERD / agent-topology).
- **레이아웃 설계 가이드** 추가(diagram-spec.md): 방향 선택, √N 그리드 균형, lane/order 분산, 그룹=세로 밴드(박스 겹침 방지), 엣지 비관통, 쪼개기 기준. MSA/플랫폼 예제는 이 가이드대로 lane 고정.
- **통합 문서 디자인 v2**: shadcn 풍(중립 팔레트·접이식 그룹·lucide 아이콘만·제목 아이콘 제거·무료 폰트·사이드바 접기·전체화면). 라이브러리 0 유지.
- **v0.3.0 — 유형 체계 + 엔진 고도화** (2026-07, 리서치 기반): C4/DFD/arc42 + AWS·Azure·GCP 레퍼런스 40+ 조사 → `document-types.md` 전면 개정(4계열 카탈로그 + 추상화 사다리 + 요소 수 예산). 엔진 신기능: **드릴다운**(`node.href` → 통합 문서에서 더블클릭 이동, postMessage), **nodeDescriptions**(C4 노드 내 설명), **그룹 kind 7종 추가**(region/az/account/security/onprem/stage/cluster — 논리=점선·물리=실선), **카테고리 10종 추가**(lb/dns/firewall/monitor/secret/ml/analytics/topic/pipeline/device), **ERD 카디널리티**(sourceCardinality/targetCardinality → 까마귀발 마커), **노드 badge**(AZ ×2 등 주석), **타이틀바**(제목+kind 배지), **범례에 그룹 kind**, `layout.align:"start"`(밴드형). 샘플 11종. 하위호환 유지(전부 선택 필드). 검증: 헤드리스 DOM 심 스모크(scratchpad, 11/11 예외 0) + **layout-lint.mjs**(엔진 배치 수식 재현 — 그룹 겹침·삼킴 검출, 11/11 통과) + strict validate 통과.
- **뎁스 3택 제안 규칙**(SKILL.md §1): 개괄 / 사다리 세트(드릴다운) / **풀뎁스 원장**(큰 그림 유지+전 레이어 한 장, 20~40노드, sample-full-landscape가 증명) — 사용자에게 반드시 뎁스를 묻고 그린다.
- **v0.4.0 — zzon-wiki 스킬 추가** (2026-07): 프로젝트 문서 위키. linkonn nav 모델을 일반화한 12섹션 카탈로그(티어 1/2/3 태그, dynamic 노드) + wiki.json 단일 상태 소스(문서 status·질문 대장 q-NNN·이력) + build-wiki.mjs(strict 검증→build-docs 자식 위임→미니 md 렌더러(raw HTML 금지·스킴 허용목록)→@diagram iframe 치환→위키 셸: 3단 nav·진행 현황·zzon:navigate 드릴다운 수신). `--status`가 해시 대조로 사람 수정·질문 마커 소멸을 감지(재진입 게이트). 검증: 검증기 적대 픽스처 7종·md 렌더러 적대 입력 9종·셸 헤드리스 스모크 17항목·재진입 왕복 — 전부 통과(스크립트는 scratchpad).
- **v0.5.0 — 우측 상세 사이드바 + C4 혼합 레벨 샘플** (2026-07-10):
  - **엔진 UI 개편**: 플로팅 패널 2종(노드 상세·플로우 단계) 제거 → **우측 상세 사이드바**(슬라이드 인) 공용화. 노드 클릭 = 설명+ERD 컬럼(FK 툴팁)+**연결 목록**(클릭 시 상대 노드로 이동)+드릴다운 링크. 플로우 = 단계 목록. 플로우 버튼 아래 **순번 스트립**(숫자 칩, 클릭=단계 강조, 배지·목록과 동기화). Escape로 닫기. 사이드바 열리면 툴바가 왼쪽으로 밀림.
  - **통합 문서 상호 배타**: iframe이 `zzon:sidebar` postMessage → 셸이 좌측 메뉴 자동 접힘, 좌측 메뉴를 다시 열면 셸이 `zzon:sidebar-close`를 보내 우측 사이드바 닫힘. 장 전환 시 좌측 메뉴 복원.
  - **zzon-wiki 셸도 동일 프로토콜 연동**(build-wiki.mjs): 임베드 다이어그램의 사이드바가 열리면 **해당 figure를 본문 폭(860px) 밖으로 확장**(`.dgm.expanded` — 94vw·높이 72vh) + 좌측 네비 자동 접힘(열린 사이드바 카운트 관리, 여러 임베드 대응). 네비 재오픈 시 모든 임베드 iframe에 닫기 브로드캐스트, 문서 전환 시 복원.
  - **위키 홈 = 문서 개요로 개편**: 홈이 진행 대시보드가 아니라 **섹션 소개(purpose)+문서 카드**(제목·summary·상태 배지, todo는 옅게, na 제외)를 보여준다. 진행 현황(통계·진행바·열린 질문·이력)은 별도 뷰 `#/_progress`로 이동 — 네비 상단에 "개요/진행 현황" 버튼 2개. 스키마 변경 없음.
  - **위키 네비 서브트리 접기**: 자식 있는 문서 노드는 접이식(`.nsub` + 셰브런 토글, 기본 접힘). 활성 문서의 조상은 자동 펼침(직접 URL·드릴다운 진입 대비). lv3 들여쓰기 CSS 추가(기존엔 3depth 스타일 부재). 데모: playground/wiki-demo를 **풀 SI 전체 메뉴**(12섹션·93문서, 3depth 예시 interface/api-spec/orders/{create,query} 포함)로 재구성 — 전체 카탈로그 열람용이며 실사용은 인터뷰 선별(interview.decisions에 기록).
  - **섹션 code 연속 재부여 규칙**: 섹션은 원래 인터뷰에서 필요한 것만 선별되는데, code가 카탈로그 번호를 그대로 써서 구멍(00,05,06…)이 남았었다 → **포함된 섹션 기준 00부터 연속 부여**로 확정(doc-catalog.md 인스턴스화 절차 6, wiki-spec.md 갱신). build-wiki가 비연속 code에 ⚠ 경고. 섹션 추가 시 카탈로그 순서 자리에 끼우고 전체 재부여(참조는 path 기준이라 안전). sample-wiki.json 재번호 완료.
  - **샘플 12종**: sample-container(C4 L2, **경계 그룹+밖에 L1 이웃 = L1~L2 한 장**)·sample-component(C4 L3, 경계+이웃 = L2~L3 한 장) 추가 — "한 장=한 레이어"로만 그리던 문제의 저작 측 해결. sample-context 드릴다운을 sample-container로 연결. document-types.md(컨테이너 행 개정+컴포넌트 행 추가)·diagram-spec.md·SKILL.md 갱신.
  - **단계 포커스**: 순번(칩·배지·목록)을 고르면 그 단계의 엣지(+배지)만 선명하게 남고 나머지 플로우 엣지는 0.15로 가라앉음. 활성 단계 양끝 노드만 온전, 다른 플로우 노드는 soft-dim. 재클릭으로 해제.
  - **EKS 유형 추가**: sample-eks(2레이어 — cluster 그룹 안 파드 그룹 미러 스탬프 + 파드 내부 컴포넌트, KEDA/Karpenter는 엣지 없는 주석 노드, Spot/GPU는 badge). document-types.md에 "쿠버네티스(EKS) 워크로드" 행(1레이어 클러스터 뷰 vs 2레이어 한 장 선택 규칙) 추가. 샘플 총 13종.
  - 검증: 헤드리스 DOM 심 스모크 32항목(scratchpad, 부팅·사이드바·스트립·단계 포커스·메시지 왕복·ERD 컬럼) 통과 + layout-lint + `claude plugin validate` (마켓플레이스·플러그인) 통과.
  - **playground/examples/**: 가상 서비스 "피크닉" 예제 세트 10종(context/container/component/landscape/infra/eks/eks-workloads/flow-booking/event-fanout/erd, 서로 href 드릴다운 연결) — gitignore된 데모. 기존 playground 데모는 삭제됨.
- **v0.6.0 — 엔진 P1: 엣지 겹침·라벨 개선** (2026-07-10):
  - **주행선 분리**: 2칸+ 엣지의 가로/세로 주행선(runY/runX)에 거터 오프셋 적용(clearBand 스냅 **후** 가산 → 같은 밴드에 스냅돼도 분리) — 장거리 엣지 선 포개짐 해소.
  - **거터 슬롯 정렬 배정**: 스펙 순서가 아니라 양끝 교차축 중점 순으로 오프셋 배정 + 엣지 많으면 스텝 자동 축소(거터 폭 GUTTER_HALF×2 초과 방지) — 불필요한 교차 감소.
  - **라벨 디컨플릭트**: 표시될 라벨의 예상 박스(한글 10px/자 추정)끼리 겹침 검사 → 세로 밀어내기 3패스.
  - **라벨 항상 표시 토글**(툴바 Tag 버튼): 줌<0.55에서 라벨 전멸하던 하드코딩을 우회 — "전체를 보면 글씨가 없는" 문제 해소.
  - 검증: DOM 심 스모크 39항목(라벨 y 전부 상이·토글 왕복 포함) 통과.
- **v0.7.0 — zzon-seq 스킬 추가 (시퀀스 다이어그램)** (2026-07-21):
  - **세 번째 스킬 zzon-seq**: 액터 간 시간축 상호작용을 `kind:"sequence"` SeqSpec(actors/steps/fragments)으로 저작 → render-seq.mjs가 의존성 0 단일 .html 렌더. 뷰어(FlowScope 이식): 행 단위 겹침 방지 레이아웃, 액터 아이콘 19종·카테고리 5색(CVD 검증 팔레트), 활성 바(sync 열고 reply 닫음, 미응답은 짧은 펄스), alt/opt/loop/par 중첩 프래그먼트, **전체/간소화 토글**(essential 마킹), 단계 상세 패널(sourceRef), 액터 하이라이트, 둘러보기(단계 재생), **SVG/PNG 다운로드**, zzon-theme 공유.
  - **build-docs 확장(3곳)**: kind:"sequence" → render-seq 라우팅(형제 스킬 경로), KIND_ORDER에 sequence(3번째), 인덱스 KINDS 맵·통계에 시퀀스 배지(액터/메시지 counts). build-wiki는 무수정으로 @diagram 임베드 동작.
  - **라우팅 명문화**: zzon-doc SKILL.md kind 표 + document-types.md C계열 + zzon-wiki(doc-catalog usecase/event-flow)에 위임 기준 — "구조를 지나가는가→data-flow, 순서대로 주고받는가→시퀀스, 병행은 보완".
  - **엔진은 순수 JS로 이식**: FlowScope(TS)를 1회 트랜스파일해 seq-engine.js(1,553줄, 63KB)로 확정 — 레포에 빌드 도구 없이 기존 엔진들과 동일하게 직접 수정한다. 핵심 계약 7 참조.
  - 검증: playground/examples에 시퀀스 2장 혼합 빌드(12장) → 단독 열기·통합 index 배지/카드·iframe 임베드·postMessage 왕복(패널 열림→좌메뉴 접힘, 재오픈→패널 닫힘)·다크 전환 스크린샷 확인, pageerror 0.
- 남은 엔진 백로그는 P2~P3(같은 레인 좌측 C자 우회·접근 세그먼트 회피·lint 엣지/라벨 검사·그룹 접기·시맨틱 줌) — 메모리 `zzon-engine-priorities` 참조.
- 소유자 표준은 **메모리**에 기록됨(무의존/문서 디자인/레이아웃 품질) — 로컬, 레포 밖.
- git: 첫 커밋(main) 존재. **GitHub push는 소유자가 직접 함.** 이후 변경분(통합 문서 등)은 아직 커밋 안 됨 — 소유자 검토 후 커밋.

## 다음 작업 (TODO)

1. (선택) info-hub 연동 출력 옵션 — render 대신 실행 중인 info-hub API로 적재하는 모드.
2. (선택) zzon-wiki 승격 자동화 고도화 — manifest의 기존 다이어그램을 위키 문서로 편입하는 대화 절차는 스킬 지침에 있음. 대량 편입 헬퍼 스크립트는 필요해지면.

## 테스트 방법

```bash
# 단일 렌더
node zzon-doc/skills/zzon-doc/scripts/render.mjs zzon-doc/skills/zzon-doc/references/sample-infra.json -o /tmp/x.html

# 통합 문서 (플러그인 오염 없이 playground에서 — playground/는 .gitignore됨)
mkdir -p playground/zzon-doc/specs && cp zzon-doc/skills/zzon-doc/references/sample-*.json playground/zzon-doc/specs/
node zzon-doc/skills/zzon-doc/scripts/build-docs.mjs playground/zzon-doc --title "데모 문서"
open -a "Google Chrome" playground/zzon-doc/index.html

# manifest 검증
node -e 'const m=require("./playground/zzon-doc/manifest.json");console.log(m.diagrams.length+"개")'

# 시퀀스 단일 렌더
node zzon-doc/skills/zzon-seq/scripts/render-seq.mjs zzon-doc/skills/zzon-seq/references/sample-seq-booking.json -o /tmp/seq.html

# 위키 (플러그인 오염 없이 playground에서)
mkdir -p playground/wiki-demo/specs
cp zzon-doc/skills/zzon-doc/references/sample-context.json playground/wiki-demo/specs/context.json
cp zzon-doc/skills/zzon-doc/references/sample-full-landscape.json playground/wiki-demo/specs/full-landscape.json
cp zzon-doc/skills/zzon-doc/references/sample-erd.json playground/wiki-demo/specs/erd.json
cp zzon-doc/skills/zzon-wiki/references/sample-wiki.json playground/wiki-demo/wiki.json
cp -R zzon-doc/skills/zzon-wiki/references/sample-docs playground/wiki-demo/docs
node zzon-doc/skills/zzon-wiki/scripts/build-wiki.mjs playground/wiki-demo
node zzon-doc/skills/zzon-wiki/scripts/build-wiki.mjs playground/wiki-demo --status
open -a "Google Chrome" playground/wiki-demo/index.html

# 브라우저 자동화(claude-in-chrome)는 로컬 루프백 접속이 막혀 스크린샷 불가 → open 으로 실제 Chrome에서 확인.
```

## 규칙

- 문서·UI 텍스트 한국어(한다체), 코드 식별자 영어
- 스킬/플러그인 이름은 `zzon-*` 네임스페이스 유지
