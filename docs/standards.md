# standards.md — 규칙

## 비밀번호/자격증명 저장 규칙

- App User의 로그인 비밀번호는 `src/lib/crypto.ts`의 `hashPassword`/`verifyPassword`(bcrypt)
  로만 다룬다. **`encryptSecret`/`decryptSecret`을 App User 비밀번호에 쓰면 안 된다** — 그
  둘은 FacilityCredential 전용이다. 검증: 두 함수의 호출부가 뒤바뀌지 않았는지 코드 리뷰에서
  확인하고, `tests/lib/crypto.test.ts`의 "복원 불가능" 단언이 계속 통과해야 한다.
- FacilityCredential의 아이디/비밀번호는 반드시 `encryptSecret`으로 암호화한 뒤 저장한다.
  평문 필드를 추가하거나 평문을 로그에 남기면 안 된다.
- API 응답에서 FacilityCredential을 직렬화할 때는 항상 `toPublicShape`류의 화이트리스트
  변환을 거친다 — Prisma 모델 객체를 그대로 `NextResponse.json()`에 넘기지 않는다(암호화된
  필드라도 응답에 실리는 것 자체를 금지).

## 인가 규칙

- User 소유 리소스를 다루는 모든 API 라우트는 `getUserIdFromRequest`로 얻은 `userId`와
  리소스의 `userId`가 일치하는지 반드시 확인한다. 불일치·부재 시 404로 응답한다(403이 아님 —
  존재 자체를 숨긴다).
- `/api/cron/scan`은 `Authorization: Bearer <CRON_SECRET>` 검사를 요청 처리의 **가장 먼저**
  수행한다 — 검사 실패 시 `runScanCycle()`을 호출하지 않는다(사이드이펙트 없는 실패).

## 사이트-어댑터 경계 규칙

- `src/lib/scanCycle.ts`, `src/app/api/schedule/route.ts` 등 핵심 엔진은 `getAdapter(facilityId)`
  를 통해서만 어댑터를 얻는다 — 특정 골프장의 URL, HTML 구조, 로그인 방식을 core 코드에 직접
  쓰면 안 된다(전부 `src/lib/adapters/<facility>.ts`에만 존재해야 함).
- 새 골프장을 추가할 때는 `SiteAdapter` 인터페이스(`src/lib/adapters/types.ts`)를 구현하는 새
  파일을 추가하고 `src/lib/adapters/registry.ts`와 `src/lib/facilities.ts`에 항목을 등록하는
  것으로 끝나야 한다 — `scanCycle.ts`/`matching.ts`/API 라우트/화면 코드를 수정할 필요가 있다면
  그 자체가 설계 위반 신호다.

## 검증 게이트

- 머지/배포 전 다음이 전부 종료 코드 0이어야 한다: `npm run typecheck`, `npm run lint`,
  `npm test`, `npm run build`.
- 런타임 스모크: `npm run build && npm start` 후 `/login`이 200을 반환하고, 비로그인 상태로
  `/schedule`에 접근하면 `/login`으로 리다이렉트되어야 한다.

## 환경변수 규칙

- 모든 환경변수는 `.env.example`에 이름과 용도가 먼저 등록된 뒤에만 코드에서 참조한다.
- 비밀값(SESSION_SECRET, CREDENTIAL_ENCRYPTION_KEY, VAPID_PRIVATE_KEY, CRON_SECRET,
  INVITE_CODE, DATABASE_URL)은 절대 커밋되는 파일에 실값으로 들어가지 않는다(`.env`는
  gitignore 대상).
- `CREDENTIAL_ENCRYPTION_KEY`는 반드시 base64로 인코딩된 32바이트여야 한다 — 다른 길이의
  키는 `encryptSecret`/`decryptSecret`이 예외를 던지도록 되어 있다(조용히 잘못된 키 길이로
  동작하지 않음).

## 테스트 규칙

- Prisma를 호출하는 로직은 `vi.mock("@/lib/db")`로 클라이언트를 모킹해서 테스트한다(실제
  PostgreSQL 없이 `npm test`가 통과해야 함). 실제 DB가 필요한 마이그레이션 자체의 검증은
  이 테스트 스위트의 범위 밖이다.
- `src/lib/adapters/laviebelle.ts`의 HTML 파서는 `tests/fixtures/laviebelle-*.html`을 입력으로
  테스트한다. 이 fixture는 **실제 사이트 HTML로 아직 검증되지 않은 추정 구조**다
  (`docs/tracking/findings.md` 참고) — 실사이트 구조를 확인하면 fixture와 파서 선택자를 함께
  갱신해야 한다.

## 모듈 경계

- `src/lib/matching.ts`는 어떤 모듈도 import하지 않는다(순수 함수 전용 — 이 파일에 Prisma나
  fetch를 끌어들이는 변경은 되돌린다).
- 화면(`src/app/**/page.tsx`)은 `src/lib/**`의 서버 전용 모듈(`db.ts`, `crypto.ts`,
  `scanCycle.ts` 등)을 직접 import하지 않는다 — 반드시 `/api/**` 라우트를 fetch로 거친다.
