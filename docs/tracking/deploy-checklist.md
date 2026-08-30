# deploy-checklist.md — 최초 배포 체크리스트

전체 절차와 배경은 `docs/operations.md` 참고. 이 파일은 **최초 1회 배포**에 필요한 남은
수동 단계만 순서대로 정리한다. (2026-08-30 기준)

## 이미 된 것

- [x] Vercel 프로젝트 `golfrory/golf-cancel-alert` ↔ GitHub `skydookie/golf-cancel-alert` 연결
- [x] 프로덕션 빌드 통과 (`postinstall: prisma generate` 추가로 해결)
- [x] 초기 마이그레이션 `prisma/migrations/0_init` 저장소에 포함
- [x] 로컬 `.env` 에 비밀값(SESSION_SECRET / CREDENTIAL_ENCRYPTION_KEY / VAPID / CRON_SECRET
      / INVITE_CODE) 생성 완료 — **이 값들을 아래 단계에서 그대로 쓴다** (`.env`는 gitignore)

## 남은 수동 단계

### 1. PostgreSQL 연결
Vercel → 프로젝트 → **Storage → Connect Database** → Neon(무료 티어) 생성.
→ `DATABASE_URL` 등이 프로젝트 환경변수에 자동 주입됨.

### 2. 환경변수 등록 (Vercel → Settings → Environment Variables, Production)
로컬 `.env` 의 아래 키/값을 그대로 등록 (DATABASE_URL은 1번에서 자동):
`SESSION_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `CRON_SECRET`, `INVITE_CODE`

### 3. 마이그레이션 적용 (최초 1회)
로컬에서 `.env` 의 `DATABASE_URL` 을 프로덕션(Neon) 값으로 잠깐 바꾼 뒤:
```
npx prisma migrate deploy
```
성공하면 원래 값으로 되돌린다. (또는 Vercel Build Command 를
`prisma migrate deploy && next build` 로 바꿔 자동화 — 단 DATABASE_URL 이 빌드 시점에
있어야 함. 원하면 `vercel.json` 에 `buildCommand` 로 커밋해도 됨.)

### 4. 재배포
Vercel → Deployments → 최신 → … → **Redeploy** (새 환경변수 반영).

### 5. GitHub Actions 시크릿 (repo → Settings → Secrets and variables → Actions)
- `APP_BASE_URL` = `https://golf-cancel-alert.vercel.app`
- `CRON_SECRET` = `.env` 의 CRON_SECRET 과 동일 값

### 6. 종단 간 스모크 (1회)
1. `/signup` — INVITE_CODE 로 가입
2. 골프장 계정(라비에벨) 등록 → 관심조건(날짜·시간대) 등록
3. 휴대폰 브라우저에서 알림 권한 허용 → 구독
4. GitHub Actions → "취소표 감시 스케줄러" workflow_dispatch 수동 실행 → 로그 200 확인
5. 스캔 로그에서 라비에벨 로그인 성공/실패가 올바르게 판정되는지 확인
   (→ `findings.md` 의 `login_ok.asp` 신호 방식 미검증 이슈를 여기서 실측)
