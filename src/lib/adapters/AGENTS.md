# src/lib/adapters — 사이트-어댑터

## 이 모듈이 책임지는 것

특정 골프장 예약 사이트에 대한 로그인, 예약 가능 날짜 스캔, 날짜별 시간표 스캔, 딥링크
생성 — 즉 "어떤 사이트를 어떻게 긁어오는가"에 대한 모든 지식.

## 이 모듈이 책임지지 않는 것 (건드리지 말 것)

- 관심조건 매칭, 슬롯 상태 diff, 알림 발송 판단 — 전부 `src/lib/matching.ts`와
  `src/lib/scanCycle.ts`의 책임이다. 이 모듈의 파일에서 Prisma나 알림 발송 코드를 import하지
  않는다.
- 자격증명의 암/복호화 — `src/lib/crypto.ts`의 책임이다. 어댑터의 `login()`은 이미 평문으로
  복호화된 아이디/비밀번호를 인자로 받는다(이 모듈 안에서 암호화 로직을 다시 구현하지 않음).
- 어느 골프장을 감시할지 결정 — `registry.ts`가 아니라 호출부(`scanCycle.ts`)의 책임이다.

## 반드시 지켜야 하는 것

- 새 골프장을 추가할 때는 `types.ts`의 `SiteAdapter` 인터페이스를 구현하는 새 파일 하나를
  추가하고, `registry.ts`의 `ADAPTERS` 맵과 `../facilities.ts`의 `FACILITIES` 배열에 각각
  항목을 추가하는 것으로 끝나야 한다. 다른 파일(scanCycle.ts, matching.ts, API 라우트, 화면
  컴포넌트)을 수정해야 한다면 인터페이스 설계가 새어나간 것이다.
- `login()`은 실패 원인을 반드시 `LoginFailedError`(자격증명 자체의 문제 — 호출부가 계정을
  `PAUSED_LOGIN_FAILED`로 바꾸는 신호)와 `TransientSiteError`(일시적 오류 — 호출부가 이번
  사이클만 건너뛰는 신호)로 구분해서 던진다. 이 구분이 무너지면 무한 재시도로 인한 계정 잠김
  방지 로직 전체가 무력화된다.
- `scanDaySlots()`가 반환하는 배열에는 **지금 신청 가능한 슬롯만** 담는다(예약 완료된
  시간대를 별도 필드로 표시해 포함하는 방식으로 바꾸지 말 것 — 상위 diff 로직이 "목록에
  없음 = 신청 불가"를 전제로 만들어져 있다).

## 현재 상태에 대한 특기 사항

`laviebelle.ts`는 로그인 폼 필드명/제출 경로, "셸 페이지 GET → AJAX 엔드포인트 POST" 2단계
구조, 달력·날짜별 시간표 AJAX 응답 조각의 실제 마크업(`parseCalendarHtml`/`parseCalendarDays`/
`parseDaySlotsHtml`), 날짜별 openyn/dategbn 값까지 전부 실사이트 캡처로 확인됐다.

라비에벨 리조트는 코스가 둘(올드코스 `/oldcourse`, 듄스코스 `/dunescourse`)이고 두 코스의
예약 화면은 경로 접두사만 다르고 구조가 완전히 동일하다(2026-08-30 확인). 그래서
`laviebelle.ts`는 코스 설정(`coursePath`, `facilityId`)만 받는 팩토리
`createLaviebelleAdapter`로 구현되고, 파일 하단에서 `laviebelleOldCourseAdapter`(`laviebelle-old`)
와 `laviebelleDunesCourseAdapter`(`laviebelle-dunes`) 두 인스턴스를 export 한다. **같은
사이트의 다른 코스를 추가할 때는 새 파일이 아니라 이 팩토리에 인스턴스를 하나 더 추가한다**
(별도 파일 규칙은 "다른 사이트"에만 적용).

남은 미확인 항목: (1) `login_ok.asp`의 로그인 성공/실패 신호 방식, (2) 코스 간 세션 쿠키
공유 여부. 이 파일을 수정할 때는 상단 주석의 "확인된 것"/"아직 확인 안 된 것" 구분과
"⚠️" 경고를 먼저 읽는다.

`lakewood.ts`(레이크우드CC)는 **`loginless: true` 어댑터**다. 사이트에 봇 탐지(botnhuman)가
활성이라 자동 로그인이 위험해(조사 중 실제로 차단당함), 대신 비로그인(익명) 상태로
달력/시간표를 긁는다. 엔진은 loginless 어댑터의 `login()`을 호출하지 않고 `{cookie:""}`로
스캔한다(`scanCycle.ts` 참고). 자격증명도 필요 없다 — `credentials` API/설정 화면이
loginless 골프장은 아이디/비번을 안 받고 빈 값을 저장한다. 봇 차단 페이지가 응답으로 오면
`postAnon`이 감지해 `TransientSiteError`로 던진다(그 사이클만 건너뜀). 새 loginless 어댑터를
만들 땐 `types.ts`의 `loginless` 주석과 `facilities.ts`의 `isLoginlessFacility`를 함께 본다.
docs/tracking/findings.md의 레이크우드 항목 참고.

## 테스트 가이드

- 순수 파싱 함수(`parseCalendarHtml`, `parseDaySlotsHtml`)는 `tests/adapters/`에서
  `tests/fixtures/*.html`을 입력으로 테스트한다. 사이트 구조가 바뀌면 fixture와 선택자를
  함께 갱신하고 테스트를 다시 통과시킨다.
- `login()`/`scanBookableDates()`/`scanDaySlots()`의 실제 네트워크 호출은 이 프로젝트의
  단위 테스트 범위 밖이다(실사이트 접근이 필요한 통합 테스트로 별도 취급).
