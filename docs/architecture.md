# architecture.md — 시스템 구성

## 컴포넌트 토폴로지

```
브라우저(PWA)
  ├─ 화면(App Router 페이지) ── fetch ──▶ Next.js Route Handler(/api/**)
  └─ 서비스워커(public/sw.js) ◀── 웹푸시 ── web-push(서버) ── PushSubscription 테이블

GitHub Actions(scheduled workflow, 5분 간격)
  └─ POST /api/cron/scan (Bearer CRON_SECRET) ──▶ runScanCycle()

runScanCycle() (src/lib/scanCycle.ts)
  ├─ FacilityCredential(ACTIVE) 조회 ──▶ PostgreSQL(Prisma)
  ├─ 자격증명 복호화(src/lib/crypto.ts)
  ├─ getAdapter(facilityId) ──▶ SiteAdapter 구현체(src/lib/adapters/*)
  │     └─ SiteAdapter.login/scanBookableDates/scanDaySlots ──▶ 라비에벨 사이트(HTTP)
  ├─ diffSlots()/matchesCondition()(src/lib/matching.ts) — 순수 함수, DB/네트워크 의존 없음
  ├─ SlotObservationState upsert, NotificationLog 생성 ──▶ PostgreSQL
  └─ sendSlotPushToUser/sendLoginFailureNotice(src/lib/push.ts) ──▶ web-push ──▶ 브라우저
```

## 대표 흐름: 취소표 발견부터 알림까지

1. GitHub Actions가 5분마다 `/api/cron/scan`을 `Authorization: Bearer <CRON_SECRET>`로 호출한다.
2. 라우트 핸들러(`src/app/api/cron/scan/route.ts`)가 토큰을 검사하고 `runScanCycle()`을 호출한다.
3. `runScanCycle`은 상태가 `ACTIVE`인 모든 `FacilityCredential`을 순회한다. 관심조건이 하나도
   없는 User의 자격증명은 로그인 자체를 시도하지 않고 건너뛴다(불필요한 로그인으로 계정 잠김
   위험을 늘리지 않기 위함).
4. 각 자격증명에 대해 `getAdapter(facilityId)`로 해당 Facility의 어댑터를 얻고, 복호화한
   아이디/비밀번호로 `adapter.login()`을 호출한다. 실패 유형에 따라 `LoginFailedError`(자격증명
   문제 — 상태를 `PAUSED_LOGIN_FAILED`로 바꾸고 알림)와 `TransientSiteError`(일시적 오류 — 이번
   사이클만 건너뜀)를 구분한다.
5. 로그인에 성공하면 `adapter.scanBookableDates()`로 신청 가능한 날짜 목록을 얻고, 이전에
   신청 가능하다고 기록해뒀던 날짜(마감돼 사라졌을 수 있는 날짜)와 합쳐 스캔 대상 날짜를
   정한다.
6. 각 날짜에 대해 `adapter.scanDaySlots()`로 지금 신청 가능한 시간대 목록을 얻고,
   `diffSlots()`로 이전 관측 상태(`SlotObservationState`)와 비교해 전환(새로 열림/닫힘)을
   찾는다.
7. "새로 열림" 전환마다 `findMatchingConditions()`로 그 User의 활성 `WatchCondition`과
   대조한다. 매칭되면 `NotificationLog`를 생성하고 `sendSlotPushToUser()`로 그 슬롯 하나에 대한
   웹 푸시를 즉시 보낸다(여러 슬롯이 동시에 열려도 개별 발송 — 묶지 않음).
8. 브라우저의 서비스워커(`public/sw.js`)가 푸시를 수신해 알림을 표시하고, 클릭 시 알림에 담긴
   딥링크 URL로 이동한다.
9. User가 앱의 `/schedule` 화면을 직접 열면 `/api/schedule`이 `SlotObservationState` 중
   `isBookable=true`인 것을 관심조건과 실시간으로 대조해 같은 결과를 화면에도 보여준다(푸시를
   놓쳤어도 화면에서 확인 가능).

## 모듈 맵

| 모듈 | 역할 | 의존 방향 |
|---|---|---|
| `src/lib/adapters/*` | 골프장 사이트별 로그인·스캔·딥링크 생성. `SiteAdapter` 인터페이스(`types.ts`)의 구현체만 외부에 노출 | 외부(HTTP)만 바라봄. `src/lib/matching.ts`, `scanCycle.ts`를 알지 못함(역방향 의존 없음) |
| `src/lib/matching.ts` | 전환 감지(`diffSlots`) + 관심조건 매칭(`matchesCondition`). 순수 함수만 존재 | 아무것도 의존하지 않음(DB/네트워크/어댑터 무지) |
| `src/lib/scanCycle.ts` | 위 두 모듈 + Prisma + push를 조합하는 오케스트레이션 | adapters, matching, db, crypto, push, facilities 전부에 의존(가장 상위) |
| `src/lib/crypto.ts` | 비밀번호 해시(단방향) + 자격증명 암호화(가역). 두 용도를 함수명으로 명확히 분리 | 없음(node:crypto, bcryptjs만) |
| `src/lib/auth.ts`, `api-helpers.ts` | 세션 발급/검증, 공용 응답 헬퍼 | db(간접), next/server |
| `src/app/api/**` | HTTP 경계 — 입력 검증(zod) + 인가 검사 + 위 lib 호출 | 대응하는 lib 모듈에만 의존 |
| `src/app/{login,signup,schedule,settings}` | 클라이언트 화면 | `/api/**`를 fetch로만 호출(서버 모듈을 직접 import하지 않음) |
| `src/components/ui/*` | 폼/버튼 등 범용 프레젠테이션 컴포넌트 | 도메인 로직 없음 |

## 외부 시스템 의존

- **PostgreSQL** — Prisma로 접근. User, FacilityCredential, WatchCondition,
  SlotObservationState, NotificationLog, PushSubscription 6개 테이블.
- **라비에벨 예약 사이트** — `src/lib/adapters/laviebelle.ts`가 HTTP로 직접 접근(공식 API
  아님, HTML 파싱). 사이트 개편 시 이 파일만 영향받도록 격리되어 있다.
- **웹푸시(Push API/VAPID)** — `web-push` 패키지. 브라우저 벤더(Chrome/FCM, Safari/APNs 등)의
  푸시 서비스가 실제 전송을 중계한다.
- **GitHub Actions** — 무료 스케줄러 대체용. 코드 저장소 자체에 대한 의존(별도 인프라 없음).
