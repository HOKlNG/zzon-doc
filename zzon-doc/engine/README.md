# infra-architect

AWS 아키텍처 다이어그램을 **TypeScript 코드로 선언**하고, 자동 레이아웃을 거쳐
**셀프컨테인드 HTML** 한 파일로 렌더링하는 도구. draw.io/PPT 대신 다이어그램을
git으로 버전 관리하기 위해 만들었다. 설계 전문은 [DESIGN.md](DESIGN.md).

```bash
bun install

bun ia render examples/eks-cluster.ts        # -> out/eks-cluster.html (+ .svg, .scene.json)
bun ia watch  examples/eks-cluster.ts        # http://localhost:4499 + 자동 리로드
bun ia export examples/eks-cluster.ts --png  # -> out/eks-cluster.png
bun test
```

## 특징

- **중첩 컨테이너**: Account ▸ Region ▸ VPC ▸ Subnet — 공식 AWS 보더 규격
- **AZ × 티어 격자**: VPC를 AZ(열)×서브넷 티어(행) 매트릭스로 배치 (범용 레이아웃 엔진이 못 하는 패턴)
- **스팬 overlay**: Karpenter NodePool / EKS MNG처럼 격자를 가로지르는 점선 그룹 —
  같은 셀 안에 여러 overlay가 섞여 있어도 멤버를 밴드로 군집화해 해석
- **전역 직교 라우팅**: 배치 완료 후 전체 장애물을 인지하는 단일 패스(libavoid),
  TGW 팬인 같은 다중 엣지는 정션 번들링
- **공식 AWS 아이콘** 838종 내장 (Asset Package 04302026 정규화 커밋) + CNCF 아이콘
- **결정론**: 같은 입력 → 같은 출력. 정규 씬 JSON을 스냅샷/리뷰 아티팩트로 커밋
- 출력 HTML: 팬/줌, hover 하이라이트, 레이어 토글, 메타 툴팁, 다크 테마 — 외부 요청 0

## DSL 맛보기

```ts
import { diagram } from "../src/dsl";

export default diagram("my-arch", (d) => {
  const users = d.actor("users", { icon: "users", side: "left" });
  const region = d.group("cloud", { kind: "aws-cloud" }).group("region", { kind: "region", label: "ap-northeast-2" });

  const vpc = region.grid("vpc", {
    kind: "vpc",
    columns: [{ id: "az-a", label: "AZ A" }, { id: "az-b", label: "AZ B" }],
    rows: ["public", "private"],
  });
  vpc.cell("az-a", "public", { kind: "public-subnet" }).node("natgw", { icon: "natgw", label: "NAT GW" });
  const web = vpc.cell("az-a", "private", { kind: "private-subnet" }).node("web", { icon: "ec2", label: "Web" });

  d.edge(users, web, { label: "HTTPS", layer: "network" });
  d.step(1, { at: users });
});
```

빌더가 반환하는 ref로 참조하거나, `"vpc/az-a/private/web"`처럼 유일 접미사 경로
문자열로 참조한다. 검증 에러는 항상 `diagram.ts:줄번호`를 가리킨다.

## 저장소 규칙

- `out/` 산출물도 커밋한다 (PR에서 결과 확인). diff 리뷰는 `*.scene.json` 기준 —
  HTML/SVG는 `.gitattributes`로 diff 억제
- 아이콘 원본 zip은 커밋하지 않는다. 업그레이드는 `scripts/build-icons.ts` (유지보수자용)
- 폰트는 Pretendard(OFL) vendored — 측정과 렌더링에 같은 폰트 사용
