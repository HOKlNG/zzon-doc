# 에이전트 토폴로지 (`docKind: "agent-topology"`)

**질문**: Claude 에이전트·스킬·훅이 어떻게 구성되고 서로 부르나.
**등급**: T1(구성 요소 9개 이하). 넘으면 T2.
**신호**: `.claude/{agents,skills,hooks}`(scan의 에이전트 수).

## 문법

- 코디네이터(메인 에이전트)는 왼쪽(`layer: 0`)에 둔다. 서브에이전트는 `layer: 1`, 스킬·도구는 `layer: 2`.
- 카테고리: `agent`(에이전트), `skill`(스킬), `hook`(훅), `doc`(지침 문서·CLAUDE.md).
- 엣지는 호출(위임) 관계만 그린다. 라벨은 "위임", "호출", "트리거" 정도로 쓴다.
- 훅은 트리거 이벤트를 `sublabel`에 적는다(예: "PreToolUse").
- 에이전트 정의 파일의 `description`을 노드 `description`으로 옮긴다(사이드바).

## 템플릿

```ts
export default diagram("agents", { title: "에이전트 구성", view: "agent-topology", tier: "overview", docKind: "agent-topology", direction: "RIGHT" }, (d) => {
  const main = d.node("main", { category: "agent", label: "메인 세션", hints: { layer: 0 } });
  const rev = d.node("reviewer", { category: "agent", label: "code-reviewer", description: "바뀐 코드를 읽고 버그와 개선점을 짚습니다.", hints: { layer: 1 } });
  const lint = d.node("lint", { category: "hook", label: "lint 훅", sublabel: "PostToolUse", hints: { layer: 1, order: 1 } });
  d.edge(main, rev, { label: "위임", layer: "agent" });
  d.edge(main, lint, { label: "트리거", layer: "hook", style: { preset: "dashed" } });
});
```
