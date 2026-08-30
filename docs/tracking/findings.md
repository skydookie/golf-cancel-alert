# findings.md — 미해결 문제

## 레이크우드(lakewood.co.kr) 어댑터 — 봇 차단이 자동 스캔을 막음 (2026-08-30)

**결론: 어댑터는 구현했으나(`src/lib/adapters/lakewood.ts`) `facilities.ts`/`registry.ts`에
등록하지 않았다.** 조사 중 반복 fetch가 botnhuman 봇 탐지에 걸려 세션이
`https://lakewood-cdn.botnhuman.com/macro.html?msg=...(강화된 보안정책... 다시 시도해 주십시오)`
로 리다이렉트됐다. 5분마다 자동 로그인·스캔하는 엔진에 물리면 곧 차단되고, 회원 계정이
잠길 위험도 있다. 사용자가 이 위험을 받아들이기로 하면 그때 등록한다.

**로그인은 확정됨**: `POST /member/loginChk`, form 본문 `usrId`·`usrPwd`·
`returnURL=/reservation/golf` → JSON `{"success":"S",...}` = 성공(실사이트 요청 캡처로 확인).
coDiv·안티매크로 토큰 불필요. 로그인 실패 응답 형태(success 값)는 미확인.

**상황**: 사용자가 레이크우드CC 추가를 요청. 실사이트 조사 결과:
- **스캔 경로는 파악됨**(조사 초반에는 세션 쿠키만으로 raw fetch가 동작했으나, 반복하자 차단됨):
  - 달력: `POST /reservation/ajax/golfCalendar` (mainForm serialize, `workMonth=YYYYMM`)
    → HTML. 예약 가능일 = `<a class="cal_live" onclick="clickCal(cls,'A','YYYYMMDD','OPEN')">`.
    마감 = `cal_end`/`cal_closed`, 오픈전 = 클래스 없음/`NOOPEN`.
  - 시간표: `POST /reservation/ajax/golfTimeList` (mainForm serialize, `workDate=YYYYMMDD`,
    `bookgCourse=ALL`) → HTML. `<tr>` 5칸(번호/코스/시간/홀/예약). 신청 가능 행에만
    `<button class="btn btn-res" onclick="golfConfirm('YYYYMMDD','HHMM','courseCd','코스명',
    'HH:MM','18홀',...)">신청</button>`. 예약 완료분은 표에 없음. 요금은 행에 안 보임
    (golfConfirm 인자의 그린피가 '0','0'). 코스: 물길·꽃길·산길·숲길.
  코스: 물길·꽃길·산길·숲길. → `parseCalendarDates` / `parseDaySlots`로 구현·테스트됨.
- **봇 차단**: `lakewood-cdn.botnhuman.com` 비콘 + 예약 mainForm에 `macroChk`·
  `verify_entity_id/ip/unique` 필드. 조사 중 반복 요청이 실제로 걸려
  `botnhuman.com/macro.html`로 리다이렉트됐다(위 "결론" 참고).

**대응 방향 / 남은 선택지**:
- 안전 장치: `login()` 1회 실패 → `LoginFailedError` → `PAUSED_LOGIN_FAILED`(무한 재시도
  없음). 봇 차단 페이지는 JSON이 아니므로 현재 `login()`은 이를 `TransientSiteError`로 처리
  (계정 안 잠금, 다음 사이클 재시도) — 반복 차단이면 계정 노출이 계속되니 이 동작을 재검토할 것.
- 활성화하려면: (a) 스캔 주기를 크게 늘려 봇 감지 회피(취소표를 놓칠 확률↑), (b) 세션 쿠키
  수명이 길면 재로그인을 줄이도록 엔진에 세션 캐시 추가, (c) 로그인 실패 응답(success 값)을
  실사이트로 확인. 셋 다 사용자 결정·추가 작업 필요.

## GitHub Actions cron이 비공개 저장소 무료 한도를 초과함 (2026-08-30)

**증상**: `skydookie/golf-cancel-alert`는 **비공개** 저장소다. GitHub Free 플랜의 비공개
저장소 Actions 한도는 월 2,000분인데, `cron.yml`은 5분 간격(월 ~8,640회 실행 × 최소 1분
과금 = ~8,640분)이라 매달 한도를 4배 이상 초과한다 → 매월 초 며칠만 돌고 멈춘다.
**영향 범위**: 감시 자체가 주기적으로 중단됨. 알림이 안 오는데 원인 파악이 어려움.
**접근 방향(택1)**:
1. 저장소를 **공개로 전환** — 공개 저장소는 Actions 분 무제한. 커밋된 비밀값이 없어
   (`.env`는 gitignore, 비밀은 GitHub Secrets/Vercel에만) 안전하다. 개인 도구엔 이게 제일 간단.
2. 외부 무료 cron 서비스(cron-job.org 등)로 `/api/cron/scan`을 5분마다 POST 호출
   (`Authorization: Bearer <CRON_SECRET>` 헤더 포함). 저장소 공개 안 해도 됨.
3. 간격을 30분 이상으로 늘림(월 ~1,440분, 한도 내). 단 취소표를 놓칠 확률이 올라감.

## (2026-08-30 실사이트 재조사로 정리됨)

- **뉴코스 = 듄스코스**로 확정. 리조트에는 코스가 둘뿐이다 — 올드코스(`/oldcourse`)와
  듄스코스(`/dunescourse`). `/newcourse` 경로는 에러 페이지(error.jpg)만 반환하는 죽은
  경로다. 듄스코스 예약 화면은 올드코스와 경로 접두사만 다르고 로그인 폼·숨은 필드·2단계
  AJAX 구조·달력/시간표 마크업이 완전히 동일해, `createLaviebelleAdapter` 팩토리로 같은
  구현을 코스 설정만 바꿔 재사용하고 `laviebelle-dunes`를 `facilities.ts`/`registry.ts`에
  등록했다. → 아래 "뉴코스" 항목 해소.
- **날짜별 딥링크는 사이트 구조상 불가능**함을 확인. 달력 날짜 링크 `timefrom_change()`는
  URL을 바꾸지 않고 숨은 폼(#listform_timeform)을 세팅한 뒤 `real_timeinfo_ajax_from.asp`로
  AJAX POST만 한다. 쿼리 파라미터로 특정 날짜 화면에 도달할 방법이 없다 —
  `buildDeepLink`가 예약 캘린더 셸 URL만 반환하는 현재 동작이 최선이다. → 아래 "딥링크"
  항목 해소(더 나은 방법 없음).
- **남은 미확인**: (1) `login_ok.asp`의 성공/실패 신호 방식(아래 참고), (2) 올드코스에서
  받은 세션 쿠키가 듄스코스 요청에도 유효한지 — 도메인 전역 쿠키인지, 코스별 로그인이 따로
  필요한지. 현재 어댑터는 코스별로 각자 `login()`을 호출하므로 동작에는 문제없으나, 회원
  계정/세션이 두 코스에서 공유되는지는 로그인해봐야 확인된다.

## 라비에벨 로그인 성공/실패 신호 방식이 검증되지 않음

**증상**: 사용자가 실제 화면 캡처를 단계적으로 제공해, 로그인 폼(`mem_id`/`usr_pwd`,
`/oldcourse/_mobile/login/login_ok.asp`), "셸 페이지 GET → AJAX 엔드포인트
(`real_calendar_ajax_view.asp`, `real_timeinfo_ajax_from.asp`) POST" 2단계 구조, 달력·
날짜별 시간표 AJAX 응답 조각의 실제 마크업, 그리고 날짜별 `openyn`/`dategbn` 값(달력 조각의
각 날짜 링크에서 직접 읽어옴)까지 확인되어 `src/lib/adapters/laviebelle.ts`에 반영했다.
남은 유일한 미확인 항목은 `login_ok.asp`가 로그인 성공/실패를 실제로 어떻게 신호하는지
(리다이렉트 위치, 쿠키 발급 여부, 별도 에러 파라미터 등)이다.
**왜 지금 못 고치나**: 처리 스크립트(common.js/loginfrom.js)가 실제 로그인 실패 시도의
응답을 확보해야만 확인할 수 있는데, 아직 캡처되지 않았다 — 코드만 읽어서는 해결할 수 없는
외부 의존 정보다.
**영향 범위**: 현재 `login()`은 쿠키 미발급이나 "login"이 포함된 리다이렉트를 실패로 간주하는
추정 로직이다. 실제 신호 방식이 다르면 로그인 실패를 성공으로 오판해 잘못된 세션으로 계속
스캔을 시도하거나, 반대로 정상 로그인을 실패로 오판해 계정이 불필요하게
`PAUSED_LOGIN_FAILED`로 잠길 수 있다.
**접근 방향**: 사용자가 (테스트용으로) 일부러 틀린 비밀번호로 로그인을 시도해 개발자도구
Network 탭에서 `login_ok.asp` 요청의 응답 상태 코드/리다이렉트 위치/쿠키 여부를 확인해주면,
`login()`의 성공/실패 판별 조건을 실제 신호에 맞게 수정한다.

## ~~뉴코스의 존재 여부와 구조가 확인되지 않음~~ → 해소 (2026-08-30)

뉴코스는 곧 **듄스코스**(`/dunescourse`)다. 올드코스와 경로 접두사만 다르고 구조가 완전히
동일해 `createLaviebelleAdapter` 팩토리로 재사용, `laviebelle-dunes`로 등록했다. 남은 미확인
항목(코스 간 세션 쿠키 공유 여부)은 위 "2026-08-30 실사이트 재조사" 절에 정리.

## ~~취소표 클릭 시 날짜별 화면으로 직접 연결되는 딥링크가 가능한지~~ → 해소: 불가능함 확인 (2026-08-30)

달력 날짜 링크 `timefrom_change()`는 URL을 바꾸지 않고 숨은 폼 세팅 + AJAX POST만 한다.
쿼리 파라미터로 특정 날짜 화면에 도달할 방법이 없으므로 `buildDeepLink`가 예약 캘린더 셸
URL만 반환하는 현재 동작이 구조상 최선이다. 사용자는 그 화면에서 원하는 날짜를 한 번 더
클릭해야 한다(원클릭은 사이트가 지원하지 않음).

## 실제 PostgreSQL/실제 VAPID 키를 쓴 종단 간(end-to-end) 검증이 없음

**증상**: 모든 자동화 테스트는 Prisma client를 mock으로 대체해서 실행된다(`npm test`는 실제
DB 없이 통과). 실제 배포 환경(진짜 PostgreSQL, 진짜 VAPID 키, 진짜 브라우저 푸시 수신)에서의
동작은 이 세션 안에서 확인할 방법이 없었다(배포된 인프라 자체가 없음).
**왜 지금 못 고치나**: 실제 클라우드 자원(DB 인스턴스, 배포 URL)이 필요한 검증이라 로컬
세션에서 완결할 수 없다.
**영향 범위**: 스키마 마이그레이션이 실제 PostgreSQL에 문제없이 적용되는지, 웹푸시가 실제
안드로이드/iOS 기기에 도달하는지는 배포 후 최초 확인이 필요하다.
**접근 방향**: 무료 티어 PostgreSQL·Vercel에 최초 배포한 뒤, 회원가입 → 관심조건 등록 →
(테스트용으로 짧게 스캔 주기를 당겨) 알림 수신까지 한 번 수동으로 확인한다.
