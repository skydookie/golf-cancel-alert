# engineering-notes.md — 지식

## Vitest 설정 파일은 반드시 `.mts` 확장자여야 한다

**증상**: `vitest.config.ts`로 두면 `"vite-tsconfig-paths" resolved to an ESM file. ESM file
cannot be loaded by 'require'` 에러로 테스트 실행 자체가 시작되지 않는다.
**원인**: `package.json`에 `"type": "module"`이 없어(Next.js 프로젝트 관례상 안 넣음) 설정
파일이 CommonJS로 로드되는데, `vite-tsconfig-paths`는 ESM 전용 패키지라 `require()`로 못
불러온다.
**대응**: 설정 파일을 `vitest.config.mts`로 두면 확장자 자체가 ESM 로딩을 강제해 문제가
사라진다. `package.json`에 `"type": "module"`을 추가하는 방식은 Next.js의 다른 설정 파일들과
충돌 위험이 있어 채택하지 않았다.

## npm의 `allowScripts`가 Prisma 엔진 다운로드를 막을 수 있다

**증상**: `npm install` 직후 `npx prisma generate`를 해도 클라이언트가 안 만들어지거나,
설치 로그에 `allow-scripts pending` 경고가 남는다.
**원인**: 이 환경의 npm 설정이 postinstall 스크립트를 기본 차단한다. `@prisma/client`,
`@prisma/engines`, `prisma`, `esbuild`, `unrs-resolver` 모두 엔진 바이너리를 받는
postinstall/preinstall 스크립트를 갖고 있다.
**대응**: `npm approve-scripts <pkg1> <pkg2> ...`로 해당 패키지들을 명시적으로 승인한 뒤
`npm install`을 다시 실행해야 스크립트가 돈다. 이 승인 목록은 `package.json`의
`allowScripts` 필드에 영구 기록되므로 이후 설치에서는 반복할 필요 없다.

## Prisma의 `onDelete: Cascade`가 계정 완전탈퇴 요건을 스키마 레벨에서 해결한다

계정 탈퇴 시 FacilityCredential/WatchCondition/SlotObservationState/NotificationLog/
PushSubscription을 전부 지워야 한다는 요건은, 애플리케이션 코드에서 5개 테이블을 순서대로
삭제하는 대신 `prisma/schema.prisma`의 각 관계에 `onDelete: Cascade`를 선언해 DB 자체가
`User.delete()` 한 번으로 처리하게 했다. `src/app/api/auth/delete-account/route.ts`에는
연쇄 삭제 로직이 없다 — 스키마를 안 보고 이 파일만 읽으면 "삭제가 불완전한가?"로 오해하기
쉽다.

## 라비에벨 사이트 로그인 응답에서 여러 `Set-Cookie`를 읽으려면 `getSetCookie()`가 필요하다

일반적인 `response.headers.get("set-cookie")`는 여러 쿠키가 있을 때 하나의 문자열로
합쳐지거나(스펙상 허용되지만 파싱이 번거로움) 구현에 따라 첫 값만 반환될 수 있다. Node의
내장 fetch(undici)는 `response.headers.getSetCookie()`로 배열을 그대로 준다 —
`src/lib/adapters/laviebelle.ts`의 `extractCookies`가 이를 사용한다. 다른 런타임(Edge 등)으로
옮기면 이 API가 없을 수 있으니, 어댑터를 Edge Runtime에 올리려면 먼저 이 부분을 확인해야
한다.

## 라비에벨 예약 화면은 셸 페이지 + AJAX 프래그먼트 조합이라 단순 GET 스크레이핑이 안 된다

`real_reservation.asp`를 GET하면 달력·시간표 데이터가 없는 빈 껍데기만 온다 — 실제 데이터는
페이지 로드시 인라인 스크립트가 jQuery AJAX POST로 별도 엔드포인트
(`real_calendar_ajax_view.asp`, `real_timeinfo_ajax_from.asp`)를 호출해 그 응답 HTML을
화면에 끼워 넣는 방식이다. 사용자가 제공한 실제 페이지 소스/화면 캡처로 이 구조, 로그인 폼
필드명(`mem_id`/`usr_pwd`, `login_ok.asp`), 달력·시간표 AJAX 응답 조각의 실제 마크업
(`parseCalendarHtml`/`parseCalendarDays`/`parseDaySlotsHtml`)까지 전부 확인해
`src/lib/adapters/laviebelle.ts`에 반영했다. "페이지 소스 보기"로는 최초 로드 HTML만 보이고,
AJAX가 채워 넣는 실제 화면 요소는 개발자도구 Elements 탭에서 해당 DOM을 검사(Inspect)한 뒤
outerHTML을 복사해야 확인할 수 있다는 점이 관건이었다.

## 라비에벨 달력 조각의 날짜 링크(timefrom_change)가 그 날짜의 openyn/dategbn을 직접 담고 있다

달력 AJAX 조각의 각 날짜는 `<a href="javascript:timefrom_change('YYYYMMDD','openyn',
'dategbn',...)">`로 렌더링된다 — 즉 날짜별 시간표 조회(`real_timeinfo_ajax_from.asp`)에
필요한 `openyn`/`dategbn` 값을 별도로 추측하거나 계산할 필요 없이, 달력을 파싱할 때 그대로
읽어오면 된다. `scanBookableDates`가 이 값을 `session`(어댑터별로 내용이 달라도 되는
`SiteSession`)에 캐싱해두고, 뒤이어 호출되는 `scanDaySlots`가 재사용한다 — scanCycle.ts가
항상 `scanBookableDates`를 먼저 호출한 뒤 같은 `session`으로 `scanDaySlots`를 호출하는 현재
순서에 의존하는 설계다.

날짜의 예약 가능 여부 자체는 `<td>`의 첫 번째 자식 `<div>`의 클래스가 `cm_liv`(예약 가능)인지
아닌지로 판별한다 — 화면의 "예약"/"마감" 범례(`cm_navi_liv`/`cm_navi_end`)와 대응된다.

## 라비에벨 시간표에 보이는 요금은 "정가"이고, 실제 결제 요금은 신청 버튼의 onclick 인자에만 있다

`real_timeinfo_ajax_from.asp` 응답의 요금 셀(`<td class="cm_wjdtkddyrma">`)에는 취소선
처리하려던 정가만 들어 있고(사이트 쪽 `_style` 오타로 취소선 자체는 렌더링 안 됨), 회원이
실제로 결제할 할인가는 신청 링크의 `href="javascript:subcmd('R', ..., greenfee_base,
greenfee_dis, ...)"` 호출 인자 중 `greenfee_dis`에만 있다(사용자가 캡처해준 실제 응답으로
확인됨: 정가 250,000 vs 실제 230,000). `parseDaySlotsHtml`이 셀 텍스트 대신 이 인자를
우선 파싱하는 이유이자, 새 fixture로 바꿀 때 같이 잃어버리기 쉬운 함정이다.

## Vercel 무료 티어는 자체 Cron이 하루 1회로 제한된다

취소표 감시는 몇 분 간격이어야 의미가 있는데, Vercel Hobby 플랜의 Cron Jobs는 무료 한도에서
하루 1회로 제한되어 있어 이 용도에 못 쓴다. 대신 GitHub Actions의 scheduled workflow(무료,
공개 저장소 기준 최소 간격 제약이 느슨함)가 배포된 앱의 `/api/cron/scan`을 5분마다 호출하는
방식을 택했다(`.github/workflows/cron.yml`). GitHub Actions의 스케줄은 부하 상황에 따라 정확히
5분마다 실행되지 않을 수 있다 — 개인 규모 사용에는 지장 없는 수준의 지연으로 판단했다.
