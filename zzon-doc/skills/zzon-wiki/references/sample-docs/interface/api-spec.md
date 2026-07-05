## 공통 규약

- Base URL: `/api/v1`
- 인증: `Authorization: Bearer <token>` (Cognito 발급)
- 에러 포맷: `{ "error": { "code": "ORDER_NOT_FOUND", "message": "..." } }`
- 페이징: cursor 기반 (`?cursor=…&limit=20`)

## 도메인별 명세

도메인별 상세는 하위 문서에서 다룬다. 코드 스캔으로 확인된 도메인: **Orders, Catalog**.

| 도메인 | 프리픽스 | 상태 |
|---|---|---|
| Orders | `/api/v1/orders` | 하위 문서 작성 예정 |
| Catalog | `/api/v1/products` | 하위 문서 작성 예정 |
