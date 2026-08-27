# 골프 취소표 알림

라비에벨 골프장 예약 사이트를 자동으로 감시해서, 등록해둔 관심 날짜/시간대에 취소표가 새로
열리면 웹 푸시로 알려주고, 앱 화면에서 바로 확인해 원클릭으로 사이트에 넘어가 예약을 마무리할 수
있는 개인용 PWA입니다. 실제 명세는 `.dryforge/` 아카이브(`NNN/`)를 참고하세요.

## 스택

- Next.js(App Router) + TypeScript, Tailwind CSS v4
- Prisma + PostgreSQL (무료 티어: Neon, Supabase 등)
- 웹 푸시(VAPID), 골프장 사이트 접속은 서버에서 `cheerio`로 HTML 파싱
- GitHub Actions scheduled workflow가 몇 분마다 `/api/cron/scan`을 호출(무료 크론)

## 로컬 개발

```bash
npm install
cp .env.example .env   # 아래 값들을 채운다
npx prisma migrate dev # 최초 1회: 테이블 생성
npm run dev
```

### 환경변수 채우는 방법 (.env)

- `DATABASE_URL` — PostgreSQL 연결 문자열. 무료 티어(Neon/Supabase/Railway 등)에서 발급.
- `SESSION_SECRET`, `CRON_SECRET` — `openssl rand -hex 32` 등으로 아무 긴 문자열이나 생성.
- `CREDENTIAL_ENCRYPTION_KEY` — `openssl rand -base64 32` (반드시 32바이트를 base64 인코딩한 값).
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — `npx web-push generate-vapid-keys`로 생성.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — 위 `VAPID_PUBLIC_KEY`와 동일한 값(브라우저에도 필요).
- `INVITE_CODE` — 지인들에게 알려줄 가입용 초대코드. 아무 문자열이나 정해서 넣는다.

## 배포 (예: Vercel 무료 티어)

1. 이 저장소를 Vercel에 연결하고, 위 환경변수를 전부 Vercel 프로젝트 설정에 등록한다.
2. Vercel 무료 티어의 자체 Cron은 하루 1회로 제한되어 있어 몇 분 간격 감시에 쓸 수 없다 — 대신
   `.github/workflows/cron.yml`이 GitHub Actions의 무료 스케줄을 이용해 배포된 앱의
   `/api/cron/scan`을 주기적으로 호출한다. 저장소의 GitHub Secrets에 다음을 등록한다:
   - `APP_BASE_URL` — 배포된 앱 주소(예: `https://your-app.vercel.app`)
   - `CRON_SECRET` — `.env`에 넣은 값과 동일하게

## 실사이트 연동 전 반드시 확인해야 하는 것 (중요)

`src/lib/adapters/laviebelle.ts` 상단 주석 참고 — 이 어댑터의 HTML 파싱 선택자와 로그인
경로/필드명은 **실제 사이트 화면 캡처(스크린샷)만으로 추정**해서 만든 것이라, 실사이트의 진짜
HTML 구조로 검증되지 않았습니다. 배포 전에 반드시:

1. 라비에벨 사이트에 로그인해서 예약 캘린더 화면과 날짜별 시간표 화면의 실제 HTML(브라우저
   개발자도구 → Elements/페이지 소스 보기)을 확인한다.
2. `parseCalendarHtml` / `parseDaySlotsHtml`의 선택자(`.gres-calendar-month`,
   `td.gres-day--bookable` 등)를 실제 클래스명/구조에 맞게 수정한다.
3. `login()`의 `LOGIN_PATH`와 폼 필드명(`id` / `pwd`)을 실제 로그인 폼 구조에 맞게 수정한다.
4. `tests/fixtures/laviebelle-*.html`을 실제 구조를 반영한 fixture로 교체하고
   `npm test`로 재검증한다.

뉴코스(`laviebelle-new`) 지원 여부와, 취소표 클릭 시 날짜별 화면으로 직접 연결되는 딥링크가
가능한지도 같은 방식으로 실사이트에서 확인이 필요합니다(각각 `src/lib/adapters/laviebelle.ts`,
`src/lib/adapters/registry.ts`의 관련 주석 참고).

## PWA 아이콘

`public/icons/icon-192.png`, `icon-512.png`는 자리표시용 단색 아이콘입니다. 실제 배포 전에
브랜드에 맞는 아이콘으로 교체하는 것을 권장합니다.

## 테스트

```bash
npm test        # 단위/통합 테스트 (Prisma는 mock — 실제 DB 불필요)
npm run typecheck
npm run build
```
