## 퀵스타트

처음 클론한 뒤 5분 안에 로컬에서 띄우는 것이 목표다.

```bash
git clone <repo> && cd demoshop
cp .env.example .env        # 로컬 기본값으로 동작한다
docker compose up -d        # PostgreSQL과 Redis를 띄운다
pnpm install
pnpm dev                    # http://localhost:3000
```

## 필요 도구

- Node.js 20 이상 (버전은 `.nvmrc`에 적혀 있다)
- pnpm 9
- Docker (로컬 DB와 캐시용)

## 환경 변수

| 변수 | 용도 | 기본값 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 접속 | compose의 로컬 값 |
| `REDIS_URL` | 세션 캐시 | compose의 로컬 값 |
| `TOSS_SECRET_KEY` | 결제 연동 | 없음. 테스트 키를 발급받아야 한다 |

결제 키가 없어도 앱은 뜬다. 이때 결제 과정만 가짜 응답으로 대신한다.

## 자주 걸리는 것

- 5432 포트를 이미 다른 프로그램이 쓰고 있으면 `docker compose down`을 한 뒤 다시 시도한다.
- `pnpm dev`가 스키마 오류로 멈추면 `pnpm db:migrate`를 먼저 실행한다.
