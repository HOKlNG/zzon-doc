# 기능 흐름 · 이벤트 · CI/CD · 데이터 파이프라인 · 리니지 (`docKind: "data-flow"`)

**질문**: 이 기능(데이터)이 **어떤 구조를 지나가는가**.
**등급**: T2.
**방향**: 거의 항상 `direction: "RIGHT"`다. 엔진은 너무 길면 Z자 글줄로 감는다.

> **시퀀스와 구분한다.** "누가 누구에게 **어떤 순서로 주고받는가**"(요청/응답 짝, alt/loop/재시도, 활성 구간)가
> 주인공이면 `../../../zzon-seq/SKILL.md`로 간다. 이 뷰는 **정적 구조 위의 순번 배지**다.
> 둘 다 해당하면 둘 다 그린다. 중복이 아니라 보완이다.
> 객관 기준(rubric §2.2): 추적 경로에 의미 있는 왕복이 2개 이상이거나 분기가 1개 이상이면 시퀀스 후보다.

## 하위 유형별 문법

| 하위 유형 | 구조 |
|---|---|
| 기능 시나리오 (C4 동적) | 진입 → 처리 → 저장. 정적 구조 + `d.flow()` 순번. 시나리오가 여럿이면 flow를 나누거나 장을 쪼갠다 |
| 이벤트 pub/sub | 프로듀서(layer 0) → 브로커(`category: "topic"`, layer 1) → 구독자들(layer 2, order로 펼침). 사가 코레오그래피는 순번이 필수다 |
| CI/CD | 소스 → 빌드 → 테스트 → 배포(dev/stg/prd는 같은 layer의 order). 배포 대상 인프라는 별도 장으로 |
| 데이터 파이프라인 | 단계 그룹 열: 수집(0) → 처리(1) → 적재(2) → 서빙(3). 단계는 `d.group(kind:"generic")`로 둔다. 메달리온(Bronze→Silver→Gold)은 적재 그룹 안 order. 오케스트레이터·거버넌스는 `d.band("bottom")`. 데드레터는 본선 아래 order |
| 리니지·DAG | 좌→우 DAG(dbt 모델·뷰 체인). 타입은 카테고리 색으로 구분 |

## 플로우 (이 뷰의 핵심)

```ts
const submit = d.edge(client, api, { label: "주문 제출", layer: "sync" });
const publish = d.edge(api, queue, { label: "이벤트 발행", layer: "async", style: { preset: "dashed" } });
d.flow("order", {
  title: "주문 접수",
  description: "주문을 제출해 저장되기까지의 정상 경로",
  steps: [
    { edge: submit, text: "클라이언트가 주문을 제출한다" },
    { edge: publish, text: "API가 주문 이벤트를 발행한다" },
  ],
});
```

- `docKind: "data-flow"` 장에 flow가 없으면 미완성이다.
- 비동기 엣지는 `style: { preset: "dashed" }`, 읽기는 `"dotted"`로 그린다.
- 단계 텍스트는 한 문장으로 쓴다. 사이드바·순번 스트립에 나온다.

## 점검

- [ ] flow가 1개 이상이고, 각 단계의 엣지가 실제 코드 호출과 일치한다(`sources`에 해당 파일을 넣었다).
- [ ] 흐름 방향 일관성 ≥ 0.8(게이트 경고 기준). 아니면 `hints.layer`로 단계 열을 지정한다.
- [ ] 왕복·분기가 본질인 경로는 시퀀스 장을 따로 제안했다.
