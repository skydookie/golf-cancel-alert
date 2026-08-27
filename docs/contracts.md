# contracts.md — 외부 인터페이스 계약

이 프로젝트의 유일한 소비자는 자체 프론트엔드(PWA 화면)와 GitHub Actions 스케줄러다. 외부
제3자에게 공개된 API는 없다.

## 인증 방식

- 화면/사용자 API(`/api/conditions`, `/api/credentials`, `/api/push/subscribe`,
  `/api/schedule`, `/api/auth/*`): `session` HttpOnly 쿠키(로그인/가입 시 서버가 발급). 브라우저가
  자동으로 동봉하므로 클라이언트 코드가 직접 다루지 않는다.
- 스케줄러 API(`/api/cron/scan`): `Authorization: Bearer <CRON_SECRET>` 헤더.

## 공통 규약

- 모든 요청/응답 바디는 JSON(`content-type: application/json`).
- 실패 응답은 항상 `{ "error": "<사람이 읽을 수 있는 한국어 메시지>" }` 형태 + 적절한 4xx/5xx
  상태 코드. 성공 응답에 `error` 필드는 없다.
- 리소스 소유권이 없는 대상에 대한 요청은 403이 아니라 **404**로 응답한다(존재 자체를 숨김).

## 인터페이스 카탈로그

### `POST /api/auth/signup`
- 입력: `{ email: string, password: string(8자+), inviteCode: string }`
- 출력(201): `{ id, email }` + `session` 쿠키 설정
- 오류: 400(형식 오류) · 403(초대코드 불일치) · 409(이메일 중복)

### `POST /api/auth/login`
- 입력: `{ email: string, password: string }`
- 출력(200): `{ id, email }` + `session` 쿠키 설정
- 오류: 400(형식 오류) · 401(이메일 또는 비밀번호 불일치 — 구분 없음)

### `POST /api/auth/logout`
- 입력: 없음
- 출력(200): `{ ok: true }` + `session` 쿠키 제거

### `GET /api/auth/me`
- 출력(200): `{ id, email }` · 오류: 401(비로그인)

### `DELETE /api/auth/delete-account`
- 입력: 없음(세션으로 본인 식별)
- 출력(200): `{ ok: true }` — 본인의 모든 데이터가 연쇄 삭제됨 + 세션 쿠키 제거
- 오류: 401(비로그인)

### `GET /api/conditions` / `POST /api/conditions`
- GET 출력(200): 본인 WatchCondition 배열(`id, dates, timeStart, timeEnd, createdAt`)
- POST 입력: `{ dates: string[](YYYY-MM-DD, 1개 이상), timeStart: "HH:mm", timeEnd: "HH:mm"(timeStart보다 뒤) }`
- POST 출력(201): 생성된 WatchCondition
- 오류: 400(형식/시간 순서 오류) · 401(비로그인)

### `DELETE /api/conditions/{id}`
- 출력(200): `{ ok: true }` · 오류: 401(비로그인) · 404(본인 소유 아님/존재하지 않음)

### `GET /api/credentials` / `POST /api/credentials`
- GET 출력(200): 본인 FacilityCredential 배열(`id, facilityId, status, lastError, createdAt, updatedAt` — 자격증명 값 자체는 절대 포함 안 됨)
- POST 입력: `{ facilityId: string(등록된 Facility만), loginId: string, password: string }`
- POST 출력(201): 생성된 레코드(공개 형태)
- 오류: 400(형식/미등록 Facility) · 401(비로그인) · 409(같은 (User,Facility) 이미 존재)

### `PATCH /api/credentials/{id}`
- 입력: `{ loginId?: string, password?: string }`(둘 중 최소 하나) — 성공 시 상태가 `ACTIVE`로
  복귀하고 `lastError`가 지워짐
- 출력(200): 갱신된 레코드 · 오류: 400 · 401 · 404(본인 소유 아님)

### `DELETE /api/credentials/{id}`
- 출력(200): `{ ok: true }` · 오류: 401 · 404

### `POST /api/push/subscribe` / `DELETE /api/push/subscribe`
- POST 입력: `{ endpoint: string(url), keys: { p256dh: string, auth: string } }` — 브라우저의
  `PushSubscription.toJSON()` 형태 그대로
- POST 출력(201): `{ ok: true }`(같은 endpoint면 upsert)
- DELETE 입력: `{ endpoint: string(url) }` · 출력(200): `{ ok: true }`(본인 소유가 아니면
  조용히 무시 — 에러 아님)
- 오류: 400 · 401

### `GET /api/schedule`
- 출력(200): `{ matchedSlots: [{ facilityId, facilityName, date, course, time, price, deepLinkUrl }], recentNotifications: [{ id, facilityName, date, course, time, price, deepLinkUrl, createdAt }](최근 20건) }`
- 오류: 401

### `POST /api/cron/scan`
- 인증: `Authorization: Bearer <CRON_SECRET>` (불일치 시 401, `runScanCycle()` 미실행)
- 출력(200): `{ credentialsScanned, credentialsSkippedNoConditions, loginFailures, transientFailures, notificationsSent }`
- 오류: 401(토큰 불일치) · 500(`CRON_SECRET` 환경변수 자체가 없음)

## 웹푸시 페이로드 (서버 → 서비스워커)

`sendPushToUser`가 보내는 JSON 페이로드: `{ title: string, body: string, url: string }`.
서비스워커(`public/sw.js`)는 이 셋을 그대로 알림의 제목/본문/클릭 시 이동 경로로 쓴다 — 다른
키를 추가해도 서비스워커는 무시한다.
