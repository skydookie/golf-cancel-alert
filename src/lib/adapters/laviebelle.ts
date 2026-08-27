import * as cheerio from "cheerio";
import type { AvailableSlot, SiteAdapter, SiteSession } from "@/lib/adapters/types";
import { LoginFailedError, TransientSiteError } from "@/lib/adapters/types";

// ─────────────────────────────────────────────────────────────────────────
// 라비에벨 골드코스 사이트-어댑터
//
// 파싱 대상 화면 두 개는 실제 사용자가 로그인해서 캡처해준 스크린샷을 근거로 만들었다:
//   1) 예약 캘린더: /oldcourse/_mobile/GolfRes/onepage/real_reservation.asp
//      — 월별 달력에 "예약"(신청 가능한 시간대가 있음) / "마감" / "오픈전" 이 다른 색으로 표시.
//   2) 날짜별 시간표: 캘린더에서 날짜를 클릭하면 같은 URL이 그 날짜의 코스/시간/요금/신청버튼
//      표를 보여준다. 예약 완료된 시간대는 이 표에 아예 나타나지 않는다(확인됨).
//
// ⚠️ 중요: 위 두 화면의 실제 HTML 태그/클래스명과, 로그인 화면 자체의 폼 필드명/제출 URL은
// 스크린샷만으로는 확정할 수 없어 아직 실사이트로 검증되지 않았다. 아래 선택자(selector)와
// LOGIN_PATH/필드명은 흔한 ASP 예약 시스템 구조를 참고한 "구현 착수용 추정치"다.
// 실사이트에 접속해 브라우저 개발자도구로 실제 구조를 확인한 뒤 이 파일의
// parseCalendarHtml / parseDaySlotsHtml / login()의 선택자·필드명만 맞춰 조정하면 된다 —
// 그 외 시스템(감시 엔진, 알림, 화면)은 이 어댑터의 인터페이스에만 의존하므로 영향받지 않는다.
// ─────────────────────────────────────────────────────────────────────────

const BASE_URL = "https://www.lavieestbellegolfnresort.com";
const OLD_COURSE_PATH = "/oldcourse";
const CALENDAR_PATH = `${OLD_COURSE_PATH}/_mobile/GolfRes/onepage/real_reservation.asp`;
// TODO(실사이트 확인 필요): 실제 로그인 폼의 제출 경로/필드명으로 교체할 것.
const LOGIN_PATH = `${OLD_COURSE_PATH}/_mobile/memberInfor/login_proc.asp`;

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

function extractCookies(response: Response): string {
  const cookies = response.headers.getSetCookie?.() ?? [];
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

export const laviebelleOldCourseAdapter: SiteAdapter = {
  facilityId: "laviebelle-old",

  async login(loginId, password): Promise<SiteSession> {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${LOGIN_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ id: loginId, pwd: password }).toString(),
        redirect: "manual",
      });
    } catch (err) {
      throw new TransientSiteError(`로그인 요청 중 네트워크 오류: ${(err as Error).message}`);
    }

    const cookie = extractCookies(response);
    // 로그인 실패 시 사이트가 로그인 폼으로 되돌리거나(302 → login 페이지), 쿠키를 발급하지 않는
    // 것으로 판단한다. 정확한 실패 판별 방식은 실사이트 확인 후 조정 필요(위 주석 참고).
    if (!cookie || (response.status >= 300 && response.status < 400 && (response.headers.get("location") ?? "").includes("login"))) {
      throw new LoginFailedError();
    }
    if (response.status >= 500) {
      throw new TransientSiteError(`사이트 오류(HTTP ${response.status})`);
    }

    return { cookie };
  },

  async scanBookableDates(session): Promise<string[]> {
    const response = await fetch(`${BASE_URL}${CALENDAR_PATH}`, {
      headers: { cookie: session.cookie },
    });
    if (!response.ok) {
      throw new TransientSiteError(`캘린더 조회 실패(HTTP ${response.status})`);
    }
    return parseCalendarHtml(await response.text());
  },

  async scanDaySlots(session, date): Promise<AvailableSlot[]> {
    const response = await fetch(`${BASE_URL}${CALENDAR_PATH}?date=${date}`, {
      headers: { cookie: session.cookie },
    });
    if (!response.ok) {
      throw new TransientSiteError(`시간표 조회 실패(HTTP ${response.status})`);
    }
    return parseDaySlotsHtml(await response.text(), date);
  },

  buildDeepLink(date): string {
    // 날짜별 직접 링크가 실사이트에서 실제로 가능한지 확인되지 않아, 현재는 안전한 기본값으로
    // 캘린더 메인 화면 URL만 반환한다. 실사이트가 날짜를 쿼리 파라미터로 받는 구조임이 확인되면
    // 이 함수가 해당 날짜의 URL을 직접 구성하도록 바꾼다.
    return `${BASE_URL}${CALENDAR_PATH}`;
  },
};
