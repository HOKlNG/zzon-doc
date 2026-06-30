# 문서 유형 판별 (그리기 전에 먼저 정한다)

> `kind`(infra/data-flow/erd/agent-topology)는 **렌더 종류**일 뿐이다.
> 그 전에 **"이건 무슨 아키텍처 문서인가"**를 코드/요청을 보고 판별해야 한다. 유형이 방향·중첩·배치를 결정한다.
> 큰 요청은 한 유형이 아니다 — 여러 유형을 섞어 **문서 세트**로 낸다(아래 "조합").

## 판별 순서

1. **요청이 특정 유형을 지정했나?** "인프라/ERD/결제 흐름/C4 컨테이너" → 그 유형으로 바로.
2. **아니면 코드에서 단서를 읽어 유형을 고른다** — 아래 표의 *단서* 열. 추측 금지, 읽은 것만.
3. **규모가 크면 유형을 여러 개 잡는다** — 예: 인프라 1 + 기능 흐름 N + ERD 1. (SKILL.md §1 범위 잡기와 함께.)
4. 고른 유형마다 *방향·배치*를 그대로 따른다. 막히면 `diagram-spec.md`의 자가질문으로 점검.

## 유형 카탈로그

| 유형 | 언제 | 코드 단서 | 방향·배치 | kind | 모범 샘플 |
|---|---|---|---|---|---|
| **클라우드 인프라** | VPC·서브넷·AZ·매니지드 서비스 토폴로지 | `*.tf`/CDK, `docker-compose`, AZ/리전 명, LB/RDS/S3 | 중첩 그룹(Region>VPC>AZ>Subnet). 진입(LB/GW) 한쪽, AZ는 `order`로 나란히, 복제는 같은 레인 | infra | sample-infra · sample-platform-infra |
| **멀티 AZ / 멀티리전 HA** | 가용성·이중화 (active/standby, 복제) | 다중 AZ/리전 선언, 피어링, 복제 설정 | **공통 진입(DNS/LB) 위 가운데 → 리전/AZ로 부채꼴(DOWN)**, 리전 간은 가로 엣지 | infra | (멀티리전: 진입 위, 리전 좌우) |
| **마이크로서비스 / 바운디드 컨텍스트** | 서비스/도메인 다수 + 각자 DB | 서비스 디렉터리, 도메인 모듈, 서비스별 스키마 | **공통(Gateway·인증) 상단 띠** + 도메인 행(각 도메인 service→db 세로 스택) | infra | sample-msa-infra |
| **계층/티어** | presentation/business/data 3계층 | MVC 레이어, 패키지 계층 | 계층을 레인 밴드로, 한 계층 다수는 `order`로 펼침 | infra | sample-infra |
| **C4 L1 시스템 컨텍스트** | 시스템 1개 + 외부 액터/시스템 | 외부 API, 결제사, 메일, OAuth | 중앙 시스템 + 외부를 둘레로(좌=액터, 우=외부 시스템) | infra | — |
| **C4 L2 컨테이너** | 배포 단위(웹·워커·DB·큐) | 프로세스/컨테이너, 런타임 | 컨테이너를 레인으로, 데이터스토어는 우측 fan-in | infra | sample-platform-infra |
| **C4 L3 컴포넌트** | 한 컨테이너 내부 클래스/모듈 | 컨트롤러·서비스·리포지토리 | 한 그룹(컨테이너) 안에서 호출 흐름, fan-out은 `order`로 펼침 | infra/data-flow | — |
| **데이터 흐름 / 프로세스** | 요청~응답 단계, 비동기 파이프라인 | 라우트→핸들러→큐→워커, 이벤트 체인 | 순차는 `RIGHT`(6칸 넘으면 병렬 펼치거나 접기), `flows`로 단계 표시 | data-flow | sample-event-flow |
| **이벤트 드리븐 pub/sub** | 토픽/큐 + 다수 구독자 | SNS/SQS/Kafka, 이벤트 핸들러 다수 | **발행 위/왼쪽 → 구독자 여러 개를 `order`로 펼침(부채꼴)**. 단일 노드로 뭉치지 마라 | data-flow | sample-event-flow |
| **CI/CD 파이프라인** | 빌드→테스트→배포 단계 | `.github/workflows`, `Jenkinsfile`, `*.gitlab-ci` | 순차 `RIGHT`, 환경 분기(dev/stg/prd)는 `order`로 | data-flow | — |
| **네트워크 구성** | 서브넷·라우팅·보안그룹 | VPC/Subnet/SG, NAT/IGW | VPC 중첩 + Public/Private/Data 서브넷 밴드 | infra | sample-infra |
| **보안 트러스트 존** | 신뢰 경계(인터넷/DMZ/내부/데이터) | 인증·암호화·시크릿·WAF | 존을 레인 밴드로(Untrusted→DMZ→Trusted→Secure) | infra | — |
| **ERD** | DB 스키마·테이블 관계 | `schema.prisma`, `*.sql`, ORM 모델 | 테이블 노드(모두 `table`), FK 컬럼 앵커. 많으면 도메인별 분할 | erd | sample-erd · sample-erd-large |
| **에이전트 토폴로지** | `.claude` 구성 | `.claude/{agents,skills,hooks}` | agent/skill/hook 카테고리, 호출 관계 | agent-topology | sample-agent-topology |

## 조합 (큰 프로젝트)

한 장으로 끝내지 마라. 규모가 크면 유형을 섞는다:

- **전형적 세트**: ① 클라우드 인프라 1장 + ② 실제 기능별 데이터 흐름 N장 + ③ ERD 1장 (+ 해당 시 C4 L2, CI/CD, 에이전트).
- **C4 확장**: L1 컨텍스트 → L2 컨테이너 → (핵심 컨테이너) L3 컴포넌트로 깊이를 더한다.
- 세트는 `section` 필드로 메뉴를 나눠 `build-docs.mjs`로 묶는다.

> 유형을 골랐으면 **`diagram-spec.md`의 "레이아웃 설계 가이드 + 자가질문"**으로 배치를 점검하고 그린다.
