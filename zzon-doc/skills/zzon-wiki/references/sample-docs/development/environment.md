## 퀵스타트

처음 클론했을 때 5분 안에 로컬에서 돌리는 것이 목표다.

```bash
git clone <repo> && cd demoshop
cp .env.example .env        # 로컬 기본값으로 동작
docker compose up -d        # PostgreSQL + Redis
pnpm install
pnpm dev                    # http://localhost:3000
```

## 필요 도구

- Node.js 20+ (`.nvmrc` 참조)
- pnpm 9
- Docker (로컬 DB·캐시용)

## 환경 변수

| 변수 | 용도 | 기본값 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 접속 | compose 로컬 값 |
| `REDIS_URL` | 세션 캐시 | compose 로컬 값 |
| `TOSS_SECRET_KEY` | 결제 연동 | 없음 — 테스트 키 발급 필요 |

결제 연동 없이도 앱은 뜬다 — 결제 플로우만 mock으로 대체된다.

## 자주 걸리는 것

- 포트 5432가 이미 점유돼 있으면 `docker compose down` 후 재시도한다.
- `pnpm dev`가 스키마 오류로 죽으면 `pnpm db:migrate`를 먼저 실행한다.
