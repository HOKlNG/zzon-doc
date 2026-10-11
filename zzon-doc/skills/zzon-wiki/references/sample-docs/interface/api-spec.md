## 공통 규약

- 모든 API는 `/api/v1` 아래에 있다.
- 인증은 Cognito가 발급한 토큰을 `Authorization: Bearer <token>` 헤더에 담아 보낸다.
- 에러는 `{ "error": { "code": "ORDER_NOT_FOUND", "message": "..." } }` 형태로 돌려준다.
- 목록은 커서 방식으로 나눠 받는다. 예를 들어 `?cursor=…&limit=20`처럼 요청한다.

## 도메인별 명세

도메인별 상세는 하위 문서에서 다룬다. 코드에서 확인한 도메인은 주문(Orders)과 상품(Catalog)이다.

| 도메인 | 경로 | 상태 |
|---|---|---|
| Orders | `/api/v1/orders` | 하위 문서 작성 예정 |
| Catalog | `/api/v1/products` | 하위 문서 작성 예정 |
