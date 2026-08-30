# deploy-checklist.md — 최초 배포 체크리스트

전체 절차와 배경은 `docs/operations.md` 참고. 이 파일은 **최초 1회 배포**에 필요한 남은
수동 단계만 순서대로 정리한다. (2026-08-30 기준)

## 이미 된 것

- [x] Vercel 프로젝트 `golfrory/golf-cancel-alert` ↔ GitHub `skydookie/golf-cancel-alert` 연결
- [x] 프로덕션 빌드 통과 (`postinstall: prisma generate` 추가로 해결)
- [x] 초기 마이그레이션 `prisma/migrations/0_init` 저장소에 포함
- [x] **Neon Postgres 연결됨** — `neon-teal-dog`, `DATABASE_URL` / `DATABASE_URL_UNPOOLED`
      포함해 Vercel 환경변수 자동 주입 (Production and Preview)
- [x] **앱 비밀값 8개 Vercel에 등록됨** — `SESSION_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`,
      `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
      `CRON_SECRET`, `INVITE_CODE` (2일 전 세션에서 설정). 로컬 `.env` 의 값과는 다를 수 있음 —
      GitHub Secrets `CRON_SECRET` 은 **Vercel 값**과 맞춰야 함.
- [x] `prisma migrate deploy` 는 `vercel.json` buildCommand 로 매 배포 시 자동 실행
- [x] **프로덕션 배포 성공** (커밋 `1f40863`, Ready). buildCommand 가 `prisma migrate deploy`
      를 성공적으로 실행 → **Neon DB에 스키마 적용 완료**.
- [x] **앱 라이브** — https://golf-cancel-alert.vercel.app/signup 정상 렌더링 확인 (2026-08-30)

## 남은 수동 단계

### 1. 주기적 스캔 트리거 설정
⚠️ 저장소가 비공개라 GitHub Actions 5분 cron은 무료 한도 초과(findings.md 참고). 택1:
- **(권장) 저장소 공개 전환** — repo → Settings → General → Danger Zone → Change visibility →
  Public. 그 다음 repo → Settings → Secrets and variables → Actions 에 등록:
  - `APP_BASE_URL` = `https://golf-cancel-alert.vercel.app`
  - `CRON_SECRET` = **Vercel 에 등록된 `CRON_SECRET` 값과 동일하게** (로컬 `.env` 값 아님 —
    Vercel Settings → Environment Variables 에서 확인)
- **또는 외부 cron**(cron-job.org 등): `https://golf-cancel-alert.vercel.app/api/cron/scan`
  를 5분마다 **POST**, 헤더 `Authorization: Bearer <CRON_SECRET>` 추가. 이 경우 GitHub
  Secrets/워크플로는 필요 없음.

### 2. 종단 간 스모크 (1회)
1. `/signup` — Vercel 의 `INVITE_CODE` 값으로 가입
2. 골프장 계정(라비에벨) 등록 → 관심조건(날짜·시간대) 등록
3. 휴대폰 브라우저에서 알림 권한 허용 → 구독
4. GitHub Actions → "취소표 감시 스케줄러" workflow_dispatch 수동 실행 → 로그 200 확인
   (또는 외부 cron 첫 실행 확인)
5. 스캔 로그에서 라비에벨 로그인 성공/실패가 올바르게 판정되는지 확인
   (→ `findings.md` 의 `login_ok.asp` 신호 방식 미검증 이슈를 여기서 실측)
