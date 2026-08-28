import * as cheerio from "cheerio";
import type { AvailableSlot, SiteAdapter, SiteSession } from "@/lib/adapters/types";
import { LoginFailedError, TransientSiteError } from "@/lib/adapters/types";

// ─────────────────────────────────────────────────────────────────────────
// 라비에벨 올드코스 사이트-어댑터
//
// [실사이트 HTML로 확인된 것]
//   - (2026-08-28, 로그인 전 상태의 예약 화면 "페이지 소스 보기") 로그인 폼(퀵로그인,
//     #frmQuickLogin): method=POST, action=/oldcourse/_mobile/login/login_ok.asp, 필드명
//     mem_id(아이디/휴대폰번호), usr_pwd(비밀번호).
//   - (동일 캡처) 예약 캘린더 화면(real_reservation.asp) 자체는 달력·시간표 데이터를 담고
//     있지 않다. 화면 로드시 인라인 스크립트가 숨은 폼을 채운 뒤 jQuery AJAX POST로 별도 .asp
//     엔드포인트를 불러 그 응답 HTML을 그대로 화면에 끼워 넣는 구조다(서버 렌더링 + 클라이언트
//     조립). 즉 이 어댑터는 "셸 페이지 GET → 그 안의 숨은 폼 값으로 AJAX 엔드포인트 POST"
//     2단계로 동작해야 한다:
//       1) 달력: POST ./real_calendar_ajax_view.asp
//          (필드: golfrestype=real, schDate=YYYYMM, usrmemcd, toDay=YYYYMMDD, calnum=1|2)
//       2) 날짜별 시간표: POST ./real_timeinfo_ajax_from.asp
//          (필드: golfrestype=real, courseid, usrmemcd, pointdate=YYYYMMDD, openyn, dategbn,
//          choice_time, pointdatechk, inputtype=I)
//     경로는 모두 /oldcourse/_mobile/GolfRes/onepage/ 기준 상대경로.
//   - usrmemcd(회원 코드로 추정)는 매 AJAX 호출에 실려가며 셸 페이지의 숨은 필드에서 읽어와야
//     한다(로그인한 회원마다 값이 다를 수 있어 하드코딩하지 않는다 — 회원 등급별로 잔여
//     시간표가 다르다는 도메인 전제와도 일치한다).
//   - (2026-08-28, 로그인 상태에서 개발자도구 Elements 탭 → 시간표 `<table>`의 outerHTML로
//     확보 — real_timeinfo_ajax_from.asp 응답 조각) 시간표 행 구조: `<td>` 5개(번호/코스/
//     시간/일반요금/예약) 순서, 신청 가능한 행에만 `id="timeresbtn_..."`인 `<a>`가 있고 그
//     안은 `<img alt="신청[...]">`뿐이라 텍스트 "신청"은 없다 — id 접두사로 판별해야 한다.
//     **더 중요한 발견**: 요금 셀에 보이는 숫자는 취소선 처리된 "정가"이고, 실제 결제 요금
//     (회원 할인가)은 신청 링크의 `href="javascript:subcmd('R', pointid, pointtime,
//     pointname, bookgdatekor, bookghole, flagtype, punish_cd, greenfee_base, greenfee_dis,
//     ...)"` 호출 인자 중 `greenfee_dis`에만 있다. 셀 텍스트만 파싱하면 알림에 실제보다 비싼
//     요금이 들어간다 — `parseDaySlotsHtml`은 이 인자에서 가격을 뽑는다.
//   - (2026-08-28, 로그인 상태에서 개발자도구 Elements 탭 → 달력 `<table>`의 outerHTML로
//     확보 — real_calendar_ajax_view.asp 응답 조각) 각 날짜 칸(`<td>`)은 `<a
//     href="javascript:timefrom_change('YYYYMMDD','openyn','dategbn','','00','E'[,
//     토큰])">일</a>`을 담고 있고, **그 날짜의 예약 가능 여부는 `<td>`의 첫 번째 자식 div의
//     클래스가 "cm_liv"(예약 가능)인지 "cm_end"(마감/오픈전, 둘 다 동일 취급)인지로 판별한다**
//     (빈 칸은 이 div에 클래스 자체가 없다). 날짜가 없는 칸에는 `<a>`가 아예 없다. 이로써
//     날짜별 `openyn`/`dategbn`을 더 이상 추측하지 않아도 된다 — 달력 조각을 파싱할 때 각
//     날짜의 실제 값을 함께 읽어 `scanDaySlots` 호출에 그대로 재사용한다(`LaviebelleSession.
//     dayMeta` 참고). "오픈전" 전용 클래스(레이아웃의 주석 처리된 `cm_navi_open` 범례 참고)는
//     아직 실제 데이터에서 관측되지 않았지만, "cm_liv"가 아닌 모든 값은 어차피 "신청 불가"로
//     동일 취급하므로 판별 로직에 영향 없다.
//
// [아직 확인 안 된 것]
//   - login_ok.asp가 로그인 성공/실패를 어떻게 신호하는지(리다이렉트 위치, 쿠키 유무, 별도
//     에러 파라미터 등) — 처리 스크립트(common.js/loginfrom.js)가 아직 확보되지 않았다.
//
// ⚠️ 위 미확인 항목이 실제와 다르면 로그인 실패를 성공으로(또는 그 반대로) 오판할 수 있다.
// 실제 로그인 실패 시도의 응답(리다이렉트 위치/쿠키 유무)을 확보하면 `login()`을 갱신한다.
// ─────────────────────────────────────────────────────────────────────────

const BASE_URL = "https://www.lavieestbellegolfnresort.com";
const ONEPAGE_PATH = "/oldcourse/_mobile/GolfRes/onepage";
const CALENDAR_SHELL_PATH = `${ONEPAGE_PATH}/real_reservation.asp`;
const CALENDAR_AJAX_PATH = `${ONEPAGE_PATH}/real_calendar_ajax_view.asp`;
const DAY_TIME_AJAX_PATH = `${ONEPAGE_PATH}/real_timeinfo_ajax_from.asp`;
const LOGIN_PATH = "/oldcourse/_mobile/login/login_ok.asp";

export interface CalendarDayInfo {
  date: string; // YYYY-MM-DD
  bookable: boolean;
  openyn: string;
  dategbn: string;
}

// timefrom_change('20260829','2','7','','00','T','526B8EF0E03BDD21') — 앞 세 인자만 쓴다
// (pointdate, openyn, dategbn). 나머지(courseid/choice_time/atype/토큰)는 이 시점에는 필요
// 없다 — scanDaySlots가 매번 courseid="0"/choice_time="00"으로 다시 조회하기 때문이다.
const TIMEFROM_CHANGE_RE = /timefrom_change\('(\d{8})',\s*'([^']*)',\s*'([^']*)'/;

/** 달력 조각에서 날짜별 예약 가능 여부와 openyn/dategbn을 함께 뽑는다. */
export function parseCalendarDays(html: string): CalendarDayInfo[] {
  const $ = cheerio.load(html);
  const days: CalendarDayInfo[] = [];

  $('a[href^="javascript:timefrom_change("]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const match = href.match(TIMEFROM_CHANGE_RE);
    if (!match) return;
    const [, yyyymmdd, openyn, dategbn] = match;
    const date = `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

    // 날짜 칸(<td>)의 맨 바깥(첫 번째 자식) div의 클래스가 예약 가능 여부를 나타낸다 —
    // "cm_liv"(예약 가능) 대 그 외(마감/오픈전 등, 전부 "신청 불가"로 동일 취급).
    const outerDiv = $(el).closest("td").children("div").first();
    const bookable = outerDiv.hasClass("cm_liv");

    days.push({ date, bookable, openyn, dategbn });
  });

  return days;
}

export function parseCalendarHtml(html: string): string[] {
  return parseCalendarDays(html)
    .filter((d) => d.bookable)
    .map((d) => d.date);
}

export function parseDaySlotsHtml(html: string, date: string): AvailableSlot[] {
  const $ = cheerio.load(html);
  const slots: AvailableSlot[] = [];

  $("table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    // 헤더 행은 <th>만 있어 td가 0개라 자연히 걸러진다(실사이트 응답으로 확인됨).
    if (cells.length < 5) return;

    const course = $(cells[1]).text().trim(); // "OUT" | "IN"
    const time = $(cells[2]).text().trim(); // "11:43"
    if (!course || !time) return;

    // "신청" 버튼은 텍스트가 아니라 <img alt="신청[...]">를 감싼 링크라 .text()로는 못 잡는다
    // — 링크의 id 접두사(timeresbtn_)로 신청 가능 여부를 판별한다(예약 완료분은 이 링크 자체가
    // 없는 행이라 표에 나타나지 않는다 — 확인됨).
    const applyLink = $(row).find('a[id^="timeresbtn_"]');
    if (applyLink.length === 0) return;

    // 표시되는 요금 셀은 취소선 처리된 "정가"이고, 실제 결제 요금(회원 할인가)은 신청 링크의
    // subcmd(...) 호출 인자에만 담겨 있다 — 셀 텍스트만 쓰면 알림에 실제보다 비싼 요금이
    // 들어간다(위 상단 주석 참고).
    const price = extractDiscountedPrice(applyLink.attr("href") ?? "") ?? parsePriceFromCellText($(cells[3]).text());

    slots.push({ facilityId: "laviebelle-old", date, course, time, price });
  });

  return slots;
}

function parsePriceFromCellText(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, "");
  return digits ? parseInt(digits, 10) : null;
}

/**
 * 신청 링크의 href(예: javascript:subcmd('R','1','1143','OUT', '2026년 8월 29일 (토요일)',
 * '18홀', 'I', 'ABLE', '250000', '230000', '', '', 'N', 'N'))에서 실제 결제 요금(할인가)을
 * 뽑는다. subcmd 인자 순서(0-index): atype, pointid, pointtime, pointname, bookgdatekor,
 * bookghole, flagtype, punish_cd, greenfee_base(정가), greenfee_dis(할인가), ... — 9번째
 * (index 9)가 greenfee_dis다.
 */
function extractDiscountedPrice(href: string): number | null {
  const quotedArgs = href.match(/'([^']*)'/g);
  if (!quotedArgs || quotedArgs.length < 10) return null;
  const greenfeeDis = quotedArgs[9].slice(1, -1);
  const parsed = parseInt(greenfeeDis, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

// ── 예약 캘린더 셸 페이지의 숨은 폼(#listform_calender)에서 매 요청에 실어야 하는 세션값을
// 읽어온다. 실사이트 HTML로 확인된 필드명(usrmemcd, toDay)만 사용한다 — 위 상단 주석 참고. ──
interface ShellContext {
  usrmemcd: string;
  toDay: string; // YYYYMMDD
}

export function extractShellContext(html: string): ShellContext {
  const $ = cheerio.load(html);
  const usrmemcd = $("#usrmemcd").attr("value")?.trim() ?? "";
  const toDay = $("#toDay").attr("value")?.trim() ?? "";
  if (!usrmemcd || !toDay) {
    throw new TransientSiteError("예약 화면에서 필수 숨은 필드(usrmemcd/toDay)를 찾지 못했습니다.");
  }
  return { usrmemcd, toDay };
}

export function yyyymmOf(yyyymmdd: string): string {
  return yyyymmdd.slice(0, 6);
}

export function nextYyyymm(yyyymmdd: string): string {
  const year = parseInt(yyyymmdd.slice(0, 4), 10);
  const month = parseInt(yyyymmdd.slice(4, 6), 10);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}${String(nextMonth).padStart(2, "0")}`;
}

// SiteSession의 내용은 어댑터별로 다를 수 있다(types.ts 참고) — 이 어댑터는 scanBookableDates가
// 읽어낸 날짜별 openyn/dategbn을 세션 객체에 캐싱해, 뒤이은 scanDaySlots 호출이 재사용하게
// 한다. scanCycle.ts가 항상 scanBookableDates를 먼저 호출한 뒤 같은 session으로
// scanDaySlots를 호출하는 현재 순서에 의존한다 — 순서가 바뀌면(예: scanDaySlots가 먼저 호출)
// 캐시가 비어 있어 아래 fallback 기본값을 쓰게 된다.
interface LaviebelleSession extends SiteSession {
  dayMeta?: Map<string, { openyn: string; dategbn: string }>;
}

function extractCookies(response: Response): string {
  const cookies = response.headers.getSetCookie?.() ?? [];
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

async function fetchShellContext(cookie: string): Promise<ShellContext> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${CALENDAR_SHELL_PATH}`, { headers: { cookie } });
  } catch (err) {
    throw new TransientSiteError(`예약 화면 조회 중 네트워크 오류: ${(err as Error).message}`);
  }
  if (!response.ok) {
    throw new TransientSiteError(`예약 화면 조회 실패(HTTP ${response.status})`);
  }
  return extractShellContext(await response.text());
}

async function postAjaxFragment(path: string, cookie: string, body: Record<string, string>): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
  } catch (err) {
    throw new TransientSiteError(`요청 중 네트워크 오류(${path}): ${(err as Error).message}`);
  }
  if (!response.ok) {
    throw new TransientSiteError(`요청 실패(HTTP ${response.status}): ${path}`);
  }
  return response.text();
}

export const laviebelleOldCourseAdapter: SiteAdapter = {
  facilityId: "laviebelle-old",

  async login(loginId, password): Promise<SiteSession> {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${LOGIN_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ mem_id: loginId, usr_pwd: password }).toString(),
        redirect: "manual",
      });
    } catch (err) {
      throw new TransientSiteError(`로그인 요청 중 네트워크 오류: ${(err as Error).message}`);
    }

    const cookie = extractCookies(response);
    // login_ok.asp가 성공/실패를 정확히 어떻게 신호하는지 실사이트로 확인되지 않았다(상단 주석
    // 참고) — 쿠키가 발급되지 않았거나 로그인 화면으로 되돌아가는 리다이렉트를 실패 신호로
    // 우선 간주한다.
    if (!cookie || (response.status >= 300 && response.status < 400 && (response.headers.get("location") ?? "").includes("login"))) {
      throw new LoginFailedError();
    }
    if (response.status >= 500) {
      throw new TransientSiteError(`사이트 오류(HTTP ${response.status})`);
    }

    return { cookie };
  },

  async scanBookableDates(session): Promise<string[]> {
    const ctx = await fetchShellContext(session.cookie);
    const thisMonth = yyyymmOf(ctx.toDay);
    const nextMonth = nextYyyymm(ctx.toDay);

    // 실사이트는 화면에 두 달치 달력을 보여준다(calnum=1: 이번 달, calnum=2: 다음 달).
    const [fragment1, fragment2] = await Promise.all([
      postAjaxFragment(CALENDAR_AJAX_PATH, session.cookie, {
        golfrestype: "real",
        schDate: thisMonth,
        usrmemcd: ctx.usrmemcd,
        toDay: ctx.toDay,
        calnum: "1",
      }),
      postAjaxFragment(CALENDAR_AJAX_PATH, session.cookie, {
        golfrestype: "real",
        schDate: nextMonth,
        usrmemcd: ctx.usrmemcd,
        toDay: ctx.toDay,
        calnum: "2",
      }),
    ]);

    const days = [...parseCalendarDays(fragment1), ...parseCalendarDays(fragment2)];

    // scanDaySlots가 날짜별 실제 openyn/dategbn을 재사용할 수 있도록 세션에 캐싱한다(위
    // LaviebelleSession 주석 참고).
    (session as LaviebelleSession).dayMeta = new Map(
      days.map((d) => [d.date, { openyn: d.openyn, dategbn: d.dategbn }])
    );

    return days.filter((d) => d.bookable).map((d) => d.date);
  },

  async scanDaySlots(session, date): Promise<AvailableSlot[]> {
    const ctx = await fetchShellContext(session.cookie);
    const pointdate = date.replace(/-/g, "");
    const meta = (session as LaviebelleSession).dayMeta?.get(date);

    const fragment = await postAjaxFragment(DAY_TIME_AJAX_PATH, session.cookie, {
      golfrestype: "real",
      courseid: "0",
      usrmemcd: ctx.usrmemcd,
      pointdate,
      // scanBookableDates가 먼저 이 날짜의 실제 openyn/dategbn을 읽어뒀으면 그 값을 쓴다.
      // 못 찾은 경우(예: DB에는 남아있지만 이번 달력 조회 범위 밖으로 밀려난 날짜)에만 "오늘"
      // 기본값으로 대체한다 — 이 fallback 경로는 실사이트로 검증되지 않았다.
      openyn: meta?.openyn ?? "1",
      dategbn: meta?.dategbn ?? "6",
      choice_time: "00",
      pointdatechk: "",
      inputtype: "I",
    });

    return parseDaySlotsHtml(fragment, date);
  },

  buildDeepLink(): string {
    // 날짜별 직접 링크가 실사이트에서 실제로 가능한지 확인되지 않아, 현재는 안전한 기본값으로
    // 캘린더 셸 화면 URL만 반환한다. 실사이트가 날짜를 쿼리 파라미터로 받는 구조임이 확인되면
    // 이 함수가 해당 날짜의 URL을 직접 구성하도록 바꾼다.
    return `${BASE_URL}${CALENDAR_SHELL_PATH}`;
  },
};
