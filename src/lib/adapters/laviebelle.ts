import * as cheerio from "cheerio";
import type { AvailableSlot, SiteAdapter, SiteSession } from "@/lib/adapters/types";
import { LoginFailedError, TransientSiteError } from "@/lib/adapters/types";

// ─────────────────────────────────────────────────────────────────────────
// 라비에벨 올드코스 사이트-어댑터
//
// [실사이트 HTML로 확인된 것 — 2026-08-28, 로그인 전 상태의 예약 화면 "페이지 소스 보기"로 확보]
//   - 로그인 폼(퀵로그인, #frmQuickLogin): method=POST,
//     action=/oldcourse/_mobile/login/login_ok.asp, 필드명 mem_id(아이디/휴대폰번호),
//     usr_pwd(비밀번호).
//   - 예약 캘린더 화면(real_reservation.asp) 자체는 달력·시간표 데이터를 담고 있지 않다. 화면
//     로드시 인라인 스크립트가 숨은 폼을 채운 뒤 jQuery AJAX POST로 별도 .asp 엔드포인트를
//     불러 그 응답 HTML을 그대로 화면에 끼워 넣는 구조다(서버 렌더링 + 클라이언트 조립). 즉 이
//     어댑터는 "셸 페이지 GET → 그 안의 숨은 폼 값으로 AJAX 엔드포인트 POST" 2단계로 동작해야
//     한다:
//       1) 달력: POST ./real_calendar_ajax_view.asp
//          (필드: golfrestype=real, schDate=YYYYMM, usrmemcd, toDay=YYYYMMDD, calnum=1|2)
//       2) 날짜별 시간표: POST ./real_timeinfo_ajax_from.asp
//          (필드: golfrestype=real, courseid, usrmemcd, pointdate=YYYYMMDD, openyn, dategbn,
//          choice_time, pointdatechk, inputtype=I)
//     경로는 모두 /oldcourse/_mobile/GolfRes/onepage/ 기준 상대경로.
//   - usrmemcd(회원 코드로 추정)는 매 AJAX 호출에 실려가며 셸 페이지의 숨은 필드에서 읽어와야
//     한다(로그인한 회원마다 값이 다를 수 있어 하드코딩하지 않는다 — 회원 등급별로 잔여
//     시간표가 다르다는 도메인 전제와도 일치한다).
//
// [아직 확인 안 된 것]
//   - 위 두 AJAX 엔드포인트가 실제로 돌려주는 응답 HTML *조각*의 태그/클래스 구조(달력 셀의
//     예약가능/마감 표시 방식, 시간표 행의 코스/시간/요금/신청버튼 마크업). 이 셸 페이지는
//     로그인 전 상태로 캡처된 것이라 조각 자체는 담겨 있지 않았다 — parseCalendarHtml /
//     parseDaySlotsHtml의 선택자는 여전히 스크린샷 기반 추정치다.
//   - 날짜별 시간표 조회에 필요한 openyn/dategbn 값을 날짜마다 어떻게 알아내는지. 셸 페이지의
//     초기 기본값(openyn=1, dategbn=6)은 "오늘"에 대한 값이라 다른 날짜에 그대로 맞는다는
//     보장이 없다 — 달력 조각의 각 날짜 셀이 이 값을 함께 들고 있을 것으로 추정되나(예:
//     timefrom_change(pointdate, openyn, dategbn, ...) 호출부 존재), 달력 조각 자체를 아직
//     못 봐서 확정할 수 없다. 지금은 오늘 값을 모든 날짜에 재사용하는 임시 대응이며, 날짜별로
//     실제 값이 다르면 사이트가 빈 시간표를 돌려줄 수 있다.
//   - login_ok.asp가 로그인 성공/실패를 어떻게 신호하는지(리다이렉트 위치, 쿠키 유무, 별도
//     에러 파라미터 등) — 처리 스크립트(common.js/loginfrom.js)가 이번 캡처에 포함되지 않았다.
//
// ⚠️ 위 미확인 항목이 실제와 다르면 스캔이 조용히 빈 결과를 낼 수 있다. 브라우저 개발자도구의
// Network 탭에서(페이지 소스 보기가 아니라) 실제 AJAX 응답 HTML과, 달력에서 날짜를 클릭했을 때
// 호출되는 timefrom_change의 실제 인자값을 확보하면 이 파일과
// tests/fixtures/laviebelle-*.html을 함께 갱신한다.
// ─────────────────────────────────────────────────────────────────────────

const BASE_URL = "https://www.lavieestbellegolfnresort.com";
const ONEPAGE_PATH = "/oldcourse/_mobile/GolfRes/onepage";
const CALENDAR_SHELL_PATH = `${ONEPAGE_PATH}/real_reservation.asp`;
const CALENDAR_AJAX_PATH = `${ONEPAGE_PATH}/real_calendar_ajax_view.asp`;
const DAY_TIME_AJAX_PATH = `${ONEPAGE_PATH}/real_timeinfo_ajax_from.asp`;
const LOGIN_PATH = "/oldcourse/_mobile/login/login_ok.asp";

export function parseCalendarHtml(html: string): string[] {
  const $ = cheerio.load(html);
  const bookableDates: string[] = [];
  // 달력은 월별 테이블(예: 2026.08, 2026.09)이 여러 개 있고, 각 월 헤더 다음에 요일 테이블이 온다.
  $(".gres-calendar-month").each((_, monthEl) => {
    const monthLabel = $(monthEl).find(".gres-calendar-month-label").text().trim(); // 예: "2026.08"
    const [year, month] = monthLabel.split(".").map((n) => parseInt(n, 10));
    if (!year || !month) return;

    $(monthEl)
      .find("td.gres-day--bookable[data-day]")
      .each((_, dayEl) => {
        const day = parseInt($(dayEl).attr("data-day") ?? "", 10);
        if (!day) return;
        const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        bookableDates.push(date);
      });
  });
  return bookableDates;
}

export function parseDaySlotsHtml(html: string, date: string): AvailableSlot[] {
  const $ = cheerio.load(html);
  const slots: AvailableSlot[] = [];

  $("table.gres-time-table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 4) return;
    const course = $(cells[1]).text().trim(); // "OUT" | "IN"
    const time = $(cells[2]).text().trim(); // "07:26"
    const priceText = $(cells[3]).text().replace(/[^0-9]/g, "");
    const price = priceText ? parseInt(priceText, 10) : null;
    // "신청" 버튼이 있는 행만 지금 신청 가능한 슬롯이다(예약 완료분은 행 자체가 없음 — 확인됨).
    const hasApplyButton = $(row).find("button, a").filter((_, el) => $(el).text().includes("신청")).length > 0;
    if (!course || !time || !hasApplyButton) return;
    slots.push({ facilityId: "laviebelle-old", date, course, time, price });
  });

  return slots;
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

    return parseCalendarHtml(fragment1 + fragment2);
  },

  async scanDaySlots(session, date): Promise<AvailableSlot[]> {
    const ctx = await fetchShellContext(session.cookie);
    const pointdate = date.replace(/-/g, "");

    const fragment = await postAjaxFragment(DAY_TIME_AJAX_PATH, session.cookie, {
      golfrestype: "real",
      courseid: "0",
      usrmemcd: ctx.usrmemcd,
      pointdate,
      // TODO(실사이트 확인 필요): 날짜별 실제 openyn/dategbn을 못 구해서(상단 주석 참고) 셸
      // 페이지의 "오늘" 기본값을 모든 날짜에 재사용하는 임시 대응이다.
      openyn: "1",
      dategbn: "6",
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
