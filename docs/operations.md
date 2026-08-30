# operations.md — 운영

## 최초 설정 순서

```bash
npm install                        # postinstall이 자동으로 `prisma generate`를 실행한다
                                    # (스크립트 승인 경고가 뜨면: npm approve-scripts <패키지들>, 다시 npm install)
cp .env.example .env                # 아래 "환경변수" 항목을 채운다
npx prisma migrate dev              # PostgreSQL에 테이블 생성 (DATABASE_URL이 먼저 유효해야 함)
npm run dev                         # http://localhost:3000
```

> `npm install` 없이 소스만 받은 상태에서는 Prisma Client 타입이 생성되지 않아
> `npm run typecheck` / `npm run build`가 `implicitly has an 'any' type` 에러를 낸다 —
> `npm install`(또는 `npm run prisma:generate`)을 먼저 실행하면 해소된다. Vercel 빌드는
> `postinstall`이 이를 처리한다.

`npx web-push generate-vapid-keys`로 VAPID 공개/비공개 키 쌍을 만들어 `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`(공개키와 동일 값)에 채운다 — 이 단계 없이는
알림 기능이 동작하지 않는다(에러가 나며 실패).

## 환경변수

| 이름 | 역할 | 유효 범위 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 연결 문자열 | Prisma가 이해하는 `postgresql://` 형식 |
| `SESSION_SECRET` | 세션 JWT 서명 키 | 임의의 긴 문자열 |
| `CREDENTIAL_ENCRYPTION_KEY` | 골프장 계정 자격증명 암호화 키 | **반드시** base64로 인코딩된 32바이트 — 아니면 런타임 예외 |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | 웹푸시 서버측 키/발신자 | `web-push generate-vapid-keys` 출력값 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 웹푸시 클라이언트측 공개키 | `VAPID_PUBLIC_KEY`와 동일한 값(브라우저 번들에 포함되므로 `NEXT_PUBLIC_` 접두사 필요) |
| `CRON_SECRET` | `/api/cron/scan` 호출 인증 토큰 | 임의의 긴 문자열, GitHub Secrets에도 동일하게 등록 |
| `INVITE_CODE` | 회원가입 게이트 코드 | 임의의 문자열, 지인들에게 직접 공유 |

## 빌드/검증 명령

```bash
npm run typecheck   # tsc --noEmit
npm run lint         # eslint .
npm test             # vitest run (Prisma는 mock — 실제 DB 불필요)
npm run build        # next build
```

네 명령 모두 종료 코드 0이어야 배포 가능한 상태다.

## 배포 절차 (Vercel 무료 티어 기준)

1. 저장소를 Vercel에 연결. 위 환경변수를 전부 Vercel 프로젝트의 Environment Variables에 등록.
2. `npx prisma migrate deploy`를 배포 파이프라인에 포함하거나, 최초 1회 로컬에서
   `DATABASE_URL`을 프로덕션 DB로 바꿔 수동 실행. 초기 마이그레이션
   (`prisma/migrations/0_init`)은 저장소에 이미 포함돼 있어 빈 DB에 바로 적용된다.
3. 저장소의 GitHub Secrets에 `APP_BASE_URL`(배포된 앱 주소)과 `CRON_SECRET`(`.env`와 동일한
   값)을 등록 — `.github/workflows/cron.yml`이 5분마다 `/api/cron/scan`을 호출한다(Vercel
   자체 Cron은 무료 티어에서 하루 1회로 제한되어 이 용도에 쓸 수 없어, 대신 GitHub Actions의
   무료 스케줄을 쓴다).

## 데이터 초기화

별도의 시드 데이터는 없다. 최초 사용자는 `INVITE_CODE`를 알고 `/signup`으로 직접 가입한다.
