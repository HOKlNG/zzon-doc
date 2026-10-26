## 개요

이 문서는 저장소를 처음 클론한 뒤 로컬에서 데모숍을 띄우는 방법을 안내합니다. 목표는 클론부터 실행까지 5분 안에 끝내는 것입니다.

## 필요 도구

- Node.js 20 이상 (정확한 버전은 `.nvmrc`)
- pnpm 9
- Docker (로컬 DB와 캐시용)

## 실행 순서

아래 순서로 실행하면 로컬 주소 3000번 포트에서 앱이 뜹니다. 로컬 기본값을 담은 환경 파일을 복사하고, Docker로 PostgreSQL과 Redis를 띄운 뒤 앱을 실행합니다.

```bash
git clone <repo> && cd demoshop
cp .env.example .env        # 로컬 기본값으로 동작한다
docker compose up -d        # PostgreSQL과 Redis를 띄운다
pnpm install
pnpm dev                    # http://localhost:3000
```

결제 키가 없어도 앱은 뜹니다. 이때 결제 과정만 가짜 응답으로 대신합니다.

## 자주 걸리는 문제

다른 프로그램이 5432 포트를 이미 쓰고 있으면 DB 컨테이너가 뜨지 않습니다. `docker compose down`을 실행한 뒤 다시 시도합니다.

앱이 스키마 오류로 멈추면 마이그레이션이 적용되지 않은 상태입니다. `pnpm db:migrate`를 먼저 실행합니다.

## 설정 참고

| 변수 | 용도 | 기본값 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 접속 | compose의 로컬 값 |
| `REDIS_URL` | 세션 캐시 | compose의 로컬 값 |
| `TOSS_SECRET_KEY` | 결제 연동 | 없음, 테스트 키 발급 필요 |
